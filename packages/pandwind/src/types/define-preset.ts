import type {
	AnyConditions,
	AnyPresetProperties,
	AnySemanticTokens,
	AnySimpleTokens,
	CssPreset,
	DefinePresetOptions,
} from "./typings.ts";

export * from "./typings.ts";

/**
 * Preserve a theme object's literal types before it is combined with preset
 * behavior.
 *
 * A theme owns values: tokens and the CSS configuration they are allowed to
 * describe. `defineTheme` is intentionally a zero-cost identity function,
 * but naming this boundary makes the relationship between tokens and the
 * final preset explicit in application code.
 *
 * @example Defining the value side of a preset
 * ```ts
 * import type { StandardProperties } from "csstype";
 * import { defineTheme, defineTokens } from "pandwind/preset";
 *
 * const tokens = defineTokens({
 *   colors: { "$brand-500": "#2563eb" },
 *   spacing: { 4: "1rem" },
 * });
 *
 * const theme = defineTheme({
 *   config: {} as StandardProperties,
 *   tokens,
 * });
 * ```
 *
 * @typeParam TTheme - The inferred theme shape, including literal token names.
 * @param theme - The token and CSS configuration values to preserve.
 * @returns The same object, with its literal types intact.
 * @category presets
 * @since 0.1.0
 */
export const defineTheme = <TTheme extends DefinePresetOptions>(theme: TTheme) => theme;

/**
 * Combine a theme's values with the behavior that makes them available to
 * `createCss`, `createDesignCss`, and the stylesheet compiler.
 *
 * The preset is the type boundary for token references. Pass the returned
 * value to a CSS factory when you want property names, token names, and
 * conditions to be checked by TypeScript. A bare `createCss()` remains the
 * open-ended escape hatch for raw CSS values, but it cannot know your token
 * vocabulary.
 *
 * @example A small, typed CSS preset
 * ```ts
 * import type { StandardProperties } from "csstype";
 * import { createCss } from "pandwind/css";
 * import { definePreset, defineTheme, defineTokens } from "pandwind/preset";
 *
 * const tokens = defineTokens({
 *   colors: { "$brand-500": "#2563eb", "$surface": "#ffffff" },
 *   spacing: { 4: "1rem" },
 * });
 *
 * const preset = definePreset(
 *   defineTheme({ config: {} as StandardProperties, tokens }),
 *   {
 *     strict: true,
 *     conditions: { _hover: "&:hover" },
 *     properties: {
 *       backgroundColor: tokens.colors,
 *       color: tokens.colors,
 *       padding: tokens.spacing,
 *     },
 *   },
 * );
 *
 * const css = createCss(preset);
 * const className = css.class({
 *   backgroundColor: "$brand-500",
 *   padding: 4,
 *   _hover: { backgroundColor: "$surface" },
 * });
 * ```
 *
 * @typeParam TTheme - The theme value shape.
 * @typeParam TConfig - The CSS property configuration shape.
 * @typeParam TTokens - The token groups and literal token names.
 * @typeParam TPreset - The resulting preset behavior shape.
 * @param theme - Values produced by {@link defineTheme}.
 * @param preset - Conditions, strictness, and property-to-token mappings.
 * @returns A preset carrying both runtime metadata and inferred token types.
 * @see {@link defineTokens} for the raw token layer.
 * @see {@link createCss} for consuming the resulting preset.
 * @category presets
 * @since 0.1.0
 */
export function definePreset<
	TTheme extends DefinePresetOptions<any, any>,
	TConfig extends TTheme["config"],
	TTokens extends TTheme["tokens"],
	TPreset extends CssPreset<TConfig, TTokens>,
>(theme: TTheme, preset: TPreset) {
	return { ...preset, tokens: theme.tokens } as TPreset & {
		_config: TConfig;
		tokens: TTokens;
	};
}

/**
 * Declare raw token values while preserving their names for a typed preset.
 *
 * Token values are deliberately plain strings. Pandwind does not require a
 * runtime token object in the browser; the values are consumed by the
 * stylesheet/runtime compiler and their names become part of the CSS API.
 *
 * @example Raw tokens used by a preset
 * ```ts
 * import { defineTokens } from "pandwind/preset";
 *
 * const tokens = defineTokens({
 *   colors: {
 *     "$blue-500": "#3182ce",
 *     "$gray-50": "#f9fafb",
 *   },
 *   spacing: { 4: "1rem", 6: "1.5rem" },
 * });
 * ```
 *
 * @typeParam T - The inferred token groups and names.
 * @param tokens - String-valued token groups.
 * @returns The same token object, with literal keys preserved.
 * @category tokens
 * @since 0.1.0
 */
export const defineTokens = <T extends AnySimpleTokens>(tokens: T) => tokens;

/**
 * Declare token values selected by preset conditions such as `_dark`.
 *
 * Use this for semantic values that change with a theme context. The
 * condition keys must be present in the condition map passed as the first
 * argument; unlike a raw token, the value is intentionally not flattened
 * into one static string.
 *
 * @example A semantic color with a dark-mode value
 * ```ts
 * import { defineSemanticTokens } from "pandwind/preset";
 *
 * const conditions = { _dark: ".dark &" };
 * const semanticTokens = defineSemanticTokens(conditions, {
 *   colors: {
 *     surface: { _dark: "#111827" },
 *   },
 * });
 * ```
 *
 * @typeParam TConditions - The condition map used by the token values.
 * @typeParam TTokens - The inferred semantic token groups and names.
 * @param _conditions - The condition names and selectors available to the tokens.
 * @param tokens - Token values keyed by those conditions.
 * @returns The same semantic token object, with literal keys preserved.
 * @category tokens
 * @since 0.1.0
 */
export const defineSemanticTokens = <
	TConditions extends AnyConditions,
	TTokens extends AnySemanticTokens<keyof TConditions & string>,
>(
	_conditions: TConditions,
	tokens: TTokens,
) => tokens;

/**
 * Preserve a condition map as typed preset metadata.
 *
 * Conditions are written as selectors or at-rules. Their keys become the
 * nested keys accepted by `css`, while their values control the generated
 * stylesheet.
 *
 * @example
 * ```ts
 * import { defineConditions } from "pandwind/preset";
 *
 * const conditions = defineConditions({
 *   _hover: "&:hover",
 *   _dark: ".dark &",
 * });
 * ```
 *
 * @typeParam T - The inferred condition names and selectors.
 * @param cond - Condition names mapped to selectors or at-rules.
 * @returns The same condition map, with literal keys preserved.
 * @category presets
 * @since 0.1.0
 */
export const defineConditions = <T extends AnyConditions>(cond: T) => cond;

/**
 * Preserve the property-to-token vocabulary used by a preset.
 *
 * `true` leaves a property open to the CSS config. A token map makes the
 * property's accepted values come from that map, which is what enables
 * strict token references in `createCss(preset)`.
 *
 * @example
 * ```ts
 * import { defineProperties } from "pandwind/preset";

 * const properties = defineProperties({
 *   backgroundColor: { "$brand-500": "#2563eb" },
 *   padding: true,
 * });
 * ```
 *
 * @typeParam T - The inferred property vocabulary.
 * @param props - CSS properties and their allowed token values.
 * @returns The same property map, with literal keys preserved.
 * @category presets
 * @since 0.1.0
 */
export const defineProperties = <T extends AnyPresetProperties<any, any>>(props: T) => props;
