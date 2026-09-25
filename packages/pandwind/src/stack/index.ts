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
import { forEachResponsiveLeaf, isResponsiveObject, type ResponsiveValue } from "./responsive.ts";

export type StackDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type StackCssValue = string | number;
export type StackResponsiveValue<T> = ResponsiveValue<T>;

export interface StackProps {
	/** Flex direction. Default `row`. */
	direction?: StackResponsiveValue<StackDirection>;
	/** CSS value for `createStack`; the default renderer emits `gap-${value}`. */
	gap?: StackResponsiveValue<StackCssValue>;
	/** CSS value for `createStack`; the default renderer emits `p-${value}`. */
	padding?: StackResponsiveValue<StackCssValue>;
	align?: StackResponsiveValue<StackAlign>;
	justify?: StackResponsiveValue<StackJustify>;
}

/** CSS declarations produced by the configured Stack renderer. */
export interface StackStyle extends StyleObject {
	display: "flex";
	flexDirection?: StackResponsiveValue<StackDirection>;
	gap?: StackResponsiveValue<StackCssValue>;
	padding?: StackResponsiveValue<StackCssValue>;
	alignItems?: StackResponsiveValue<"flex-start" | "center" | "flex-end" | "stretch" | "baseline">;
	justifyContent?: StackResponsiveValue<
		"flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"
	>;
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

type StackAlignStyle = "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
type StackJustifyStyle =
	| "flex-start"
	| "center"
	| "flex-end"
	| "space-between"
	| "space-around"
	| "space-evenly";

const ALIGN_STYLES: Readonly<Record<StackAlign, StackAlignStyle>> = {
	start: "flex-start",
	center: "center",
	end: "flex-end",
	stretch: "stretch",
	baseline: "baseline",
};

const JUSTIFY_STYLES: Readonly<Record<StackJustify, StackJustifyStyle>> = {
	start: "flex-start",
	center: "center",
	end: "flex-end",
	between: "space-between",
	around: "space-around",
	evenly: "space-evenly",
};

type StackStyleLeaf = string | number;

const isStyleObject = (value: unknown): value is StyleObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const variantName = (condition: string): string => {
	if (condition === "base") return "";
	const name = condition.startsWith("_") ? condition.slice(1) : condition;
	if (!/^[a-z][A-Za-z0-9]*$/u.test(name)) return name.replace(/:$/u, "");
	return name.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
};

const appendVariantClasses = <T>(
	classes: string[],
	value: StackResponsiveValue<T>,
	utility: (value: T) => string,
): void => {
	forEachResponsiveLeaf(value, (leaf, conditions) => {
		const prefixes = conditions.map(variantName).filter(Boolean);
		const className = utility(leaf);
		classes.push(prefixes.length === 0 ? className : `${prefixes.join(":")}:${className}`);
	});
};

const assignResponsiveStyle = <T extends StackStyleLeaf>(
	target: StyleObject,
	property: string,
	value: StackResponsiveValue<T>,
	map: (value: T) => StackStyleLeaf,
): void => {
	if (!isResponsiveObject<T>(value)) {
		target[property] = map(value);
		return;
	}
	forEachResponsiveLeaf(value, (leaf, conditions) => {
		let branch = target;
		for (const condition of conditions) {
			const next = isStyleObject(branch[condition]) ? branch[condition] : {};
			branch[condition] = next;
			branch = next;
		}
		branch[property] = map(leaf);
	});
};

/** Map Stack props to the CSS object consumed by a configured compiler. */
export const stackStyle = (props: StackProps): StackStyle => {
	const style: StackStyle = { display: "flex" };
	if (props.direction !== undefined)
		assignResponsiveStyle(style, "flexDirection", props.direction, (value) => value);
	if (props.gap !== undefined) assignResponsiveStyle(style, "gap", props.gap, (value) => value);
	if (props.padding !== undefined)
		assignResponsiveStyle(style, "padding", props.padding, (value) => value);
	if (props.align !== undefined)
		assignResponsiveStyle(style, "alignItems", props.align, (value) => ALIGN_STYLES[value]);
	if (props.justify !== undefined)
		assignResponsiveStyle(style, "justifyContent", props.justify, (value) => JUSTIFY_STYLES[value]);
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
	if (props.direction !== undefined)
		appendVariantClasses(classes, props.direction, (value) => DIRECTION_CLASSES[value]!);
	if (props.gap !== undefined) appendVariantClasses(classes, props.gap, (value) => `gap-${value}`);
	if (props.padding !== undefined)
		appendVariantClasses(classes, props.padding, (value) => `p-${value}`);
	if (props.align !== undefined)
		appendVariantClasses(classes, props.align, (value) => ALIGN_CLASSES[value]!);
	if (props.justify !== undefined)
		appendVariantClasses(classes, props.justify, (value) => JUSTIFY_CLASSES[value]!);
	return classes.join(" ");
}
