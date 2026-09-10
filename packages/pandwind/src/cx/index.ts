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
import { VARS_ATOMS } from "../css/vars-carrier.ts";
import type { VarAtom, VarsOutput } from "../css/var-compiler.ts";
import type { TwComposeMeta, TwConflictsMeta, TwVariantsMeta } from "../tw/compile.ts";

/**
 * Metadata and CSS registry used by {@link createCx} to resolve conflicts.
 *
 * The generated `tw` metadata is optional: without it, `cx` still combines
 * strings, compiled CSS maps, and variable carriers, but opaque strings are
 * preserved rather than guessed at. Pass the same `css` instance that created
 * CSS atoms when those atoms should participate in last-wins merging.
 *
 * @example Sharing a CSS atom registry with `cx`
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { createCx } from "pandwind/cx";
 *
 * const css = createCss();
 * const cx = createCx({ css });
 *
 * const className = cx("rounded", css.class({ color: "tomato" }), false);
 * ```
 *
 * @category composition
 * @since 0.1.0
 */
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

/**
 * A class string, compiled CSS map, or `css.vars()` carrier accepted by
 * {@link createCx}.
 *
 * Falsey values are ignored so conditional class composition can stay inside
 * one call. Unknown strings are kept verbatim; only metadata that was
 * explicitly supplied to the `cx` instance can participate in conflict
 * resolution.
 *
 * @category composition
 * @since 0.1.0
 */
export type CxInput = string | Record<string, string> | VarsOutput | false | null | undefined;

/** Re-exported for consumers threading vars outputs through custom helpers. */
export type { VarsOutput, VarAtom };

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
 * Always succeeds — tokens without variants yield an empty prefix. `:`
 * inside `[...]` arbitrary values is ignored (`bg-[url(https://x)]`).
 *
 * Allocation-free: results land in module scratch slots (consumed
 * immediately by the caller — no reentrancy).
 */
let svPrefix = "";
let svRest = "";
const splitVariants = (token: string): boolean => {
	let depth = 0;
	for (let i = 0; i < token.length; i++) {
		const char = token[i];
		if (char === "[") depth++;
		else if (char === "]") depth--;
		else if (char === ":" && depth === 0) {
			svPrefix = token.slice(0, i);
			svRest = token.slice(i + 1);
			return true;
		}
	}
	svPrefix = "";
	svRest = token;
	return false;
};

/**
 * True for typed arbitrary values (`[color:var(--x)]`, `[url(...)]`),
 * returning the property. Runs once per unique `[...]` token on the cold
 * compile path.
 */
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
const KILLS_ALSO: Readonly<Record<string, readonly string[]>> = {
	"font-size": ["line-height"],
};

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
 * mirroring how the runtime looks up its own dash-cased keys. Returns false
 * when the class has no generated entry — the caller keeps it opaque.
 *
 * Allocation-free: results land in module scratch slots (consumed
 * immediately by the caller — no reentrancy). The dash scan descends via
 * lastIndexOf instead of a char loop — only dash positions matter.
 */
let puUtility = "";
let puValue = "";
/**
 * Utilities of the generated conflict map bucketed by their first dash
 * segment, longest-key-first within a bucket. Lets parseUtility try only
 * real candidates via `startsWith` (no per-dash slice + map miss); ordering
 * preserves the old right-to-left "longest key wins" semantics.
 */
