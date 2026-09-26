export { splitSelectorList } from "./selector-list.ts";

/**
 * Minimal escape-aware selector scanning for locating class tokens. Selector
 * text is preserved verbatim - no AST normalization - so this stays a
 * zero-dependency scanner instead of pulling postcss-selector-parser into any
 * bundle path.
 */

const CLASS_NAME_TERMINATORS = new Set([
	",",
	":",
	">",
	"+",
	"~",
	"#",
	"[",
	"(",
	")",
	"'",
	'"',
	".",
]);

const isSelectorWhitespace = (character: string): boolean =>
	character === " " ||
	character === "\t" ||
	character === "\n" ||
	character === "\r" ||
	character === "\f";

const isHexDigit = (character: string): boolean =>
	(character >= "0" && character <= "9") ||
	(character >= "a" && character <= "f") ||
	(character >= "A" && character <= "F");

/**
 * Decode one CSS escape starting at the backslash. Hex escapes (up to six hex
 * digits, one optional whitespace terminator) decode to their codepoint —
 * generated atom names starting with a digit are emitted as `.\31 f29p40` —
 * any other escaped character is taken literally.
 */
const decodeEscape = (
	selector: string,
	backslashIndex: number,
): { value: string; end: number } | null => {
	if (selector[backslashIndex] !== "\\") return null;
	let cursor = backslashIndex + 1;
	let hex = "";
	while (cursor < selector.length && hex.length < 6 && isHexDigit(selector[cursor]!)) {
		hex += selector[cursor]!;
		cursor += 1;
	}
	if (hex) {
		if (isSelectorWhitespace(selector[cursor] ?? "")) cursor += 1;
		const codePoint = Number.parseInt(hex, 16);
		if (Number.isNaN(codePoint)) return null;
		try {
			return { value: String.fromCodePoint(codePoint), end: cursor };
		} catch {
			return null;
		}
	}
	const next = selector[cursor];
	if (next === undefined) return null;
	return { value: next, end: cursor + 1 };
};

export interface SelectorClassMatch {
	/** Class name with escape sequences resolved. */
	readonly value: string;
	/** Index of the first class-name character (right after the leading dot). */
	readonly start: number;
	/** Index just past the class name. */
	readonly end: number;
	/** True when the token sits outside any (…) / […] nesting. */
	readonly topLayer: boolean;
	/** True when only whitespace follows until the next top-level comma or the end. */
	readonly lastInCompound: boolean;
}

/**
 * Locate every class token in a selector, including tokens nested inside
 * :where(…) / :not(…). Only simple (backslash) escapes are unescaped; hex
 * escapes are consumed but never appear in Pandwind-generated class names.
 */
export const selectorClassMatches = (selector: string): SelectorClassMatch[] => {
	const matches: SelectorClassMatch[] = [];
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;
	let index = 0;
	while (index < selector.length) {
		const character = selector[index]!;
		if (escaped) {
			escaped = false;
			index += 1;
		} else if (character === "\\") {
			escaped = true;
			index += 1;
		} else if (quote) {
			if (character === quote) quote = null;
			index += 1;
		} else if (character === '"' || character === "'") {
			quote = character;
			index += 1;
		} else if (character === "(" || character === "[") {
			depth += 1;
			index += 1;
		} else if (character === ")" || character === "]") {
			depth = Math.max(0, depth - 1);
			index += 1;
		} else if (character !== ".") {
			index += 1;
		} else {
			let cursor = index + 1;
			let value = "";
			let end = cursor;
			while (cursor < selector.length) {
				const tokenCharacter = selector[cursor]!;
				if (tokenCharacter === "\\") {
					const decoded = decodeEscape(selector, cursor);
					if (!decoded) break;
					value += decoded.value;
					end = decoded.end;
					cursor = decoded.end;
					continue;
				}
				if (isSelectorWhitespace(tokenCharacter) || CLASS_NAME_TERMINATORS.has(tokenCharacter))
					break;
				value += tokenCharacter;
				end = cursor + 1;
				cursor += 1;
			}
			if (value) {
				let rest = cursor;
				let restEscaped = false;
				let restQuote: string | null = null;
				let onlyWhitespace = true;
				while (rest < selector.length) {
					const restCharacter = selector[rest]!;
					if (restEscaped) {
						onlyWhitespace = false;
						break;
					}
					if (restCharacter === "\\") {
						restEscaped = true;
						rest += 1;
					} else if (restQuote) {
						if (restCharacter === restQuote) restQuote = null;
						rest += 1;
					} else if (restCharacter === '"' || restCharacter === "'") {
						restQuote = restCharacter;
						onlyWhitespace = false;
						break;
					} else if (restCharacter === "," && depth === 0) {
						break;
					} else if (!isSelectorWhitespace(restCharacter)) {
						onlyWhitespace = false;
						break;
					} else {
						rest += 1;
					}
				}
				matches.push({
					value,
					start: index + 1,
					end,
					topLayer: depth === 0,
					lastInCompound: onlyWhitespace,
				});
			}
			index = cursor > index ? cursor : index + 1;
		}
	}
	return matches;
};
