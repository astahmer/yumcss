/**
 * `<Stack>` — erasable layout primitive, renderer-agnostic core.
 *
 * A pure prop→class mapping: no React, no DOM, no metadata. The runtime
 * component (`pandwind/stack/react`) calls this per render; the vite fold
 * pass (`stackFoldVite`, same package) calls it at build time, so folded
 * and runtime output are byte-identical by construction. See
 * plans/016-stack.md for the design contract.
 *
 * Mapping order is deterministic (flex → direction → gap → padding → align
 * → justify) so folded output is byte-stable across runs.
 */

export type StackDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between" | "around" | "evenly";

export interface StackProps {
	/** Flex direction. Default `row`. */
	direction?: StackDirection;
	/** Spacing token value (`"4"` → `gap-4`). */
	gap?: string;
	/** Spacing token value applied to all sides (`"6"` → `p-6`). */
	padding?: string;
	align?: StackAlign;
	justify?: StackJustify;
}

const DIRECTION_CLASSES: Readonly<Record<StackDirection, string>> = {
	row: "flex-row",
	column: "flex-col",
	"row-reverse": "flex-row-reverse",
	"column-reverse": "flex-col-reverse",
};

const ALIGN_CLASSES: Readonly<Record<StackAlign, string>> = {
	start: "items-start",
	center: "items-center",
	end: "items-end",
	stretch: "items-stretch",
	baseline: "items-baseline",
};

const JUSTIFY_CLASSES: Readonly<Record<StackJustify, string>> = {
	start: "justify-start",
	center: "justify-center",
	end: "justify-end",
	between: "justify-between",
	around: "justify-around",
	evenly: "justify-evenly",
};

/**
 * Map stack props to the Tailwind class string for a flex container.
 * Deterministic; unknown values are passed through verbatim after their
 * utility prefix (`gap: "3.5"` → `gap-3.5`).
 */
export function stackClasses(props: StackProps): string {
	const classes: string[] = ["flex"];
	if (props.direction !== undefined) classes.push(DIRECTION_CLASSES[props.direction]!);
	if (props.gap !== undefined) classes.push(`gap-${props.gap}`);
	if (props.padding !== undefined) classes.push(`p-${props.padding}`);
	if (props.align !== undefined) classes.push(ALIGN_CLASSES[props.align]!);
	if (props.justify !== undefined) classes.push(JUSTIFY_CLASSES[props.justify]!);
	return classes.join(" ");
}
