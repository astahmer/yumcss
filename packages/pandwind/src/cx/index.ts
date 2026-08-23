/**
 * `cx` — last-wins class merge across every pandwind surface.
 *
 * ```ts
 * import { createTw } from "pandwind/tw";
 * import { createCss } from "pandwind/css";
 * import { createCx } from "pandwind/cx";
 *
 * const tw = createTw<WindVariants>({ variants, conflicts, compose });
 * const css = createCss();
 * const cx = createCx({ css, variants, conflicts, compose });
 *
 * cx(tw({ bg: "red-500" }), "px-4", css.class({ color: "blue" }), "bg-blue-500");
 * // -> "px-4 bg-blue-500 color__blue"   (bg-red-500 lost to bg-blue-500)
 * ```
 *
 * Merge semantics match the generated tw conflict map (variant-scoped,
 * compose-aware, last-wins per canonical CSS property), so a single
 * className built from raw class strings, `tw()` output and css atoms never
 * leaves two classes fighting over the same property. Multi-property
 * utilities survive partial overrides: `cx("text-xs", "leading-tight")`
 * keeps both (only the line-height half of `text-xs` is superseded), while
 * a full override (`text-sm`) drops it — tailwind-merge parity. Arbitrary
 * values are disambiguated by value shape (`border-[#eee]` conflicts with
 * colors, `border-[3px]` with widths; typed `[prop:value]` forms their own
 * per-property groups). Tailwind classes are parsed against the generated
 * map; css atoms are resolved through the engine's atom registry (see
 * `css/atoms.ts`). Anything that can't be resolved is kept verbatim, deduplicated by exact string only — when in
 * doubt, nothing is dropped.
 *
 * Performance notes: the expensive per-token work (variant split, conflict
 * map parse, signature construction) is memoized per token. The tw cache is
 * safe because `conflicts`/`compose` are fixed at createCx time. The css
 * atom lookup itself stays live on every call — the registry grows lazily
 * as css() compiles new declarations — only the flattened-key -> signature
 * derivation is cached. Cached signature arrays are shared across calls and
 * must stay immutable; `push` only ever reads them.
 */
import { ATOM_REGISTRY, type AtomRegistry } from "../css/atoms.ts";
import type { CssFn } from "../css/create-css.ts";
import { dashCase } from "../css/hash.ts";
import type { TwComposeMeta, TwConflictsMeta, TwVariantsMeta } from "../tw/compile.ts";

export interface CxOptions {
	variants?: TwVariantsMeta;
	conflicts?: TwConflictsMeta;
	compose?: TwComposeMeta;
	/**
	 * A createCss / createDesignCss instance. Its atom registry lets cx
	 * resolve css.class() strings to the properties they set, so they merge
	 * against tw classes and raw strings.
	 */
	css?: CssFn<never>;
}

/** A css() compiled map (`{ color: "1nmpgqu" }`), or a class string. */
export type CxInput = string | Record<string, string> | false | null | undefined;

/**
 * Memoization cap per cx instance. Real apps use a finite class vocabulary;
 * past the cap the cache resets (transparent to behavior, bounded memory).
 */
const SIGS_CACHE_CAP = 8192;
/** Whole-input result cache cap (matches tailwind-merge's own LRU strategy). */
const RESULT_CACHE_CAP = 4096;

const normalizeCondition = (part: string): string => {
	// `_hover` -> `hover`, `groupHover` -> `group-hover`, `sm` -> `sm`.
	// The design vocabulary mirrors tw variant names, just underscored and
	// camelCased; dash-casing aligns them with the tw prefix chain.
	return dashCase(part.replace(/^_/, ""));
};

/**
 * A css atom's flattened key (`_hover__color`) -> tw-style merge signatures
 * (`["hover|color"]`). `__` separates conditions (and the trailing property),
 * mirroring the stylesheet's `decodeAtomicPath`.
 */
const signatureFromCssKey = (key: string): string[] => {
	const parts = key.split("__");
	const prop = dashCase(parts[parts.length - 1]!);
	const conditions = parts.slice(0, -1).map(normalizeCondition);
	// Same shape as the tw compile signatures (`${prefix}|${prop}`), so base
	// scope is `|color`, `sm:hover` scope is `sm:hover|color`.
	return [`${conditions.join(":")}|${prop}`];
};

/**
 * Split `sm:hover:bg-blue-500` into its variant chain and the utility class.
 * `:` inside `[...]` arbitrary values is ignored (`bg-[url(https://x)]`).
 */