const buildUtilIndex = (conflicts: TwConflictsMeta): Map<string, string[]> => {
	const utilIndex = new Map<string, string[]>();
	for (const key of Object.keys(conflicts)) {
		const d = key.indexOf("-");
		const seg = d === -1 ? key : key.slice(0, d);
		let arr = utilIndex.get(seg);
		if (arr === undefined) {
			arr = [];
			utilIndex.set(seg, arr);
		}
		arr.push(key);
	}
	for (const arr of utilIndex.values()) arr.sort((a, b) => b.length - a.length);
	return utilIndex;
};
const parseUtility = (
	rest: string,
	conflicts: TwConflictsMeta,
	index: Map<string, string[]>,
): boolean => {
	if (rest.length === 0) return false;
	const whole = conflicts[rest];
	if (whole !== undefined && (whole[""] !== undefined || whole["*"] !== undefined)) {
		puUtility = rest;
		puValue = "";
		return true;
	}
	const d = rest.indexOf("-");
	if (d <= 0) return false;
	const candidates = index.get(rest.slice(0, d));
	if (candidates === undefined) return false;
	for (let ci = 0; ci < candidates.length; ci++) {
		const utility = candidates[ci]!;
		const ulen = utility.length;
		if (rest.length <= ulen) continue;
		if (rest.charCodeAt(ulen) !== 45) continue; // '-'
		if (!rest.startsWith(utility)) continue;
		const byValue = conflicts[utility]!;
		const value = rest.slice(ulen + 1);
		if (
			byValue[value] !== undefined ||
			byValue[stripOpacityModifier(value)] !== undefined ||
			byValue["*"] !== undefined
		) {
			puUtility = utility;
			puValue = value;
			return true;
		}
	}
	return false;
};

const isBorderUtility = (utility: string): boolean =>
	utility === "border" ||
	(utility.length === 8 && utility.startsWith("border-") && "trbl".includes(utility[7]!));

/**
 * Reusable scratch for signature-string arrays. signatureFromTwClass builds
 * its result here; the only consumer (compileSigs) reads it synchronously
 * before any other call can touch it — no reentrancy.
 */
const sigScratch: string[] = [];
const scopedSigs = (prefix: string, props: readonly string[]): string[] => {
	sigScratch.length = 0;
	for (let i = 0; i < props.length; i++) sigScratch.push(`${prefix}|${props[i]}`);
	return sigScratch;
};

const signatureFromTwClass = (
	token: string,
	conflicts: TwConflictsMeta,
	compose: ReadonlySet<string> | undefined,
	utilIndex: Map<string, string[]>,
): string[] | null => {
	splitVariants(token);
	const prefix = svPrefix;
	const rest = svRest;

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

	if (!parseUtility(rest, conflicts, utilIndex)) {
		// Whole-key utility with no "" / "*" property set — opaque unless
		// composed.
		const group = conflicts[rest];
		if (group === undefined) return null;
		if (compose?.has(rest)) return [`${prefix}|~${rest}`];
		const staticProps = group[""] ?? group["*"];
		return staticProps === undefined ? null : scopedSigs(prefix, staticProps);
	}

	const utility = puUtility;
	const value = puValue;
	// Parenthesized Tailwind arbitrary-property values (for example
	// `border-x-(--pattern-fg)`) are opaque to the generated conflict map.
	// Treating the fallback `*` group as authoritative can incorrectly remove
	// a separate width/style utility, so preserve these tokens verbatim.
	if (value.startsWith("(") && value.endsWith(")")) return null;

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
			const widthHalf = byValue["*"];
			if (widthHalf === undefined) return [];
			sigScratch.length = 0;
			for (let wi = 0; wi < widthHalf.length; wi++) {
				const propHalf = widthHalf[wi]!;
				if (!propHalf.endsWith("-style")) sigScratch.push(`${prefix}|${propHalf}`);
			}
			return sigScratch;
		}
		if (utility === "outline") return [`${prefix}|outline-width`];
		if (utility === "transition" && byValue["*"]?.includes("transition-property")) {
			return [`${prefix}|transition-property`];
		}
		const staticProps = byValue[""] ?? byValue["*"];
		return staticProps === undefined ? null : scopedSigs(prefix, staticProps);
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
		if (isBorderUtility(utility)) {
			// `border-[3px]` is a width, `border-[#eee]` a color; reuse the
			// map's own color props so arbitrary and named colors land in the
			// SAME conflict group (`border-b-[#eeb524]` vs `border-b-black`).
			if (LENGTH_LIKE.test(value.slice(1, -1))) return [`${prefix}|${utility}-width`];
			const colorProps =
				byValue["black"] ??
				byValue["current"] ??
				Object.values(byValue).find((props) => props.every((p) => p.endsWith("-color")));
			if (colorProps !== undefined) return scopedSigs(prefix, colorProps);
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
		isBorderUtility(utility) &&
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
	return scopedSigs(prefix, props);
};

