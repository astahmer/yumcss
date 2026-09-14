import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	DynamicStyleObject,
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
 * compiles style objects and exposes the projections documented by `CssFn`.
 * Pass a preset whenever a style references a token or condition. The
 * no-argument form stays open-ended for raw CSS and generated styles whose
 * vocabulary is known only at runtime.
 *
 * @remarks
 * The same preset must be supplied to the stylesheet/runtime compiler that
 * resolves token references. With bare `createCss()`, a value such as
 * `"$blue-500"` is ordinary raw CSS; it is not looked up as a token.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const css = createCss(examplePreset);
 * const cardStyles = css(
 *   { backgroundColor: "$blue-500" },
 *   { padding: 4 },
 * );
 * const cardProps = css.props(cardStyles);
 * const cardClass = css.class({ backgroundColor: "$blue-500", padding: 4 });
 * ```
 *
 * @param preset - Preset metadata, or CSS options in the open-ended overload.
 * @param options - CSS backend options.
 * @returns A callable compiler with `class`, `vars`, `raw`, `props`, and `group`.
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

/**
 * Create a preset-aware CSS function with the open style-object surface.
 *
 * Use this when a caller accepts runtime-discovered properties or aliases but
 * still wants preset token resolution in `css.vars`.
 *
 * @param preset - Preset metadata used for conditions and token resolution.
 * @param options - CSS backend options.
 * @returns An open CSS compiler with preset-aware runtime values.
 * @category factories
 * @since 0.1.0
 */
export function createCssOpen<TPreset extends TypedPreset>(
	preset: TPreset,
	options?: CreateCssOptions,
): CssFn<StyleObject> {
	return createCssRuntime(preset, options, ALL_RUNTIME_METHODS) as unknown as CssFn<StyleObject>;
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
 * Callable CSS compiler with class, variable, raw, props, and group projections.
 *
 * @category styling
 * @since 0.1.0
 */
export interface CssFn<TStyles extends StyleObject = StyleObject> {
	/**
	 * Compose authored style objects into an atomic declaration map.
	 * Later objects win through ordinary object-key precedence. Use `.class`
	 * when the host needs one class string, and use `.props` when the compiled
	 * map is ready to cross a host boundary.
	 *
	 * @example
	 * ```ts
	 * const button = css(
	 *   { display: "flex", padding: 8 },
	 *   isPrimary ? { backgroundColor: "royalblue" } : {},
	 * );
	 * const props = css.props(button);
	 * ```
	 */
	(...styles: Array<TStyles>): CompiledStyles;
	/**
	 * Compile style objects into one class string. Use this projection when the
	 * host already wants a class string; the callable `css(...)` form is the
	 * equivalent compiler projection when a mergeable declaration map is useful.
	 *
	 * @example
	 * ```ts
	 * const className = css.class({ color: "slategray", padding: 12 });
	 * ```
	 */
	class: (...styles: Array<TStyles>) => string;
	/**
	 * Encode runtime values as structural classes plus inline custom properties.
	 * The carrier is consumed by `.props` or `cx.vars`; use `.class` for styles
	 * whose values are all static.
	 *
	 * @example
	 * ```ts
	 * const tone = "oklch(70% 0.15 250)";
	 * const props = css.props(css.vars({ color: tone }));
	 * ```
	 */
	vars: (...styles: Array<TStyles | DynamicStyleObject>) => VarsOutput;
	/**
	 * Merge style objects without compiling them.
	 * This is useful when a stylesheet consumer or adapter needs the resolved
	 * style object before class generation.
	 *
	 * @example
	 * ```ts
	 * const style = css.raw({ color: "red" }, { padding: 8 });
	 * ```
	 */
	raw: (...styles: Array<TStyles>) => StyleObject;
	/**
	 * Normalize styles and class strings into props for a host element.
	 * Pass compiled maps from `css(...)` here when a component accepts a
	 * StyleX-like composed-style prop. Variable carriers also provide `style`.
	 *
	 * @example
	 * ```ts
	 * const base = css({ display: "flex", padding: 8 });
	 * const override = css({ padding: 12 });
	 * const props = css.props(base, override);
	 * ```
	 */
	props: (...styles: Array<PropsInput>) => PropsReturn;
	/**
	 * Build reusable static or parameterized style groups.
	 * Function entries return variable carriers, while `$input` entries read a
	 * runtime input object when the group member is called.
	 *
	 * @example
	 * ```ts
	 * const styles = css.group({
	 *   card: { borderRadius: 8, padding: 16 },
	 *   gap: (value: number) => ({ gap: value }),
	 * });
	 *
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
	 * Mark a named runtime input inside a dynamic `group` definition.
	 * The marker is meaningful only inside `css.group` and keeps the structural
	 * class stable while the supplied value travels through a custom property.
	 *
	 * @example
	 * ```ts
	 * const banners = css.group({
	 *   banner: {
	 *     $input: {} as { color: string },
	 *     color: css.input("color"),
	 *   },
	 * });
	 *
	 * css.props(banners.banner({ color: "tomato" }));
	 * ```
	 */
	input: (name: string) => never;
}

/**
 * The style-object parameter accepted by a `CssFn` instance.
 *
 * @example
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
 * @typeParam TCss - CSS function whose `class` parameter is exposed.
 * @category styling
 * @since 0.1.0
 */
export type AtomicStyleProps<
	TCss extends Pick<CssFn<never>, "class"> = Pick<CssFn<StyleObject>, "class">,
> = Parameters<TCss["class"]>[0];
