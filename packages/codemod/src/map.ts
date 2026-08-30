/**
 * Core migration engine: maps raw Tailwind class tokens onto pandwind APIs.
 *
 * Disambiguation of overloaded utilities is driven entirely by the generated
 * conflict map: `conflicts[prefix][value]` yields the CSS properties the
 * utility compiles to, and the candidate tw() key whose name best matches
 * those properties wins (`text` + ["color"] -> textColor,
 * `bg` + ["background-image"] -> bgImage). Deterministic, no guessing.
 */
import type { PandwindMeta } from "./meta.ts";
import { parseToken, tokenizeClassList, type ParsedToken } from "./tokens.ts";

export interface MappedToken {
	/** Original token as written. */
	raw: string;
	/** Variant chain, outermost first (camelCase). */
	variants: string[];
	/** tw() object key, e.g. `px`, `textColor`. */
	key: string;
	/** Object value: string, boolean (flag utilities), number-strings kept. */
	value: string | true;
}

export interface MapOutcome {
	mapped: MappedToken[];
	/** Tokens intentionally left verbatim, with reasons. */
	unmapped: Array<{ raw: string; reason: string }>;
}

const lastSegment = (prop: string): string => prop.split("-").pop() ?? prop;

/**
 * Tailwind's direction utilities only set `flex-direction`. The typed
 * Pandwind `flex` key also emits `display: flex` for these values, so using
 * it as a direct migration target can change `hidden flex-row` into visible
 * content. Keep the original utility as a lossless residual instead.
 */
const FLEX_DIRECTION_VALUES = new Set(["col", "row", "col-reverse", "row-reverse"]);

/**
 * Pick the tw key for an overloaded prefix using the CSS properties from the
 * conflict map: score = how many props' last segment appear in the key name
 * (case-insensitive). Ties resolve by interface order (first wins).
 */
function pickKey(meta: PandwindMeta, prefix: string, props: string[]): { key: string } | null {
	const candidates = meta.keysByBase.get(prefix);
	if (candidates === undefined || candidates.length === 0) return null;
	if (candidates.length === 1) return { key: candidates[0]!.key };

	let best: { key: string; score: number } | null = null;
	for (const candidate of candidates) {
		const keyLower = candidate.key.toLowerCase();
		let score = 0;
		for (const prop of props) {
			const segment = lastSegment(prop).toLowerCase();
			if (segment !== "" && keyLower.includes(segment)) score++;
		}
		if (best === null || score > best.score) best = { key: candidate.key, score };
	}
	return best === null ? null : { key: best.key };
}

/** Map one raw class token onto a typed tw() entry — or explain why not. */
export function mapToken(raw: string, meta: PandwindMeta): MappedToken | null {
	const parsed: ParsedToken | null = parseToken(raw, meta);
	if (parsed === null) return null;
	const { prefix, value } = parsed;
	if (prefix === "flex" && FLEX_DIRECTION_VALUES.has(value)) return null;

	// `not-*` is a Tailwind variant family, not a Pandwind utility. Treating
	// the generated `not` helper key as a normal utility drops the negation
	// and emits the opposite selector. Preserve the source token instead.
	if (prefix === "not") return null;

	const perValue = meta.conflicts.get(prefix);
	if (perValue === undefined) return null;

	// Negative utilities (`-mt-2`) keep their sign in the class name itself;
	// typed values cannot express it without changing the emitted class, so
	// they intentionally stay verbatim strings at the call site.
	if (parsed.negative) return null;

	let props = perValue[value] ?? perValue["*"];
	if (props === undefined) return null;

	let emittedValue: string | true = value === "" ? true : value;
	if (parsed.opacity !== undefined) {
		if (typeof emittedValue !== "string") return null;
		emittedValue = `${emittedValue}/${parsed.opacity}`;
	}
	if (parsed.important) return null; // important modifiers stay verbatim

	const picked = pickKey(meta, prefix, props ?? []);
	if (picked === null) return null;

	return { raw, variants: parsed.variants, key: picked.key, value: emittedValue };
}

export function mapClassList(classString: string, meta: PandwindMeta): MapOutcome {
	const mapped: MappedToken[] = [];
	const unmapped: Array<{ raw: string; reason: string }> = [];
	for (const token of tokenizeClassList(classString)) {
		const mappedToken = mapToken(token, meta);
		if (mappedToken === null) unmapped.push({ raw: token, reason: "no typed mapping" });
		else mapped.push(mappedToken);
	}
	return { mapped, unmapped };
}
