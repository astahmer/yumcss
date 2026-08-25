import { createObjectBackend, type ObjectBackend, type ObjectBackendOptions } from "./object.ts";

/* ---------------------------------------------------------------------------
 * React Native backend (plans/021): the design vocabulary lowered to RN
 * StyleSheet-shaped plain objects.
 *
 * Value/unit policy (RN lengths are unitless dp numbers):
 * - `"20px"` -> 20, `"0.5rem"` -> 8 (root font size 16), `"10"` -> 10,
 *   `"-4px"` -> -4; `"50%"` / `"auto"` pass through as strings.
 * - Shorthand lists expand per-side/axis (CSS T-R-B-L order): padding,
 *   margin -> `paddingTop`/`paddingVertical`…, borderWidth -> per-side,
 *   borderRadius -> per-corner (TL TR BR BL).
 * - `fontWeight` stays a string ("600" is the RN enum shape, not a number).
 * - CSS-only props (backdropFilter, transitions, grid, …) throw — fail
 *   fast beats a silently dead style.
 * -------------------------------------------------------------------------*/

const ROOT_FONT_SIZE = 16;

/** `20px` / `-4.5px` / `10` / `0.5rem` — values RN wants as plain numbers. */
const LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem)?$/;

/** Props whose numeric-looking strings are NOT lengths (RN enum shapes). */
const KEEP_STRING = new Set(["fontWeight", "fontFamily", "fontVariant"]);

/** CSS-only props with no RN representation — refused loudly. */
const UNSUPPORTED = new Set([
	"backdropFilter",
	"filter",
	"boxShadow",
	"float",
	"clear",
	"cursor",
	"whiteSpace",
	"transitionProperty",
	"transitionDuration",
	"transitionTimingFunction",
	"transitionDelay",
	"animationName",
	"animationDuration",
	"animationTimingFunction",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
]);

/** Shorthand props that expand to per-side/axis/corner RN props. */
const EXPANDS: Record<string, (suffix: string) => string> = {
	padding: (suffix) => `padding${suffix}`,
	margin: (suffix) => `margin${suffix}`,
	borderWidth: (suffix) => `border${suffix}Width`,
	borderRadius: (suffix) => `border${suffix}Radius`,
};

/**
 * CSS shorthand expansion tables: suffixes in CSS assignment order, paired
 * with the value index each position consumes (CSS 2-value = V/H, 3-value
 * = T R/L B; corners pair diagonally).
 */
const SIDE_EXPANSION: Record<number, Array<[suffix: string, valueIndex: number]>> = {
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

const CORNER_EXPANSION: Record<number, Array<[suffix: string, valueIndex: number]>> = {
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

const toNumber = (part: string): number => {
	const match = LENGTH.exec(part);
	if (match === null) throw new Error(`pandwind/react-native: unsupported length "${part}"`);
	const amount = Number(match[1]);
	const unit = match[2];
	if (unit === "rem") return amount * ROOT_FONT_SIZE;
	return amount;
};

const expandList = (
	prop: string,
	parts: Array<string>,
	table: Record<number, Array<[suffix: string, valueIndex: number]>>,
): Record<string, unknown> => {
	const expansion = table[parts.length];
	if (expansion === undefined) {
		throw new Error(
			`pandwind/react-native: property "${prop}" does not accept ${parts.length} values`,
		);
	}
	const out: Record<string, unknown> = {};
	for (const [suffix, valueIndex] of expansion) {
		out[EXPANDS[prop]!(suffix)] = toNumber(parts[valueIndex]!);
	}
	return out;
};

const convert = (prop: string, value: string): Record<string, unknown> => {
	if (UNSUPPORTED.has(prop)) {
		throw new Error(`pandwind/react-native: property "${prop}" has no React Native representation`);
	}
	if (KEEP_STRING.has(prop)) return { [prop]: value };

	const parts = value.trim().split(/\s+/);
	const allLengths = parts.every((part) => LENGTH.test(part));

	if (parts.length === 1) {
		if (!allLengths) return { [prop]: value };
		// Single-value shorthands keep the compact RN prop (padding: 4).
		return { [prop]: toNumber(parts[0]!) };
	}

	if (!allLengths) {
		throw new Error(
			`pandwind/react-native: property "${prop}" value "${value}" is not representable`,
		);
	}
	if (prop === "borderRadius") return expandList(prop, parts, CORNER_EXPANSION);
	if (prop in EXPANDS) return expandList(prop, parts, SIDE_EXPANSION);
	throw new Error(
		`pandwind/react-native: property "${prop}" does not accept a shorthand list ("${value}")`,
	);
};

export interface RnBackendOptions extends Omit<ObjectBackendOptions, "name"> {
	name?: string;
}

export function createRnBackend(options: RnBackendOptions = {}): ObjectBackend {
	return createObjectBackend({
		...options,
		name: options.name ?? "react-native",
		convert,
	});
}