/**
 * Create the app's `cx` merge function, bound to the same generated tw
 * metadata and css engine the rest of the app uses.
 */
export interface CxFn {
	/**
	 * Merge class strings, compiled CSS maps, variable carriers, nested arrays,
	 * and falsey conditional values.
	 *
	 * When generated conflict metadata is present, later declarations win within
	 * the same variant scope. Otherwise inputs remain opaque and are preserved.
	 *
	 * @example Conditional composition
	 * ```ts
	 * const className = cx(
	 *   "inline-flex",
	 *   isPrimary && "bg-blue-500",
	 *   css.class({ padding: 12 }),
	 * );
	 * ```
	 */
	(...inputs: Array<CxInput | CxInput[]>): string;
	/**
	 * Merge `css.vars()` outputs while preserving their inline custom properties.
	 *
	 * Use this projection when the result is going directly to a host element;
	 * the plain call intentionally returns only a class string.
	 *
	 * @example
	 * ```ts
	 * const className = cx.vars(
	 *   css.vars({ color: runtimeColor }),
	 *   "font-medium",
	 * );
	 * // className.class and className.style are ready for a host element.
	 * ```
	 */
	vars: (...inputs: Array<CxInput | CxInput[]>) => VarsOutput;
}

/**
 * Create a last-wins class composition function.
 *
 * `cx` is deliberately metadata-driven. It understands generated utility
 * conflicts and CSS atoms registered by the supplied `css` instance, but it
 * does not ship an ecosystem-specific vocabulary of its own. This keeps
 * migration and generated-class lanes honest: unresolved strings remain in
 * the result instead of being accidentally removed.
 *
 * @example Combining a CSS atom with conditional classes
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { createCx } from "pandwind/cx";
 *
 * const css = createCss();
 * const cx = createCx({ css });
 *
 * const buttonClass = cx(
 *   "inline-flex",
 *   disabled && "opacity-50",
 *   css.class({ padding: 12 }),
 * );
 * ```
 *
 * @param options - Generated utility metadata and an optional CSS registry.
 * @returns A callable merger with a variable-preserving `.vars` projection.
 * @category composition
 * @since 0.1.0
 */
