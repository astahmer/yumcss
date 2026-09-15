import type {
	AnyConditions,
	AnyTokens,
	AnySemanticTokens,
	AnySimpleTokens,
	CssPreset,
	DefinePresetOptions,
} from "./typings.ts";

export * from "./typings.ts";

/**
 * Preserve literal token and CSS config types for a preset theme.
 *
 * `defineTheme` is a zero-cost identity function. Its `config` value is a
 * compile-time witness for the CSS properties and raw values the preset may
 * expose; use it when the theme is named or composed separately.
 *
 * @example
 * ```ts
 * import { defineTheme, defineTokens, type PandwindProperties } from "pandwind/preset";
 *
 * const tokens = defineTokens({
 *   colors: { "$brand-500": "#2563eb" },
 *   spacing: { 4: "1rem" },
 * });
 *
 * const cssConfig: PandwindProperties = {};
 * const theme = defineTheme({
 *   config: cssConfig,
 *   tokens,
 * });
 * ```
 *
 * @typeParam TTheme - Inferred theme shape, including literal token names.
 * @param theme - Theme values to preserve.
 * @returns The same object, with its literal types intact.
 * @category presets
 * @since 0.1.0
 */
export const defineTheme = <TTheme extends DefinePresetOptions>(theme: TTheme) => theme;

/**
 * Combine theme values with the condition and property metadata used by CSS factories.
 *
 * `strict: true` exposes mapped token names; `$strictness: "inherits"` also
 * allows the property's raw CSS values.
 * Use the resulting preset with `createCss`, `createDesignCss`, or the
 * stylesheet compiler. `$all` adds configured property names but does not bind
 * every token group to every property.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { definePreset, type PandwindProperties } from "pandwind/preset";
 *
 * const cssConfig: PandwindProperties = {};
 *
 * const preset = definePreset(
 *   {
 *     config: cssConfig,
 *     tokens: { colors: { "$brand-500": "#2563eb" } },
 *   },
 *   {
 *     strict: true,
 *     conditions: {},
 *     properties: {
 *       backgroundColor: { $tokens: "colors" },
 *     },
 *   },
 * );
 *
 * const css = createCss(preset);
 * css.class({ backgroundColor: "$brand-500" });
 * ```
 *
 * @typeParam TTheme - Theme value shape.
 * @typeParam TConfig - CSS property configuration shape.
 * @typeParam TTokens - Token groups and literal token names.
 * @typeParam TPreset - Resulting preset shape.
 * @param theme - Values, optionally produced by {@link defineTheme}.
 * @param preset - Conditions, strictness, and property-to-token mappings.
 * @returns A preset carrying both runtime metadata and inferred token types.
 * @see {@link defineTokens} for the raw token layer.
 * @see {@link createCss} for consuming the resulting preset.
 * @category presets
 * @since 0.1.0
 */
export function definePreset<
	TTheme extends DefinePresetOptions<object, AnyTokens>,
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
 * Preserve literal names in a raw token map.
 *
 * Values may be CSS values or references to another token path.
 * Keep stable semantic or component roles as references so a theme can rebind
 * the underlying raw value without changing component styles.
 *
 * @example
 * ```ts
 * import { defineTokens } from "pandwind/preset";
 *
 * const tokens = defineTokens({
 *   colors: {
 *     "$blue-500": "#3182ce",
 *     "$gray-50": "#f9fafb",
 *   },
 *   spacing: { 4: "1rem", 6: "1.5rem" },
 *   component: { "component.card.bg": "semantic.bg.primary" },
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
 * Preserve named static color palette assignments for a preset.
 *
 * A string source exposes every suffix below a color-token root. An object
 * source gives a palette stable names whose values point at the project's own
 * color tokens. The stylesheet compiler turns either form into one class with
 * custom-property assignments; no runtime color map is required.
 *
 * @example
 * ```ts
 * import { defineColorPalettes } from "pandwind/preset";
 *
 * const colorPalettes = defineColorPalettes({
 *   blue: "colors.blue",
 *   brand: {
 *     solid: "colors.blue.500",
 *     contrast: "colors.gray.50",
 *   },
 * });
 * ```
 *
 * @typeParam T - The inferred palette names and token references.
 * @param palettes - Static palette roots or named token-reference maps.
 * @returns The same palette object, with its literal keys preserved.
 * @category tokens
 * @since 0.1.0
 */
export const defineColorPalettes = <
	const T extends Record<string, string | Record<string, string>>,
>(
	palettes: T,
) => palettes;

/**
 * Define token values that change under preset conditions such as `_dark`.
 *
 * Condition keys must exist in the condition map and are kept as branches
 * rather than flattened into one static value.
 * When semantic values are token paths, use the zero-runtime
 * {@link SemanticTokenLayer} witness with `satisfies` so references are
 * checked against the project's own token catalog.
 *
 * @example
 * ```ts
 * import { defineSemanticTokens, defineTokens, type SemanticTokenLayer } from "pandwind/preset";
 *
 * const tokens = defineTokens({ colors: { white: "#ffffff", black: "#000000" } });
 * const conditions = { base: "", _dark: ".dark &" };
 * const semanticTokens = defineSemanticTokens(conditions, {
 *   colors: {
 *     surface: { base: "colors.white", _dark: "colors.black" },
 *   },
 * } satisfies SemanticTokenLayer<typeof conditions, typeof tokens>);
 * ```
 *
 * @typeParam TConditions - The condition map used by the token values.
 * @typeParam TTokens - The inferred semantic token groups and names.
 * @param _conditions - Conditions available to the token values.
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
 * Keys become nested condition names in style objects; values are selectors or
 * at-rules used when the stylesheet is generated.
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
 * Use `$tokens` for a token group, `$all` for all configured properties, and
 * `$strictness: "inherits"` when a mapped property also accepts raw CSS values.
 * `true` uses the corresponding CSS config values, while `$all` adds property
 * names only and does not create token bindings.
 *
 * @example
 * ```ts
 * import { defineProperties } from "pandwind/preset";
 *
 * const properties = defineProperties({
 *   $all: true,
 *   backgroundColor: { $tokens: "colors", $strictness: "inherits" },
 *   padding: { $tokens: "spacing" },
 * });
 * ```
 *
 * @typeParam T - The inferred property vocabulary.
 * @param props - CSS properties and their allowed token values.
 * @returns The same property map, with literal keys preserved.
 * @category presets
 * @since 0.1.0
 */
export const defineProperties = <const T extends object>(props: T) => props;
