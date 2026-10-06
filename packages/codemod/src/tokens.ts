/**
 * Class-string tokenization: variant stacks, important/negative markers,
 * utility/value split. Pure string logic — no AST needed for the codemod's
 * conservative scope.
 */
import type { YumCSSMeta } from "./meta.ts";

export interface ParsedToken {
	/** Original token as written. */
	raw: string;
	/** Variant chain, outermost first (camelCase meta names). */
	variants: string[];
	/** `!important` marker. */
	important: boolean;
	/** Negative value marker (`-mt-2`). */
	negative: boolean;
	/** Utility prefix (longest conflicts match), e.g. `text`, `-mx` unknown-safe. */
	prefix: string;
	/** Value part after the prefix ("" for boolean utilities). */
	value: string;
	/** Opacity modifier (`50` for `bg-blue-500/50`). */
	opacity: string | undefined;
}

export interface ParsedArbitraryToken {
	/** Original token as written. */
	readonly raw: string;
	/** Known variant chain, outermost first. */
	readonly variants: readonly string[];
	readonly important: boolean;
	readonly negative: boolean;
	/** Utility prefix for forms such as `w-[37px]`. */
	readonly prefix: string | undefined;
	/** Explicit CSS property for forms such as `[width:37px]`. */
	readonly property: string | undefined;
	/** Decoded arbitrary value, without the surrounding brackets. */
	readonly value: string;
}

/**
 * Split a raw class list into tokens. Top-level whitespace only — colons and
 * spaces inside arbitrary brackets are preserved.
 */
