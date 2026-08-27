/** Shared conversion mechanics; target adapters retain all target semantics. */
const ROOT_FONT_SIZE = 16;
export const CSS_LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem)?$/;

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

export function splitCssValue(value: string): string[] {
	return value.trim().split(/\s+/).filter(Boolean);
}

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
