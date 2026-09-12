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
 * Preserve literal token and CSS config types for a preset theme.
 *
 * @example
 * ```ts
 * import { defineTheme, defineTokens, type StandardProperties } from "pandwind/preset";
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
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { definePreset, type StandardProperties } from "pandwind/preset";
 *
 * const preset = definePreset(
 *   {
 *     config: {} as StandardProperties,
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
 * Preserve literal names in a raw token map.
 *
 * Values may be CSS values or references to another token path.
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
 * Define token values that change under preset conditions such as `_dark`.
 *
 * @example
 * ```ts
 * import { defineSemanticTokens } from "pandwind/preset";
 *
 * const conditions = { base: "", _dark: ".dark &" };
 * const semanticTokens = defineSemanticTokens(conditions, {
 *   colors: {
 *     surface: { base: "#ffffff", _dark: "#111827" },
 *   },
 * });
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
export const defineProperties = <T extends AnyPresetProperties<any, any>>(props: T) => props;
