import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
	TypedStyleObject,
} from "../types/typings.ts";
import {
	createCssRuntime,
	type CompiledStyles,
	type CreateCssOptions,
	type AnyInput,
	type DynamicFn,
	type DynamicReturn,
	type DynamicStyles,
} from "./runtime-base.ts";
import { attachClass } from "./runtime-method-class.ts";
import { attachGroup } from "./runtime-method-group.ts";
import { attachInput } from "./runtime-method-input.ts";
import { attachProps } from "./runtime-method-props.ts";
import { attachRaw } from "./runtime-method-raw.ts";
import { attachVars } from "./runtime-method-vars.ts";
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import type { VarsOutput } from "./var-compiler.ts";

export type { ClassNameStrategy };
export type { CreateCssOptions } from "./runtime-base.ts";

type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

const ALL_RUNTIME_METHODS = [
	attachVars,
	attachClass,
	attachRaw,
	attachProps,
	attachGroup,
	attachInput,
] as const;

/**
 * Create the typed CSS function used by the public `css()` lane.
 *
 * A preset supplies the token and condition vocabulary; the returned callable
 * compiles style objects to declaration maps and exposes the attached
 * projections documented by `CssFn`. Bundler integrations may replace this
 * full runtime with a statically lowered callable or a smaller attachment set
 * without changing the source-level type surface.
 *
 * Use the preset overload whenever a style references a token. The no-argument
 * form is intentionally open-ended and is useful for raw values, migration
 * output, and styles whose vocabulary is only known at runtime.
 *
 * @remarks
 * A preset is not just a TypeScript convenience. It carries the condition
 * names used when styles are flattened, and the same preset must be supplied
 * to the stylesheet/runtime compiler that resolves token references. In the
 * bare `createCss()` form, a string such as `"$blue-500"` is an ordinary raw
 * CSS value: it is not validated or resolved as a token. The generic-only
 * overload is reserved for generated runtimes that already own this metadata;
 * application code should pass the preset value explicitly.
 *
 * @example Raw values with the open-ended form
 * ```ts
 * import { createCss } from "pandwind/css";
 *
 * const css = createCss();
 * const className = css.class({
 *   color: "rebeccapurple",
 *   padding: 12,
 * });
 * ```
 *
 * @example Preset tokens and conditions
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const css = createCss(examplePreset);
 * const className = css.class({
 *   backgroundColor: "$blue-500",
 *   _hover: { backgroundColor: "$blue-600" },
 * });
 * ```
 *
 * @typeParam TPreset - The preset whose properties, tokens, and conditions
 *   become the style object's type.
 * @param preset - A preset returned by {@link definePreset}, or CSS backend
 *   options when using the open-ended overload.
 * @param options - Backend options used with a preset.
 * @returns A callable CSS compiler with class, variable, raw, props, and group
 *   projections.
 * @category factories
 * @since 0.1.0
 */
export function createCss<TPreset extends TypedPreset>(
	preset: TPreset,
	options?: CreateCssOptions,
): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export function createCss(options?: CreateCssOptions): CssFn<StyleObject>;
export function createCss<
	TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>,
>(
	options?: CreateCssOptions,
): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export function createCss(
	presetOrOptions: CreateCssOptions | TypedPreset = {},
	options: CreateCssOptions = {},
): CssFn<StyleObject> {
	return createCssRuntime(
		presetOrOptions,
		options,
		ALL_RUNTIME_METHODS,
	) as unknown as CssFn<StyleObject>;
}

interface PropsReturn {
	style: Record<string, string> | undefined;
	className: string | undefined;
	[key: string]: unknown;
}

type PropsInput =
	| CompiledStyles
	| DynamicReturn
	| VarsOutput
	| string
	| readonly PropsInput[]
	| false
	| null
	| undefined;

/**
 * The complete source-level contract for `createCss`.
 *
 * The callable form is the low-level declaration-map result. The named
 * methods are explicit projections for class strings, dynamic values, host
 * props, reusable groups, and raw style objects; keeping them on one typed
 * value lets compiler and runtime implementations share the same API.
 */