const splitVariants = (token: string): { prefix: string; rest: string } => {
	let depth = 0;
	for (let i = 0; i < token.length; i++) {
		const char = token[i];
		if (char === "[") depth++;
		else if (char === "]") depth--;
		else if (char === ":" && depth === 0) {
			return { prefix: token.slice(0, i), rest: token.slice(i + 1) };
		}
	}
	return { prefix: "", rest: token };
};

/** True for typed arbitrary values (`[color:var(--x)]`, `[url(...)]`). */
const TYPED_ARBITRARY = /^\[([a-z-]+):([^:]+)\]$/;

/** Value shapes for arbitrary-value conflict disambiguation. */
const COLOR_LIKE = /^(#|rgb|hsl|oklch|lab|lch|color\()/;
const LENGTH_LIKE = /^-?(\d|\.)([\d.]*[a-z%]+)?$|^-?\d|px$|rem$|em$|%$|calc\(|var\(--/;

/**
 * Strip a trailing opacity modifier (`red-500/50` -> `red-500`) without a
 * regex — this runs on every candidate lookup in the hot parse path.
 * Mirrors /\/\d+$/: a "/" followed by one or more ASCII digits at the end.
 */
const stripOpacityModifier = (value: string): string => {
	const slash = value.lastIndexOf("/");
	if (slash <= 0 || slash === value.length - 1) return value;
	for (let i = slash + 1; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code < 48 || code > 57) return value;
	}
	return value.slice(0, slash);
};

/**
 * Directional conflict expansion (tailwind-merge parity): when a NEW token
 * carries the key sig, it additionally kills EARLIER tokens holding the
 * listed sigs — but never the reverse (`text-sm` supersedes an earlier
 * `leading-*`; a later `leading-*` does not supersede `text-xs`). Scoped
 * per variant prefix at push time.
 */
const KILLS_ALSO: ReadonlyMap<string, readonly string[]> = new Map([
	["font-size", ["line-height"]],
]);

/**
 * A token's compiled merge plan: signatures interned to small integers.
 * `all` holds the primary signatures followed by the pre-expanded
 * directional kills (push must process them in exactly that order).
 * Interning means the hot push path hashes only small integers (no string
 * slicing/concat for KILLS_ALSO, no long composite keys in the owner index),
 * and the directional expansion — previously recomputed on every push via
 * slice/indexOf/map lookups — is baked once per unique token. An entry stays
 * alive while any of its first `primaries` ids is unowned.
 */
interface CompiledSigs {
	/** Primary ids then kill ids, in mandatory processing order. */
	all: number[];
	/** How many of `all` are primaries (live-count basis for an entry). */
	primaries: number;
}

/**
 * Parse a utility class (`bg-sky-600`, `-top-4`, `flex`, `w-[3.5rem]`) into
 * its generated-map key and value. Splitting right-to-left prefers the
 * longest matching key (`translate-x-1/2` -> `translate-x`, not `translate`),
 * mirroring how the runtime looks up its own dash-cased keys. Returns null
 * when the class has no generated entry — the caller keeps it opaque.
 */
const parseUtility = (
	rest: string,
	conflicts: TwConflictsMeta,
): { utility: string; value: string } | null => {
	if (rest.length === 0) return null;
	const whole = conflicts[rest];
	if (whole !== undefined && (whole[""] !== undefined || whole["*"] !== undefined)) {
		return { utility: rest, value: "" };
	}
	for (let i = rest.length - 1; i >= 0; i--) {
		if (rest[i] !== "-") continue;
		const utility = rest.slice(0, i);
		const value = rest.slice(i + 1);
		if (utility === "") continue;
		const byValue = conflicts[utility];
		if (byValue === undefined) continue;
		if (
			byValue[value] !== undefined ||
			byValue[stripOpacityModifier(value)] !== undefined ||
			byValue["*"] !== undefined
		) {
			return { utility, value };
		}
	}
	return null;
};

const signatureFromTwClass = (
	token: string,
	conflicts: TwConflictsMeta,
	compose: ReadonlySet<string> | undefined,
): string[] | null => {
	const { prefix, rest } = splitVariants(token);

	// Typed arbitrary `[prop:value]` — its own conflict group per property,
	// disjoint from theme utilities (`px-4` and `[padding-left:2px]`
	// coexist, exactly like tailwind-merge), but two arbitraries of the
	// same property collide.
	if (rest.startsWith("[")) {
		const typed = TYPED_ARBITRARY.exec(rest);
		if (typed !== null) {
			const prop = typed[1]!;
			// Custom properties (`[--my-var:…]`) have no generated group.
			return prop.startsWith("--") ? null : [`${prefix}|${dashCase(prop)}`];
		}
	}

	const parsed = parseUtility(rest, conflicts);

	if (parsed === null) {
		// Whole-key utility with no "" / "*" property set — opaque unless
		// composed.
		const group = conflicts[rest];
		if (group === undefined) return null;
		if (compose?.has(rest)) return [`${prefix}|~${rest}`];
		const staticProps = group[""] ?? group["*"];
		return staticProps === undefined ? null : staticProps.map((p) => `${prefix}|${p}`);
	}

	const { utility, value } = parsed;

	if (compose?.has(utility)) {
		return [`${prefix}|~${utility}`];
	}

	const byValue = conflicts[utility]!;

	if (value === "") {
		// Static whole-key utilities: bare `border` keeps only the width half
		// of the generated group (tailwind-merge parity: `border-solid`
		// coexists with `border`, and each supersedes plain `border`); bare
		// `outline` behaves as plain outline-width; `transition` carries
		// duration + timing-function in its generated group, but only its
		// transition-property half forms a conflict group (`duration-150`
		// coexists in both orders).
		if (utility === "border") {
			return (byValue["*"] ?? []).filter((p) => !p.endsWith("-style")).map((p) => `${prefix}|${p}`);
		}
		if (utility === "outline") return [`${prefix}|outline-width`];
		if (utility === "transition" && byValue["*"]?.includes("transition-property")) {
			return [`${prefix}|transition-property`];
		}
		const staticProps = byValue[""] ?? byValue["*"];
		return staticProps === undefined ? null : staticProps.map((p) => `${prefix}|${p}`);
	}

	// Refinements for arbitrary values the generated map routes into a
	// coarse "*" group — disambiguated by what the value IS:
	if (value.startsWith("[")) {
		if (utility === "bg") {
			// `bg-[url(...)]` is a background-image — coexists with colors
			// (`twMerge('bg-red-500 bg-[url(..)]')` keeps both).
			if (value.slice(1).startsWith("url(")) return [`${prefix}|background-image`];
		}
		if (utility === "text") {
			// `text-[16px]` is a font-size, `text-[#000]`/`text-[rgba(..)]`
			// a color — tailwind-merge splits them the same way by shape.
			return [`${prefix}|${COLOR_LIKE.test(value.slice(1)) ? "color" : "font-size"}`];
		}
		if (/^border(-[trbl])?$/.test(utility)) {
			// `border-[3px]` is a width, `border-[#eee]` a color; reuse the
			// map's own color props so arbitrary and named colors land in the
			// SAME conflict group (`border-b-[#eeb524]` vs `border-b-black`).
			if (LENGTH_LIKE.test(value.slice(1, -1))) return [`${prefix}|${utility}-width`];
			const colorProps =
				byValue["black"] ??
				byValue["current"] ??
				Object.values(byValue).find((props) => props.every((p) => p.endsWith("-color")));
			if (colorProps !== undefined) return colorProps.map((p) => `${prefix}|${p}`);
			return [`${prefix}|${utility}-color`];
		}
	}

	let props = byValue[value] ?? byValue[stripOpacityModifier(value)] ?? byValue["*"];
	if (props === undefined || props.length === 0) return null;
	// Generated couplings the runtime treats as independent conflict groups
	// (tailwind-merge parity): `text-*` sizes couple font-size + default
	// line-height — a later `leading-*` must NOT supersede the size;
	// border widths must not claim the style halves of the coarse "*" group
	// (unknown width values like `border-2` land there).
	if (utility === "text" && props.includes("font-size") && props.includes("line-height")) {
		props = ["font-size"];
	} else if (
		value !== "" &&
		/^border(-[trbl])?$/.test(utility) &&
		byValue[value] === undefined &&
		props.some((p) => p.endsWith("-style"))
	) {
		props = props.filter((p) => !p.endsWith("-style"));
	} else if (
		utility === "transition" &&
		props.includes("transition-property") &&
		props.length > 1
	) {
		props = ["transition-property"];
	}
	return props.map((prop) => `${prefix}|${prop}`);
};

/**
 * Create the app's `cx` merge function, bound to the same generated tw
 * metadata and css engine the rest of the app uses.
 */
export function createCx(
	options: CxOptions = {},
): (...inputs: Array<CxInput | CxInput[]>) => string {
	const conflicts = options.conflicts;
	const composeSet = options.compose === undefined ? undefined : new Set(options.compose);
	const atoms: AtomRegistry | undefined = options.css
		? (options.css as CssFn<never> & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY]
		: undefined;

	// Per-token memoization. `twSigs` maps a raw token to its compiled merge
	// plan (or `null` = opaque); `atomSigs` maps a css atom's flattened
	// registry key to its compiled plan. Both hold immutable objects shared
	// with `outPlan`.
	const twSigs = new Map<string, CompiledSigs | null>();
	const atomSigs = new Map<string, CompiledSigs>();
	/** Whole-input split memo: splitting depends only on the string itself. */
	const tokensCache = new Map<string, string[]>();
	/** Signature-string interning: the push path only ever sees integers. */
	const sigIds = new Map<string, number>();
	const idOf = (sig: string): number => {
		let id = sigIds.get(sig);
		if (id === undefined) {
			id = sigIds.size;
			sigIds.set(sig, id);
		}
		return id;
	};
	/** Bake KILLS_ALSO expansions into the cached plan (same prefix rule). */
	const compileSigs = (raw: string[] | null): CompiledSigs | null => {
		if (raw === null || raw.length === 0) return null;
		const all: number[] = [];
		// All signatures of one token share the variant prefix; the directional
		// expansion is keyed by the bare prop part under that same prefix.
		const scopeEnd = raw[0]!.indexOf("|");
		const prefix = raw[0]!.slice(0, scopeEnd + 1);
		for (const sig of raw) {
			all.push(idOf(sig));
			const expansion = KILLS_ALSO.get(sig.slice(prefix.length));
			if (expansion !== undefined) {
				for (const killed of expansion) all.push(idOf(`${prefix}${killed}`));
			}
		}
		return { all, primaries: raw.length };
	};

	// Merge state, reused across calls. Parallel arrays instead of objects —
	// `outCls[i]` is blanked in place when a later token overrides the same
	// signature, mirroring the previous `{ cls, sigs }` records.
	const outCls: string[] = [];
	const outPlan: Array<CompiledSigs | null> = [];
	/** Live (not-yet-overridden) signature count per outCls entry. */
	const outLive: number[] = [];
	/** Interned signature id -> index of the live entry holding it. */
	const owners = new Map<number, number>();
	const opaque = new Set<string>();
	const parts: string[] = [];

	/**
	 * Whole-input result cache — the single biggest lever for real-world
	 * repeat rates, and the same strategy tailwind-merge itself uses (its
	 * benchmarked numbers ride an LRU over full class strings). Only
	 * pure-string argument lists are cached. Correctness under a growing
	 * atom registry: entries record the registry size at compute time; a hit
	 * with a different size re-computes (the registry only grows, so a stale
	 * entry could ONLY have missed atoms — never mis-resolved ones).
	 */
	const resultCache = new Map<string, { gen: number; out: string }>();

	const cachedCompile = (
		cache: Map<string, CompiledSigs | null>,
		key: string,
		compile: () => CompiledSigs | null,
	): CompiledSigs | null => {
		let compiled = cache.get(key);
		if (compiled === undefined) {
			compiled = compile();
			if (cache.size >= SIGS_CACHE_CAP) cache.clear();
			cache.set(key, compiled);
		}
		return compiled;
	};
	const resolveTwSigs = (token: string): CompiledSigs | null =>
		cachedCompile(twSigs, token, () =>
			compileSigs(signatureFromTwClass(token, conflicts!, composeSet)),
		);
	const resolveAtomSigs = (key: string): CompiledSigs =>
		cachedCompile(atomSigs, key, () => compileSigs(signatureFromCssKey(key)))!;

	const push = (cls: string, plan: CompiledSigs | null) => {
		if (cls === "") return;
		if (plan === null) {
			if (opaque.has(cls)) return;
			opaque.add(cls);
			outCls.push(cls);
			outPlan.push(null);
			// Keep outLive index-aligned with outCls/outPlan (opaque entries
			// are never referenced by owners, but positions must match).
			outLive.push(0);
			return;
		}
		// Partial survival (tailwind-merge parity): a later token matching
		// ONE of a multi-property token's signatures only kills that
		// signature — the class survives on its remaining ones (`text-xs`
		// survives `leading-tight`; `text-sm` kills it). An entry is blanked
		// only when its LAST live signature is overridden. The plan's ids run
		// primaries-first then pre-expanded directional kills — the exact
		// order the previous implementation applied them.
		for (const sid of plan.all) {
			const previous = owners.get(sid);
			if (previous === undefined) continue;
			owners.delete(sid);
			if (--outLive[previous]! === 0) outCls[previous] = "";
		}
		const index = outCls.length;
		outCls.push(cls);
		outPlan.push(plan);
		outLive.push(plan.primaries);
		for (let i = 0; i < plan.primaries; i++) owners.set(plan.all[i]!, index);
	};

	/**
	 * Tokenize one input string into its token list (memoized — splitting
	 * depends only on the string, so the list can be shared across calls).
	 * ASCII whitespace is split manually — the regex path is only needed for
	 * non-ASCII characters (JS `\s` also matches unicode spaces like
	 * \u00a0), keeping output byte-identical while avoiding regex + slice
	 * allocation on the hot path.
	 */
	const tokenize = (input: string): string[] => {
		const cached = tokensCache.get(input);
		if (cached !== undefined) return cached;
		const tokens: string[] = [];
		const len = input.length;
		let asciiOnly = true;
		for (let s = 0; s < len; s++) {
			if (input.charCodeAt(s) > 126) {
				asciiOnly = false;
				break;
			}
		}
		if (!asciiOnly) {
			// Unicode whitespace possible anywhere: spec-equivalent regex.
			for (const token of input.split(/\s+/)) {
				if (token !== "") tokens.push(token);
			}
		} else {
			let start = -1;
			let i = 0;
			while (i <= len) {
				let isSep: boolean;
				if (i === len) {
					isSep = true;
				} else {
					const code = input.charCodeAt(i);
					isSep =
						code === 32 || code === 9 || code === 10 || code === 11 || code === 12 || code === 13;
				}
				if (isSep) {
					if (start !== -1) {
						tokens.push(input.slice(start, i));
						start = -1;
					}
				} else if (start === -1) {
					start = i;
				}
				i++;
			}
		}
		if (tokensCache.size >= SIGS_CACHE_CAP) tokensCache.clear();
		tokensCache.set(input, tokens);
		return tokens;
	};

	const pushToken = (token: string) => {
		const atomKey = atoms?.get(token);
		if (atomKey !== undefined) {
			push(token, resolveAtomSigs(atomKey));
			return;
		}
		if (conflicts !== undefined) {
			push(token, resolveTwSigs(token));
			return;
		}
		push(token, null);
	};

	const pushInput = (input: CxInput) => {
		if (typeof input === "string") {
			const tokens = tokenize(input);
			for (let i = 0; i < tokens.length; i++) pushToken(tokens[i]!);
			return;
		}
		if (typeof input === "object" && input !== null) {
			for (const [key, atom] of Object.entries(input)) {
				push(atom, resolveAtomSigs(key));
			}
		}
	};

	const cx = (...inputs: Array<CxInput | CxInput[]>): string => {
		// Whole-input cache: only when every top-level input is a string (no
		// arrays to flatten, no css-atom objects whose resolution depends on
		// live registry state beyond the generation guard).
		let cacheKey = "";
		const gen = atoms?.size ?? 0;
		if (inputs.length > 0 && inputs.every((input) => typeof input === "string")) {
			cacheKey = inputs.join("\u0000");
			const cached = resultCache.get(cacheKey);
			if (cached !== undefined && cached.gen === gen) {
				// LRU touch: re-insert so the entry counts as recently used.
				resultCache.delete(cacheKey);
				resultCache.set(cacheKey, cached);
				return cached.out;
			}
		}

		outCls.length = 0;
		outPlan.length = 0;
		outLive.length = 0;
		owners.clear();
		opaque.clear();
		for (const input of inputs) {
			if (Array.isArray(input)) {
				for (const nested of input) pushInput(nested);
			} else {
				pushInput(input);
			}
		}
		parts.length = 0;
		for (let i = 0; i < outCls.length; i++) {
			if (outCls[i] !== "") parts.push(outCls[i]!);
		}
		const out = parts.join(" ");

		if (cacheKey !== "") {
			if (resultCache.size >= RESULT_CACHE_CAP) {
				// Evict oldest (insertion order = least-recently-used, since hits re-insert).
				const oldest = resultCache.keys().next().value;
				if (oldest !== undefined) resultCache.delete(oldest);
			}
			resultCache.set(cacheKey, { gen, out });
		}
		return out;
	};

	return cx;
}
