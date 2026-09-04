/**
 * Exact raw-value -> token suggestions (plans/054 step 6).
 *
 * A suggestion exists only when ALL hold:
 * - the raw literal is static (never a dynamic site);
 * - the target definition has a statically resolved scalar value;
 * - resolved values are exactly equal (hex colors may match after
 *   case-folding — the one normalization rule tokens carry);
 * - the property category and the token group are compatible;
 * - the definition is NOT condition/theme-scoped (scoped values cannot
 *   prove all-theme equality here, so they stay literal);
 * - exactly one candidate matches — ambiguity rejects every candidate.
 */
import type {
	GovernanceDiagnostic,
	RawTokenSuggestion,
	TokenDefinition,
	TokenUsage,
} from "./contracts.ts";

/** Property prefixes/categories -> token groups allowed to replace them. */
const CATEGORY_GROUPS: Array<{ match: (property: string) => boolean; groups: ReadonlyArray<string> }> = [
	{
		match: (p) => /^(bg|bgColor|backgroundColor|color|textColor|borderColor|fill|background|outlineColor|accentColor)/.test(p),
		groups: ["colors", "semantic"],
	},
	{
		match: (p) => /^(padding|margin|gap|rowGap|columnGap|inset|top|right|bottom|left|width|minWidth|maxWidth|height|minHeight|maxHeight|borderWidth)/.test(p) || /^(margin|padding)[A-Z]/.test(p),
		groups: ["spacing"],
	},
	{ match: (p) => /^(borderRadius|rounded)/.test(p), groups: ["radii"] },
	{ match: (p) => /^fontSize/.test(p), groups: ["fontSizes"] },
	{ match: (p) => /^fontWeight/.test(p), groups: ["fontWeights"] },
	{ match: (p) => /^lineHeight/.test(p), groups: ["lineHeights"] },
	{ match: (p) => /^letterSpacing/.test(p), groups: ["letterSpacings"] },
	{ match: (p) => /^fontFamily|^font/.test(p), groups: ["fonts"] },
];

const HEX = /^#[0-9a-fA-F]{3,8}$/;

export interface SuggestionOutcome {
	readonly suggestions: readonly RawTokenSuggestion[];
	readonly diagnostics: readonly GovernanceDiagnostic[];
}

const compatibleGroups = (property: string, group: string): boolean =>
	CATEGORY_GROUPS.some((c) => c.match(property) && c.groups.includes(group));

/** Spelling emitted in source: group-qualified authored reference. */
const authoredSpelling = (def: TokenDefinition): string =>
	def.group === "css-var" ? def.name : "$" + def.group + "." + def.name;

export function suggestRawTokenReplacements(
	usage: ReadonlyArray<TokenUsage>,
	definitions: ReadonlyArray<TokenDefinition>,
): SuggestionOutcome {
	const suggestions: RawTokenSuggestion[] = [];
	const diagnostics: GovernanceDiagnostic[] = [];

	// Resolvable candidates only: statically valued, non-scoped definitions.
	const candidates = definitions.filter((d) => typeof d.value === "string");

	for (const u of usage) {
		if (u.tokenId !== "" || u.rawValue === undefined) continue;
		if (u.strictness === "dynamic") continue;
		const property = u.property ?? "";
		if (property === "") continue;
		const literal = u.rawValue.replace(/^["']|["']$/g, "");
		const lowered = literal.toLowerCase();
		const isHex = HEX.test(literal);

		const valueMatches = candidates.filter((d) => {
			if (!compatibleGroups(property, d.group)) return false;
			const value = d.value ?? "";
			if (value === literal) return true;
			if (isHex && HEX.test(value) && value.toLowerCase() === lowered) return true;
			return false;
		});

		if (valueMatches.length === 0) continue;
		if (valueMatches.length > 1) {
			diagnostics.push({
				severity: "info",
				code: "governance/suggestion-ambiguous",
				message:
					`raw value ${literal} matches ${valueMatches.length} tokens (${valueMatches
						.map((d) => d.id)
						.join(", ")}) — rejected as ambiguous`,
				file: u.file,
			});
			continue;
		}
		const def = valueMatches[0]!;
		const exact = (def.value ?? "") === literal;
		suggestions.push({
			file: u.file,
			start: u.start,
			end: u.end,
			property,
			rawValue: u.rawValue,
			tokenId: def.id,
			replacement: authoredSpelling(def),
			reason: exact
				? `exact value match for ${def.id}`
				: `case-folded hex match for ${def.id}`,
			confidence: exact ? "verified" : "inferred",
		});
	}

	return {
		suggestions: suggestions.toSorted(
			(a, b) => a.file.localeCompare(b.file) || a.start - b.start,
		),
		diagnostics,
	};
}
