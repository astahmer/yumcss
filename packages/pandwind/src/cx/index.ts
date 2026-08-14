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
 * leaves two classes fighting over the same property. Tailwind classes are
 * parsed against the generated map; css atoms are resolved through the
 * engine's atom registry (see `css/atoms.ts`). Anything that can't be
 * resolved is kept verbatim, deduplicated by exact string only — when in
 * doubt, nothing is dropped.
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

interface Emitted {
	cls: string;
	sigs: string[] | null;
}

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
const isTypedArbitrary = (value: string): boolean => {
	if (value[0] !== "[") return false;
	for (let i = 1; i < value.length; i++) {
		if (value[i] === "]") return false;
		if (value[i] === ":") return true;
	}
	return false;
};

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
			byValue[value.replace(/\/\d+$/, "")] !== undefined ||
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
	const parsed = parseUtility(rest, conflicts);
	if (parsed === null) return null;

	const { utility, value } = parsed;
	if (isTypedArbitrary(value)) return null;

	if (compose?.has(utility)) {
		return [`${prefix}|~${utility}`];
	}

	const props =
		conflicts[utility]?.[value] ??
		conflicts[utility]?.[value.replace(/\/\d+$/, "")] ??
		conflicts[utility]?.["*"] ??
		[];
	if (props.length === 0) return null;
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

	const out: Emitted[] = [];
	const sigIndex = new Map<string, number>();
	const opaque = new Set<string>();

	const push = (cls: string, sigs: string[] | null) => {
		if (cls === "") return;
		if (sigs === null) {
			if (opaque.has(cls)) return;
			opaque.add(cls);
			out.push({ cls, sigs: null });
			return;
		}
		for (const sig of sigs) {
			const previous = sigIndex.get(sig);
			if (previous !== undefined) {
				out[previous]!.cls = "";
				sigIndex.delete(sig);
			}
		}
		out.push({ cls, sigs });
		for (const sig of sigs) sigIndex.set(sig, out.length - 1);
	};

	const pushInput = (input: CxInput) => {
		if (typeof input === "string") {
			for (const token of input.split(/\s+/)) {
				if (token === "") continue;
				const key = atoms?.get(token);
				if (key !== undefined) {
					push(token, signatureFromCssKey(key));
					continue;
				}
				if (conflicts !== undefined) {
					push(token, signatureFromTwClass(token, conflicts, composeSet));
					continue;
				}
				push(token, null);
			}
			return;
		}
		if (typeof input === "object" && input !== null) {
			for (const [key, atom] of Object.entries(input)) {
				push(atom, signatureFromCssKey(key));
			}
		}
	};

	const cx = (...inputs: Array<CxInput | CxInput[]>): string => {
		out.length = 0;
		sigIndex.clear();
		opaque.clear();
		for (const input of inputs) {
			if (Array.isArray(input)) {
				for (const nested of input) pushInput(nested);
			} else {
				pushInput(input);
			}
		}
		return out
			.map((emitted) => emitted.cls)
			.filter(Boolean)
			.join(" ");
	};

	return cx;
}