export function createCx(options: CxOptions = {}): CxFn {
	const conflicts = options.conflicts;
	const composeSet = options.compose === undefined ? undefined : new Set(options.compose);
	// First-segment utility index for the cold parse path (built once; the
	// generated map is fixed at createCx time).
	const utilityIndex = conflicts === undefined ? undefined : buildUtilIndex(conflicts);
	const atoms: AtomRegistry | undefined = options.css
		? (options.css as CssFn<never> & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY]
		: undefined;

	// Per-token memoization. `twSigs` maps a raw token to its compiled merge
	// plan (or `null` = opaque); `atomSigs` maps a css atom's flattened
	// registry key to its compiled plan. Both hold immutable objects shared
	// with the output arrays.
	const twSigs = new Map<string, CompiledSigs | null>();
	const atomSigs = new Map<string, CompiledSigs>();
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
			const expansion = KILLS_ALSO[sig.slice(prefix.length)];
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
	/**
	 * Inline custom properties from `css.vars()` carriers, merged last-wins.
	 * Always collected (only when carriers appear); surfaced by `cx.vars`,
	 * ignored by the plain string `cx`.
	 */
	const outStyle: Record<string, string> = {};
	/** Live (not-yet-overridden) signature count per outCls entry. */
	const outLive: number[] = [];
	/**
	 * Live primary-signature ownership as parallel arrays (interned sid ->
	 * outCls index). Signature counts per call are tiny (<40), so linear
	 * scans beat Map hashing on the hot push path.
	 */
	const ownSid: number[] = [];
	const ownIdx: number[] = [];
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
	let resultCacheGeneration = 0;
	const resultCache = new Map<string, string>();
	/** The common two-class render path avoids even the result-cache key join. */
	let argumentCacheGeneration = -1;
	let argumentCacheA: string | undefined;
	let argumentCacheB: string | undefined;
	let argumentCacheResult = "";
	const readArgumentCache = (
		inputs: Array<CxInput | CxInput[]>,
		generation: number,
	): string | undefined => {
		if (inputs.length !== 2 || generation !== argumentCacheGeneration) return undefined;
		const a = inputs[0];
		const b = inputs[1];
		if (typeof a !== "string" || typeof b !== "string") return undefined;
		return a === argumentCacheA && b === argumentCacheB ? argumentCacheResult : undefined;
	};
	const writeArgumentCache = (
		inputs: Array<CxInput | CxInput[]>,
		generation: number,
		result: string,
	): void => {
		if (inputs.length !== 2 || typeof inputs[0] !== "string" || typeof inputs[1] !== "string")
			return;
		argumentCacheGeneration = generation;
		argumentCacheA = inputs[0];
		argumentCacheB = inputs[1];
		argumentCacheResult = result;
	};

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
			compileSigs(signatureFromTwClass(token, conflicts!, composeSet, utilityIndex!)),
		);
	const resolveAtomSigs = (key: string): CompiledSigs =>
		cachedCompile(atomSigs, key, () => compileSigs(signatureFromCssKey(key)))!;

	const push = (cls: string, plan: CompiledSigs | null) => {
		if (cls === "") return;
		if (plan === null) {
			if (opaque.has(cls)) return;
			opaque.add(cls);
			outCls.push(cls);
			// Keep outLive index-aligned with outCls (opaque entries are never
			// referenced by owners, but positions must match).
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
		const all = plan.all;
		for (let ai = 0; ai < all.length; ai++) {
			const sid = all[ai]!;
			let k = 0;
			for (; k < ownSid.length; k++) {
				if (ownSid[k] === sid) break;
			}
			if (k >= ownSid.length) continue;
			const previous = ownIdx[k]!;
			// Swap-remove keeps the arrays compact without reindexing others.
			const last = ownSid.length - 1;
			ownSid[k] = ownSid[last]!;
			ownIdx[k] = ownIdx[last]!;
			ownSid.pop();
			ownIdx.pop();
			if (--outLive[previous]! === 0) outCls[previous] = "";
		}
		const index = outCls.length;
		outCls.push(cls);
		outLive.push(plan.primaries);
		for (let i = 0; i < plan.primaries; i++) {
			ownSid.push(all[i]!);
			ownIdx.push(index);
		}
	};

	/**
	 * Fused tokenizer: walks the input once, resolving/pushing each token as
	 * it is cut (no intermediate token array, no split-cache bookkeeping).
	 * ASCII whitespace splits manually; non-ASCII falls back to the
	 * spec-equivalent regex so output stays byte-identical.
	 */
	const pushString = (input: string): void => {
		// Single-pass fused walk: tokens are pushed as they are cut; the first
		// non-ASCII char aborts to the spec-equivalent regex split (re-walking
		// from the start — non-ASCII inputs are rare enough that the extra
		// pass only exists on their path).
		const len = input.length;
		let start = -1;
		let i = 0;
		while (i <= len) {
			if (i === len) {
				if (start !== -1) {
					pushToken(input.slice(start, i));
				}
				return;
			}
			const code = input.charCodeAt(i);
			if (code > 126) {
				// Abort to the spec-equivalent split for the UNCONSUMED
				// remainder only — tokens before this point are already
				// pushed, and `start` marks any in-flight partial token.
				for (const token of input.slice(start === -1 ? i : start).split(/\s+/)) {
					if (token !== "") pushToken(token);
				}
				return;
			}
			const isSep =
				code === 32 || code === 9 || code === 10 || code === 11 || code === 12 || code === 13;
			if (isSep) {
				if (start !== -1) {
					pushToken(input.slice(start, i));
					start = -1;
				}
			} else if (start === -1) {
				start = i;
			}
			i++;
		}
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

	const pushVarCarrier = (input: VarsOutput): void => {
		if (input.style !== undefined) Object.assign(outStyle, input.style);
		const carrierAtoms = (input as { [VARS_ATOMS]?: Array<VarAtom> })[VARS_ATOMS];
		if (carrierAtoms === undefined) {
			// Unknown carrier shape — keep the class verbatim.
			push(input.class ?? "", null);
			return;
		}
		for (const atom of carrierAtoms) {
			for (const key of atom.keys) {
				push(atom.cls, resolveAtomSigs(key));
			}
		}
	};

	const pushInput = (input: CxInput) => {
		if (typeof input === "string") {
			pushString(input);
			return;
		}
		if (typeof input === "object" && input !== null) {
			if (VARS_ATOMS in input) {
				pushVarCarrier(input as VarsOutput);
				return;
			}
			for (const [key, atom] of Object.entries(input)) {
				push(atom, resolveAtomSigs(key));
			}
		}
	};

	const reset = (): void => {
		outCls.length = 0;
		outLive.length = 0;
		ownSid.length = 0;
		ownIdx.length = 0;
		opaque.clear();
		for (const styleKey of Object.keys(outStyle)) delete outStyle[styleKey];
	};

	/**
	 * Merge core shared by the string `cx` and the `cx.vars` companion.
	 * Returns the merged class string; inline styles accumulate in outStyle.
	 */
	const mergeInputs = (inputs: Array<CxInput | CxInput[]>): string => {
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
		return parts.join(" ");
	};

	const fastPlainInputs = (inputs: Array<CxInput | CxInput[]>): string | undefined => {
		if (inputs.length === 0 || inputs.length > 4) return undefined;
		let out = "";
		for (let index = 0; index < inputs.length; index++) {
			const input = inputs[index];
			if (typeof input !== "string" || input.length === 0 || /\s/.test(input)) return undefined;
			for (let previous = 0; previous < index; previous++) {
				if (inputs[previous] === input) return undefined;
			}
			if (out !== "") out += " ";
			out += input;
		}
		return out;
	};

	const cx = (...inputs: Array<CxInput | CxInput[]>): string => {
		// The no-config path is also used for plain class composition. Two
		// already-separated tokens need neither tokenization nor deduplication;
		// keep this branch deliberately narrow so every other shape retains the
		// exact merge implementation below.
		if (conflicts === undefined && atoms === undefined) {
			const plain = fastPlainInputs(inputs);
			if (plain !== undefined) return plain;
		}
		const generation = atoms?.size ?? 0;
		const argumentCached = readArgumentCache(inputs, generation);
		if (argumentCached !== undefined) return argumentCached;
		// Whole-input cache: only when every top-level input is a string (no
		// arrays to flatten, no css-atom objects whose resolution depends on
		// live registry state beyond the generation guard).
		let cacheKey = "";
		let allStrings = inputs.length > 0;
		for (let i = 0; i < inputs.length; i++) {
			if (typeof inputs[i] !== "string") {
				allStrings = false;
				break;
			}
		}
		if (allStrings) {
			if (resultCacheGeneration !== generation) {
				resultCache.clear();
				resultCacheGeneration = generation;
			}
			cacheKey = inputs.join("\u0000");
			const cached = resultCache.get(cacheKey);
			if (cached !== undefined) {
				// LRU touch: re-insert so the entry counts as recently used.
				resultCache.delete(cacheKey);
				resultCache.set(cacheKey, cached);
				return cached;
			}
		}

		reset();
		const out = mergeInputs(inputs);

		if (cacheKey !== "") {
			if (resultCache.size >= RESULT_CACHE_CAP) {
				// Evict oldest (insertion order = least-recently-used, since hits re-insert).
				const oldest = resultCache.keys().next().value;
				if (oldest !== undefined) resultCache.delete(oldest);
			}
			resultCache.set(cacheKey, out);
		}
		writeArgumentCache(inputs, generation, out);
		return out;
	};

	/**
	 * Companion merge for `css.vars()` outputs: same last-wins class
	 * merging as `cx`, plus the inline custom properties carried by each
	 * input (later inputs win per property). The plain string `cx` keeps its
	 * return type — carriers flowing through it contribute classes only
	 * (their styles are intentionally dropped; use `cx.vars` to keep them).
	 */
	cx.vars = (...inputs: Array<CxInput | CxInput[]>): VarsOutput => {
		reset();
		const cls = mergeInputs(inputs);
		return { class: cls, style: { ...outStyle } };
	};

	return cx;
}
