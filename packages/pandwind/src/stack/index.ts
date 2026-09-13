/**
 * `<Stack>` — erasable layout primitive, renderer-agnostic core.
 *
 * The default `Stack` renderer uses the Tailwind-compatible `stackClasses`
 * mapping below. Renderer subpaths also expose `createStack(css)`, which
 * sends the same props through the supplied CSS compiler and therefore uses
 * that compiler's class-name strategy. Namespace behavior remains owned by
 * the CSS compiler for projections that use dynamic carriers. The vite fold
 * pass can share the same engine for either lane.
 *
 * Mapping order is deterministic (flex → direction → gap → padding → align
 * → justify) so folded output is byte-stable across runs.
 */
import type { StyleObject } from "../types/typings.ts";
import type { CssFn } from "../css/create-css.ts";

export type StackDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type StackCssValue = string | number;

export interface StackProps {
	/** Flex direction. Default `row`. */
	direction?: StackDirection;
	/** CSS value for `createStack`; the default renderer emits `gap-${value}`. */
	gap?: StackCssValue;
	/** CSS value for `createStack`; the default renderer emits `p-${value}`. */
	padding?: StackCssValue;
	align?: StackAlign;
	justify?: StackJustify;
}

/** CSS declarations produced by the configured Stack renderer. */
export interface StackStyle extends StyleObject {
	display: "flex";
	flexDirection?: StackDirection;
	gap?: StackCssValue;
	padding?: StackCssValue;
	alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
	justifyContent?:
		| "flex-start"
		| "center"
		| "flex-end"
		| "space-between"
		| "space-around"
		| "space-evenly";
}

/**
 * Minimal CSS compiler contract consumed by renderer-specific `createStack`.
 * `never` keeps any typed `CssFn` assignable; the runtime `.class` method is
 * open and receives the fixed Stack declarations through the factory boundary.
 */
export type StackClassCompiler = Pick<CssFn<never>, "class">;

/** Configured prop-to-class function shared by all renderer adapters. */
export type StackClassName = (props: StackProps) => string;

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

const ALIGN_STYLES: Readonly<Record<StackAlign, NonNullable<StackStyle["alignItems"]>>> = {
	start: "flex-start",
	center: "center",
	end: "flex-end",
	stretch: "stretch",
	baseline: "baseline",
};

const JUSTIFY_STYLES: Readonly<Record<StackJustify, NonNullable<StackStyle["justifyContent"]>>> = {
	start: "flex-start",
	center: "center",
	end: "flex-end",
	between: "space-between",
	around: "space-around",
	evenly: "space-evenly",
};

/** Map Stack props to the CSS object consumed by a configured compiler. */
export const stackStyle = (props: StackProps): StackStyle => {
	const style: StackStyle = { display: "flex" };
	if (props.direction !== undefined) style.flexDirection = props.direction;
	if (props.gap !== undefined) style.gap = props.gap;
	if (props.padding !== undefined) style.padding = props.padding;
	if (props.align !== undefined) style.alignItems = ALIGN_STYLES[props.align];
	if (props.justify !== undefined) style.justifyContent = JUSTIFY_STYLES[props.justify];
	return style;
};

/** Bind Stack to one CSS compiler and its class-name strategy. */
export const createStackClassName = (compiler: StackClassCompiler): StackClassName => {
	const compile = compiler.class as (...styles: Array<StackStyle>) => string;
	return (props) => compile(stackStyle(props));
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
