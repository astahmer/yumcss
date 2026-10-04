/** Shared conversion mechanics; target adapters retain all target semantics. */
const ROOT_FONT_SIZE = 16;
export const CSS_LENGTH = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem)?$/;
export const CSS_NUMERIC_WITH_UNIT = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z]+|%)$/i;

export type ShorthandSlot = readonly [suffix: string, valueIndex: number];

export const SIDE_EXPANSION: Readonly<Record<number, readonly ShorthandSlot[]>> = {
	1: [["", 0]],
	2: [
		["Top", 0],
		["Right", 1],
		["Bottom", 0],
		["Left", 1],
	],
	3: [
		["Top", 0],
		["Right", 1],
		["Bottom", 2],
		["Left", 1],
	],
	4: [
		["Top", 0],
		["Right", 1],
		["Bottom", 2],
		["Left", 3],
	],
};

export const CORNER_EXPANSION: Readonly<Record<number, readonly ShorthandSlot[]>> = {
	1: [["TopLeft", 0]],
	2: [
		["TopLeft", 0],
		["TopRight", 1],
		["BottomRight", 0],
		["BottomLeft", 1],
	],
	3: [
		["TopLeft", 0],
		["TopRight", 1],
		["BottomRight", 2],
	],
	4: [
		["TopLeft", 0],
		["TopRight", 1],
		["BottomRight", 2],
		["BottomLeft", 3],
	],
};

export function parseCssLength(value: string): number | undefined {
	const match = CSS_LENGTH.exec(value);
	if (match === null) return undefined;
	const amount = Number(match[1]);
	return match[2] === "rem" ? amount * ROOT_FONT_SIZE : amount;
}

export const splitCssValue = (value: string): string[] => {
	const parts: string[] = [];
	let partStart: number | undefined;
	let parentheses = 0;
	let brackets = 0;
	let quote: string | undefined;
	let escaped = false;

	for (let index = 0; index < value.length; index++) {
		const character = value[index]!;
		if (quote !== undefined) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (character === "\\") {
				escaped = true;
				continue;
			}
			if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			partStart ??= index;
			quote = character;
			continue;
		}
		if (character === "(") {
			partStart ??= index;
			parentheses++;
			continue;
		}
		if (character === ")") {
			parentheses = Math.max(0, parentheses - 1);
			continue;
		}
		if (character === "[") {
			partStart ??= index;
			brackets++;
			continue;
		}
		if (character === "]") {
			brackets = Math.max(0, brackets - 1);
			continue;
		}
		if (/\s/.test(character) && parentheses === 0 && brackets === 0) {
			if (partStart !== undefined) {
				parts.push(value.slice(partStart, index));
				partStart = undefined;
			}
			continue;
		}
		partStart ??= index;
	}
	if (partStart !== undefined) parts.push(value.slice(partStart));
	return parts;
};

export function expandShorthand(
	parts: readonly string[],
	table: Readonly<Record<number, readonly ShorthandSlot[]>>,
	convert: (value: string) => unknown,
	property: (suffix: string) => string,
): Record<string, unknown> | undefined {
	const slots = table[parts.length];
	if (slots === undefined || (slots.length === 1 && slots[0]![0] === "")) return undefined;
	return Object.fromEntries(
		slots.map(([suffix, valueIndex]) => [property(suffix), convert(parts[valueIndex]!)]),
	);
}
