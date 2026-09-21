import type {
	AnyConditions,
	AnyTokens,
	AnySemanticTokens,
	AnySimpleTokens,
	ColorPaletteDefinitions,
	CssPreset,
	DefinePresetOptions,
	TokenCatalog,
} from "./typings.ts";

export * from "./typings.ts";

/**
 * Preserve literal token and CSS config types for a preset theme.
 *
 * `define.theme` is a zero-cost identity function. Its `config` value is a
 * compile-time witness for the CSS properties and raw values the preset may
 * expose; use it when the theme is named or composed separately.
 *
 * @example
 * ```ts
 * import { define, type PandwindProperties } from "pandwind/preset";
 *
 * const tokens = define.tokens({
 *   colors: { "$brand-500": "#2563eb" },
 *   spacing: { 4: "1rem" },
 * });
 *
 * const cssConfig: PandwindProperties = {};
 * const theme = define.theme({
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
export const theme = <TTheme extends DefinePresetOptions>(theme: TTheme) => theme;

/**
 * Combine theme values with the condition and property metadata used by CSS factories.
 *
 * `strict: true` exposes mapped token names; `$strict: false` also
 * allows the property's raw CSS values.
 * `colorPalettes` adds named color roles that can be selected with
 * `colorPalette` and consumed as `colorPalette.<role>` values.
 * Palette sources are intentionally rooted in the `colors` token group; they
 * do not provide generic aliases for other token groups.
 * Use the resulting preset with `createCss`, `createDesignCss`, or the
 * stylesheet compiler. `$all` adds configured property names but does not bind
 * every token group to every property.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { define, type PandwindProperties } from "pandwind/preset";
 *
 * const cssConfig: PandwindProperties = {};
 *
 * const preset = define.preset(
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
 * @param theme - Values, optionally produced by {@link define.theme}.
 * @param preset - Conditions, strictness, and property-to-token mappings.
 * @returns A preset carrying both runtime metadata and inferred token types.
 * @see {@link define.tokens} for the raw token layer.
 * @see {@link createCss} for consuming the resulting preset.
 * @category presets
 * @since 0.1.0
 */
export function preset<
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
 * A lookup such as `tokens.colors["$blue-500"]` reads the current JavaScript
 * value and snapshots it; use a string such as `"colors.$blue-500"` for a
 * catalog-checked token reference.
 *
 * @example
 * ```ts
 * import { define } from "pandwind/preset";
 *
 * const tokens = define.tokens({
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
 * @returns A token catalog with literal keys and non-enumerable composition methods.
 * @category tokens
 * @since 0.1.0
 */
const createTokenCatalog = <T extends AnyTokens>(tokens: T): TokenCatalog<T> => {
	const catalog = { ...tokens };
	Object.defineProperties(catalog, {
		defineSemanticTokens: {
			enumerable: false,
			value: (_conditions: AnyConditions, semanticTokens: AnySemanticTokens<string>) => {
				const composed: AnyTokens = { ...catalog };
				for (const [group, groupTokens] of Object.entries(semanticTokens)) {
					const existingGroup = composed[group];
					composed[group] =
						existingGroup === undefined || typeof existingGroup === "function"
							? (groupTokens as Record<string, string | Record<string, string>>)
							: ({ ...existingGroup, ...groupTokens } as Record<
									string,
									string | Record<string, string>
								>);
				}
				return createTokenCatalog(composed);
			},
		},
		defineColorPalettes: {
			enumerable: false,
			value: (palettes: ColorPaletteDefinitions) => palettes,
		},
	});
	return catalog as TokenCatalog<T>;
};

/**
 * Preserve literal token names and return a composable token catalog.
 *
 * Semantic layers are merged into a new catalog and can be chained. Color
 * palettes remain separate preset metadata, but their token references are
 * checked against this catalog; pass the returned palette map to
 * `define.preset` as `colorPalettes`.
 * Palette sources are intentionally rooted in the `colors` token group; this
 * composer is not a generic alias mechanism for arbitrary token groups.
 *
 * @example
 * ```ts
 * import { define } from "pandwind/preset";
 *
 * const conditions = define.conditions({ base: "", _dark: ".dark &" });
 * const tokens = define.tokens({ colors: { white: "#fff", black: "#000" } });
 * const themedTokens = tokens.defineSemanticTokens(conditions, {
 *   semantic: {
 *     surface: { base: "colors.white", _dark: "colors.black" },
 *   },
 * });
 * const colorPalettes = themedTokens.defineColorPalettes({
 *   brand: { solid: "colors.white" },
 * });
 * ```
 *
 * @typeParam T - The inferred token groups and names.
 * @param tokens - String-valued token groups.
 * @returns A token catalog with non-enumerable composition methods.
 * @category tokens
 * @since 0.1.0
 */
export const tokens = <T extends AnySimpleTokens>(tokens: T): TokenCatalog<T> =>
	createTokenCatalog(tokens);

/**
 * Preserve a condition map as typed preset metadata.
 *
 * Keys become nested condition names in style objects; values are selectors or
 * at-rules used when the stylesheet is generated.
 *
 * @example
 * ```ts
 * import { define } from "pandwind/preset";
 *
 * const conditions = define.conditions({
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
export const conditions = <T extends AnyConditions>(cond: T) => cond;

/**
 * Preserve the property-to-token vocabulary used by a preset.
 *
 * Use `$tokens` for a token group, `$all` for all configured properties, and
 * `$strict: false` when a mapped property also accepts raw CSS values.
 * `true` uses the corresponding CSS config values, while `$all` adds property
 * names only and does not create token bindings.
 *
 * @example
 * ```ts
 * import { define } from "pandwind/preset";
 *
 * const properties = define.properties({
 *   $all: true,
 *   backgroundColor: { $tokens: "colors", $strict: false },
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
export const properties = <const T extends object>(props: T) => props;
