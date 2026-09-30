import type {
	DynamicStyleObject,
	StyleObject,
	TypedDynamicStyleObject,
	TypedRawStyleObject,
	TypedStyleObject,
} from "../types/typings.ts";
import {
	createCssRuntime,
	type AnyInput,
	type CompiledStyles,
	type CreateCssOptions,
	type DynamicFn,
	type DynamicReturn,
	type DynamicStyles,
} from "./runtime-base.ts";
import type { KeyframeBody } from "./keyframes.ts";
import type { VarsOutput } from "./var-compiler.ts";
import { ALL_RUNTIME_METHODS } from "./runtime-methods.ts";
import { createPresetCssRuntime, type TypedPreset } from "./runtime-preset.ts";

export type { CreateCssOptions } from "./runtime-base.ts";

/**
 * Create the typed CSS function used by the public `css()` lane.
 *
 * A preset supplies the token and condition vocabulary; the returned callable
 * compiles style objects and exposes the projections documented by `CssFn`.
 * The preset is required so token and condition references cannot silently
 * fall back to raw CSS.
 *
 * @remarks
 * The same preset must be supplied to the stylesheet/runtime compiler that
 * resolves token references. For unbound or runtime-discovered styles, use
 * `createUnsafeCss` from `pandwind/unsafe/css`.
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
 * @param preset - Preset metadata defining the token and condition vocabulary.
 * @param options - CSS backend options.
 * @returns A callable compiler with `class`, `vars`, `raw`, `props`, `group`,
 * and `keyframes`.
 * @category factories
 * @since 0.1.0
 */
const createPresetCss = (preset: TypedPreset, options: CreateCssOptions): CssFn<StyleObject> => {
	const css = createPresetCssRuntime(preset, options, ALL_RUNTIME_METHODS);
	// SAFETY: ALL_RUNTIME_METHODS installs every CssFn projection before this escapes.
	return css as unknown as CssFn<StyleObject>;
};

export function createCss<TPreset extends TypedPreset>(
	preset: TPreset,
	options?: CreateCssOptions,
): CssFn<TypedStyleObject<TPreset>, TypedDynamicStyleObject<TPreset>, TypedRawStyleObject<TPreset>>;
export function createCss(preset: TypedPreset, options: CreateCssOptions = {}): CssFn<StyleObject> {
	return createPresetCss(preset, options);
}

/**
 * Create a CSS function from a generated, concrete style contract.
 *
 * Use the `css.generated.ts` facade emitted by
 * `pandwind-codemod css generate`. The generated type arguments replace the
 * expensive preset-derived style inference at application call sites, while
 * this factory delegates to the same runtime as {@link createCss}.
 *
 * @example
 * ```ts
 * import { createGeneratedCss } from "pandwind/css/generated";
 * import { examplePreset } from "@pandwind/example-preset";
 * import type { GeneratedDynamicStyle, GeneratedStyle } from "./css.types";
 *
 * const css = createGeneratedCss<GeneratedStyle, GeneratedDynamicStyle>(examplePreset);
 * css.class({ backgroundColor: "$blue-500", padding: 4 });
 * ```
 *
 * @typeParam TStyles - Concrete style object generated for the preset.
 * @typeParam TDynamicStyles - Concrete dynamic style object generated for the preset.
 * @param preset - The same preset used by the ordinary CSS factory at runtime.
 * @param options - CSS backend options.
 * @returns A callable compiler with the complete {@link CssFn} surface.
 * @category factories
 * @since 0.1.0
 */
export function createGeneratedCss<
	TStyles extends StyleObject,
	TDynamicStyles = DynamicStyleObject,
>(preset: TypedPreset, options?: CreateCssOptions): CssFn<TStyles, TDynamicStyles>;
export function createGeneratedCss(
	preset: TypedPreset,
	options: CreateCssOptions = {},
): CssFn<StyleObject> {
	return createPresetCss(preset, options);
}

/**
 * Create an open-ended CSS function for unbound or runtime-discovered styles.
 *
 * This escape hatch intentionally has no preset-derived token or condition
 * vocabulary. Prefer `createCss(preset)` for application code.
 *
 * @param options - CSS backend options.
 * @returns An unconstrained callable compiler with the complete CSS surface.
 * @category factories
 * @since 0.1.0
 */
export const createUnsafeCss = (options: CreateCssOptions = {}): CssFn<StyleObject> => {
	// SAFETY: ALL_RUNTIME_METHODS installs every CssFn projection before this escapes.
	return createCssRuntime(options, ALL_RUNTIME_METHODS) as unknown as CssFn<StyleObject>;
};

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
 * Callable CSS compiler with class, variable, raw, props, group, and keyframes
 * projections.
 *
 * @category styling
 * @since 0.1.0
 */
export interface CssFn<
	TStyles extends StyleObject = StyleObject,
	TDynamicStyles = DynamicStyleObject,
	TRawStyles extends StyleObject = TStyles,
> {
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
	vars: (...styles: Array<TStyles | TDynamicStyles>) => VarsOutput;
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
	raw: (...styles: Array<TRawStyles>) => StyleObject;
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
	/**
	 * Declare a component-local `@keyframes` body and receive the animation name
	 * its emitted rule registers under.
	 *
	 * A literal body is folded to that name in the bundled source, so the
	 * declarations stay in the generated stylesheet and never ship to the
	 * browser. The name is derived from the body itself, so the build, the
	 * server render, and the client all agree without a registry or counter.
	 *
	 * Each step is an ordinary declaration map, so preset token references
	 * resolve and their custom properties join the emitted tokens. A step has
	 * no selector, so conditions inside one are rejected at build time.
	 *
	 * @example
	 * ```ts
	 * const spin = css.keyframes({
	 *   from: { transform: "rotate(0deg)" },
	 *   to: { transform: "rotate(360deg)" },
	 * });
	 * const style = css.raw({ animation: `${spin} 1s linear infinite` });
	 * ```
	 */
	keyframes: (body: KeyframeBody) => string;
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
