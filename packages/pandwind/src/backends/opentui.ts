import { createObjectBackend, type ObjectBackend, type ObjectBackendOptions } from "./object.ts";

/* ---------------------------------------------------------------------------
 * OpenTUI backend (plans/021): the design vocabulary lowered to OpenTUI
 * style plain objects (@opentui/react `<box>`/`<text>` `style` prop).
 *
 * Value/unit policy (plan decision: declared-with-default — OpenTUI lengths
 * are terminal CELLS, and px -> cells has no honest automatic mapping):
 * - option `cellSize` (default 4): `"20px"` -> round(20/4) = 5,
 *   `"0.5rem"` -> round(8/4) = 2 (root font size 16), `"10"` counts as
 *   px -> round(10/4) = 3, `"-4px"` -> -1.
 * - `"50%"` / `"auto"` and any non-length value pass through unchanged
 *   (Yoga accepts them upstream; hex colors are attested OpenTUI inputs).
 * - Shorthand lists split like CSS where OpenTUI has the props: padding /
 *   margin per side (T-R-B-L), borderRadius per corner (diagonal pairing).
 * - Border model (mined from @opentui/react usage — no shorthand, no width
 *   concept, thickness is implicitly one cell): CSS `border` expands to
 *   `{ border: true }` plus `borderColor` when the shorthand carries one.
 * - Terminals own fonts: typography-shape props (fontSize, fontFamily,
 *   lineHeight, letterSpacing, …) and cascade/paint-only props
 *   (backdropFilter, transitions, animations, grid, shadows, …) throw —
 *   fail fast beats a silently dead style.
 * -------------------------------------------------------------------------*/

const ROOT_FONT_SIZE = 16;

/** `20px` / `-4.5px` / `10` / `0.5rem` — values the policy converts to cells. */
const LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem)?$/;

/** CSS border-style keywords inside a `border` shorthand (never the color). */
const BORDER_STYLES = new Set([
	"none",
	"hidden",
	"dotted",
	"dashed",
	"solid",
	"double",
	"groove",
	"ridge",
	"inset",
	"outset",
]);

/** Props whose numeric-looking strings must stay strings (enum shapes). */
const KEEP_STRING = new Set(["fontWeight"]);

/** Props with no OpenTUI representation — refused loudly. */
const UNSUPPORTED = new Set([
	// Cascade/paint-only (no equivalent in a terminal renderer).
	"backdropFilter",
	"filter",
	"boxShadow",
	"float",
	"clear",
	"cursor",
	"transitionProperty",
	"transitionDuration",
	"transitionTimingFunction",
	"transitionDelay",
	"animationName",
	"animationDuration",
	"animationTimingFunction",
	"animationDelay",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
	// Typography-shape props terminals own (fonts live on the renderer).
	"fontFamily",
	"fontSize",
	"lineHeight",
	"letterSpacing",
	"whiteSpace",
]);

/** Shorthand props that expand to per-side OpenTUI props (radius per corner). */

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

/** One length component (`20px`, `0.5rem`, `-4`) to terminal cells. */
const makeToCells =
	(cellSize: number) =>
	(part: string): number => {
		const match = LENGTH.exec(part);
		if (match === null) throw new Error(`pandwind/opentui: unsupported length "${part}"`);
		const px = Number(match[1]) * (match[2] === "rem" ? ROOT_FONT_SIZE : 1);
		return Math.round(px / cellSize);
	};

/** CSS `border` shorthand -> OpenTUI `{ border: true, borderColor? }`. */
const toBorder = (value: string): Record<string, unknown> => {
	const out: Record<string, unknown> = { border: true };
	const parts = value.trim().split(/\s+/);
	const candidates = parts.filter(
		(part) => !LENGTH.test(part) && !BORDER_STYLES.has(part.toLowerCase()),
	);
	const color = candidates[candidates.length - 1];
	if (color !== undefined) out.borderColor = color;
	return out;
};

const expandList = (
	prop: string,
	parts: Array<string>,
	toCells: (part: string) => number,
	table: Record<number, Array<[suffix: string, valueIndex: number]>>,
	namer: (suffix: string) => string,
): Record<string, unknown> => {
	const expansion = table[parts.length];
	if (expansion === undefined) {
		throw new Error(`pandwind/opentui: property "${prop}" does not accept ${parts.length} values`);
	}
	const out: Record<string, unknown> = {};
	for (const [suffix, valueIndex] of expansion) {
		out[namer(suffix)] = toCells(parts[valueIndex]!);
	}
	return out;
};

const makeConvert =
	(cellSize: number) =>
	(prop: string, value: string): Record<string, unknown> => {
		if (UNSUPPORTED.has(prop)) {
			throw new Error(`pandwind/opentui: property "${prop}" has no OpenTUI representation`);
		}
		if (prop === "border") return toBorder(value);

		const parts = value.trim().split(/\s+/);
		const allLengths = parts.every((part) => LENGTH.test(part));

		if (prop === "borderRadius" || prop === "padding" || prop === "margin") {
			// Percent/auto pass through; pure-length lists split like CSS.
			if (!allLengths) return { [prop]: value };
			const toCells = makeToCells(cellSize);
			if (parts.length === 1) return { [prop]: toCells(parts[0]!) };
			if (prop === "borderRadius")
				return expandList(
					prop,
					parts,
					toCells,
					CORNER_EXPANSION,
					(suffix) => `border${suffix}Radius`,
				);
			return expandList(prop, parts, toCells, SIDE_EXPANSION, (suffix) => `${prop}${suffix}`);
		}

		if (parts.length > 1) {
			throw new Error(`pandwind/opentui: property "${prop}" value "${value}" is not representable`);
		}
		if (!allLengths || KEEP_STRING.has(prop)) return { [prop]: value };
		return { [prop]: makeToCells(cellSize)(parts[0]!) };
	};

export interface OpentuiBackendOptions extends Omit<ObjectBackendOptions, "name"> {
	name?: string;
	/**
	 * Terminal cells per CSS pixel used by the length->cells policy
	 * (plan 021 declared-with-default decision). Default: 4.
	 */
	cellSize?: number;
}

export function createOpentuiBackend(options: OpentuiBackendOptions = {}): ObjectBackend {
	return createObjectBackend({
		...options,
		name: options.name ?? "opentui",
		convert: makeConvert(options.cellSize ?? 4),
	});
}