export function tokenizeClassList(classString: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let bracketDepth = 0;
	for (const char of classString) {
		if (char === "[") bracketDepth++;
		else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
		if (/\s/.test(char) && bracketDepth === 0) {
			if (current !== "") tokens.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current !== "") tokens.push(current);
	return tokens;
}

/** Split on top-level colons (bracket-aware). */
function splitTopLevel(token: string, separator: ":"): string[] {
	const parts: string[] = [];
	let current = "";
	let bracketDepth = 0;
	for (const char of token) {
		if (char === "[") bracketDepth++;
		else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
		if (char === separator && bracketDepth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts;
}

const camelCase = (name: string): string =>
	name.length > 0 ? name[0]!.toLowerCase() + name.slice(1) : name;

/** Convert the kebab spelling used by Tailwind into a generated variant key. */
const variantKey = (name: string): string =>
	camelCase(name.replace(/-([a-z])/g, (_, character: string) => character.toUpperCase()));

/**
 * Consume leading variant segments while they match known variants.
 * Compound dash forms (`group-hover`) split into a nested chain when both
 * halves are known variants joined by `-`.
 */
function parseVariants(token: string, meta: YumCSSMeta): { variants: string[]; rest: string } {
	const segments = splitTopLevel(token, ":");
	const variants: string[] = [];
	let i = 0;
	while (i < segments.length - 1) {
		const segment = segments[i]!;
		// Named data/aria conditions such as `data-focus` are opaque selectors.
		// Splitting them into the generic `data` and `focus` variants changes
		// their meaning; only bracketed attribute conditions are structurally
		// safe to expose as an open variant key below.
		if (/^(?:(?:group|peer)-)?(?:data|aria)-/.test(segment)) break;
		const directVariant = variantKey(segment);
		if (meta.variants.has(directVariant)) {
			variants.push(directVariant);
			i++;
			continue;
		}
		const dashSplit = segment.split("-");
		if (
			dashSplit.length === 2 &&
			meta.variants.has(camelCase(dashSplit[0]!)) &&
			meta.variants.has(camelCase(dashSplit[1]!))
		) {
			variants.push(camelCase(dashSplit[0]!), camelCase(dashSplit[1]!));
			i++;
			continue;
		}
		// Arbitrary / data-attribute variants (`data-[expanded]`,
		// `group-data-[state=x]/sidebar`) are not in the generated variant set
		// but ARE valid tw() object keys (the generated types carry an open
		// nesting escape hatch). Accept them verbatim as variant keys instead
		// of dooming the whole token to verbatim-keep.
		if (/^(?:(?:group|peer)-)?(?:data|aria)-\[[^\]]+\](?:\/[\w-]+)?$/.test(segment)) {
			variants.push(segment);
			i++;
			continue;
		}
		break; // Unknown leading segment — treat the rest as the utility.
	}
	return { variants, rest: segments.slice(i).join(":") };
}

/** Longest-prefix match of the utility against the conflict map keys. */
function splitPrefix(utility: string, meta: YumCSSMeta): { prefix: string; value: string } | null {
	if (meta.conflicts.has(utility)) return { prefix: utility, value: "" };
	let best: { prefix: string; value: string } | null = null;
	for (const prefix of meta.conflicts.keys()) {
		if (prefix !== "" && utility.startsWith(`${prefix}-`)) {
			if (best === null || prefix.length > best.prefix.length) {
				best = { prefix, value: utility.slice(prefix.length + 1) };
			}
		}
	}
	return best;
}

export function parseToken(raw: string, meta: YumCSSMeta): ParsedToken | null {
	const { variants, rest } = parseVariants(raw, meta);

	let important = false;
	let body = rest;
	if (body.startsWith("!")) {
		important = true;
		body = body.slice(1);
	}

	let negative = false;
	if (body.startsWith("-") && !body.startsWith("--")) {
		negative = true;
		body = body.slice(1);
	}

	// Arbitrary-value utilities never map onto typed keys.
	const arbitraryIndex = body.indexOf("[");
	if (arbitraryIndex !== -1 && body.endsWith("]")) return null;

	const split = splitPrefix(body, meta);
	if (split === null) return null;

	let value = split.value;
	let opacity: string | undefined;
	// Tailwind's parenthesized arbitrary-property shorthand (`w-(--size)`)
	// is not a typed design-system value. Keeping it literal avoids making the
	// target runtime guess its conflict group or silently changing precedence.
	if (value.startsWith("(") && value.endsWith(")")) return null;
	const slashIndex = findTopLevelSlash(value);
	if (slashIndex !== -1) {
		opacity = value.slice(slashIndex + 1);
		value = value.slice(0, slashIndex);
	}

	return {
		raw,
		variants,
		important,
		negative,
		prefix: split.prefix,
		value,
		opacity,
	};
}

/** Parse an arbitrary-value escape hatch without attempting to rewrite it. */
export function parseArbitraryToken(raw: string, meta: YumCSSMeta): ParsedArbitraryToken | null {
	const { variants, rest } = parseVariants(raw, meta);
	let important = false;
	let body = rest;
	if (body.startsWith("!")) {
		important = true;
		body = body.slice(1);
	}
	let negative = false;
	if (body.startsWith("-") && !body.startsWith("--")) {
		negative = true;
		body = body.slice(1);
	}
	if (!body.endsWith("]")) return null;
	const arbitraryIndex = body.indexOf("[");
	if (arbitraryIndex === -1) return null;
	const prefixText = body.slice(0, arbitraryIndex).replace(/-$/u, "");
	const content = decodeArbitraryValue(body.slice(arbitraryIndex + 1, -1));
	if (prefixText === "") {
		const separator = findTopLevelColon(content);
		if (separator <= 0 || separator === content.length - 1) return null;
		return {
			raw,
			variants,
			important,
			negative,
			prefix: undefined,
			property: content.slice(0, separator).trim(),
			value: content.slice(separator + 1).trim(),
		};
	}
	const prefix = splitPrefix(prefixText, meta)?.prefix ?? prefixText;
	return {
		raw,
		variants,
		important,
		negative,
		prefix,
		property: undefined,
		value: content,
	};
}

function findTopLevelSlash(value: string): number {
	let bracketDepth = 0;
	for (let i = 0; i < value.length; i++) {
		const char = value[i]!;
		if (char === "[") bracketDepth++;
		else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
		else if (char === "/" && bracketDepth === 0) return i;
	}
	return -1;
}

function findTopLevelColon(value: string): number {
	let bracketDepth = 0;
	let parenthesisDepth = 0;
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index]!;
		if (char === "[") bracketDepth += 1;
		else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
		else if (char === "(") parenthesisDepth += 1;
		else if (char === ")") parenthesisDepth = Math.max(0, parenthesisDepth - 1);
		else if (char === ":" && bracketDepth === 0 && parenthesisDepth === 0) return index;
	}
	return -1;
}

function decodeArbitraryValue(value: string): string {
	return value.replace(/\\_/gu, "\u0000").replaceAll("_", " ").replaceAll("\u0000", "_");
}