export interface CssFn<TStyles extends StyleObject = StyleObject> {
	/**
	 * Compile style objects to the atomic declaration map consumed by the CSS
	 * engine. Use `.class` when the host only needs a class string.
	 *
	 * @example
	 * ```ts
	 * const declarations = css({ display: "flex", padding: 8 });
	 * // { display: "...", padding: "..." }
	 * ```
	 */
	(...styles: Array<TStyles>): CompiledStyles;
	/**
	 * Compile style objects and return their atom classes as one class string.
	 * Later style objects win when they declare the same property.
	 *
	 * @example
	 * ```ts
	 * const className = css.class(
	 *   { color: "slategray", padding: 8 },
	 *   { padding: 12 },
	 * );
	 * ```
	 */
	class: (...styles: Array<TStyles>) => string;
	/**
	 * Encode style declarations as classes plus inline custom properties for
	 * values that are only known at runtime.
	 *
	 * The returned carrier is consumed by `.props` or `cx.vars`; it is not a
	 * replacement for `.class` when all values are static.
	 *
	 * @example Runtime value carried through a host style
	 * ```ts
	 * const tone = "oklch(70% 0.15 250)";
	 * const output = css.vars({ color: tone });
	 * const props = css.props(output);
	 * // props.className contains the structural class
	 * // props.style contains the runtime custom property
	 * ```
	 */
	vars: (...styles: Array<TStyles>) => VarsOutput;
	/**
	 * Merge style objects without compiling them.
	 *
	 * This is the escape hatch for stylesheet consumers, adapter bridges, and
	 * code that needs the resolved style object before class generation.
	 *
	 * @example
	 * ```ts
	 * const style = css.raw({ color: "red" }, { padding: 8 });
	 * // { color: "red", padding: 8 }
	 * ```
	 */
	raw: (...styles: Array<TStyles>) => StyleObject;
	/**
	 * Normalize compiled styles, variable carriers, and class strings into host
	 * props.
	 *
	 * The result is shaped for spreading onto a host element. Static inputs are
	 * represented by `className`; dynamic carriers also provide `style`.
	 *
	 * @example
	 * ```ts
	 * const props = css.props(css.class({ display: "flex" }), "rounded");
	 * // <button {...props}>Save</button>
	 * ```
	 */
	props: (...styles: Array<PropsInput>) => PropsReturn;
	/**
	 * Build a reusable map of static, dynamic, string, or parameterized style
	 * groups.
	 *
	 * Static entries are compiled once. A function entry receives its declared
	 * arguments and returns a variable carrier, while an entry containing
	 * `css.input(name)` is evaluated against a runtime input object.
	 *
	 * @example Reusable static and parameterized styles
	 * ```ts
	 * const styles = css.group({
	 *   card: { borderRadius: 8, padding: 16 },
	 *   gap: (value: number) => ({ gap: value }),
	 * });

	 * css.props(styles.card, styles.gap(12));
	 * ```
	 */
	group: <
		TGroup extends Record<
			string,
			TStyles | DynamicStyles<TStyles> | string | ((...args: any[]) => TStyles)
		>,
	>(
		styles: TGroup,
	) => {
		[Key in keyof TGroup]: TGroup[Key] extends { $input: infer TInput }
			? TInput extends AnyInput
				? DynamicFn<TInput>
				: never
			: TGroup[Key] extends (...args: infer TArgs) => TStyles
				? (...args: TArgs) => VarsOutput
				: TGroup[Key] extends string
					? string
					: CompiledStyles;
	};
	/**
	 * Mark a named runtime input for a dynamic `group` definition.
	 *
	 * The marker is only meaningful inside `css.group`; it lets the group keep
	 * its structural class stable while carrying the supplied value through a
	 * custom property.
	 *
	 * @example
	 * ```ts
	 * const banners = css.group({
	 *   banner: {
	 *     $input: {} as { color: string },
	 *     color: css.input("color"),
	 *   },
	 * });

	 * css.props(banners.banner({ color: "tomato" }));
	 * ```
	 */
	input: (name: string) => never;
}

/**
 * The style-object type accepted by a `createCss` instance's `class` method.
 *
 * Pass a `CssFn` instance to retain its preset-specific token and condition
 * types; omit the type argument for the open-ended `createCss()` form.
 *
 * @example Extract the parameter type from a configured CSS function
 * ```ts
 * import { createCss, type AtomicStyleProps } from "pandwind/css";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const css = createCss(examplePreset);
 * const style: AtomicStyleProps<typeof css> = {
 *   backgroundColor: "$blue-500",
 *   padding: 8,
 * };
 * ```
 *
 * @typeParam TCss - A CSS function whose `class` parameter should be exposed.
 * @category styling
 * @since 0.1.0
 */
export type AtomicStyleProps<
	TCss extends Pick<CssFn<never>, "class"> = Pick<CssFn<StyleObject>, "class">,
> = Parameters<TCss["class"]>[0];
