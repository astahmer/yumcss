import { define } from "../types/define-preset.export.ts";
import type { CssVariables } from "../types/typings.ts";
import { presetConditions } from "./conditions.ts";
import { shadcnTheme } from "./generated/shadcn-theme.ts";
import type { PandwindProperties } from "./properties.ts";
import { shadcnPreset as defaultShadcnPreset } from "./shadcn-default.ts";
import { createShadcnProperties } from "./shadcn-properties.ts";

/** A base color the shadcn registry publishes values for. */
export type ShadcnBaseColor = (typeof shadcnTheme.baseColorNames)[number];

/** A theme the shadcn registry publishes values for, base colors included. */
export type ShadcnThemeName = (typeof shadcnTheme.themeNames)[number];

/** A style the shadcn registry ships. Most only decorate components. */
export type ShadcnStyleName = (typeof shadcnTheme.styles)[number];

/** A font the shadcn registry ships a family and a custom property for. */
export type ShadcnFontName = (typeof shadcnTheme.fontOrder)[number];

/** A heading font: any shipped font, or the body font through `inherit`. */
export type ShadcnFontHeadingName = ShadcnFontName | "inherit";

/** A radius choice the create page offers. */
export type ShadcnRadiusName = keyof typeof shadcnTheme.radiusValues;

/** How strongly the menu accent restates the primary color. */
export type ShadcnMenuAccent = (typeof shadcnTheme.menuAccents)[number];

/** Which surface the menu colors are authored against. */
export type ShadcnMenuColor = (typeof shadcnTheme.menuColors)[number];

type ShadcnBaseColorLightVariables = (typeof shadcnTheme.baseColors)["neutral"]["light"];

/**
 * A color role a shadcn base color declares.
 *
 * `radius` is one of the base color's published properties but holds a length,
 * so it is a radius rather than a color and lives in the `radii` group.
 */
export type ShadcnColorRole = Exclude<keyof ShadcnBaseColorLightVariables, "radius">;

/** One color role, as the light and dark values the registry declares. */
type ShadcnColorToken = { readonly base: string; readonly _dark: string };

type ShadcnColorTokens = Record<`$${ShadcnColorRole}`, ShadcnColorToken>;

/**
 * Everything a shadcn project selects on the create page, plus the pointer
 * cursor switch. Every field is optional and falls back to
 * {@link shadcnTheme}'s own `defaults`.
 *
 * `baseColor` narrows `theme` and `chartColor`: a base color can only be
 * themed by itself or by an accent, and an impossible pair is rewritten to the
 * base color itself, which is what the create page does with the same input.
 */
export interface ShadcnPresetOptions {
	readonly baseColor?: ShadcnBaseColor;
	readonly theme?: ShadcnThemeName;
	readonly chartColor?: ShadcnThemeName;
	readonly style?: ShadcnStyleName;
	readonly font?: ShadcnFontName;
	readonly fontHeading?: ShadcnFontHeadingName;
	readonly radius?: ShadcnRadiusName;
	readonly menuAccent?: ShadcnMenuAccent;
	readonly menuColor?: ShadcnMenuColor;
	readonly pointer?: boolean;
}

/** A fully resolved configuration: no optional field is left open. */
export interface ShadcnConfig {
	readonly baseColor: ShadcnBaseColor;
	readonly theme: ShadcnThemeName;
	readonly chartColor: ShadcnThemeName;
	readonly style: ShadcnStyleName;
	readonly font: ShadcnFontName;
	readonly fontHeading: ShadcnFontHeadingName;
	readonly radius: ShadcnRadiusName;
	readonly menuAccent: ShadcnMenuAccent;
	readonly menuColor: ShadcnMenuColor;
	readonly pointer: boolean;
}

/** The custom property blocks a shadcn project's stylesheet declares. */
export interface ShadcnDeclarations {
	readonly cssVariables: CssVariables;
	readonly pointerCss: string | undefined;
}

/** The chart roles the create page's chart color overrides. */
const chartRoles = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

const readVariable = (variables: Readonly<Record<string, string>>, name: string): string => {
	const value = variables[name];
	if (value === undefined)
		throw new Error(
			`The generated shadcn data declares no --${name}; regenerate it with pnpm run presets:generate.`,
		);
	return value;
};

/**
 * The themes the create page allows for one base color.
 *
 * A base color can only be themed by itself or by an accent: pairing `zinc`
 * with `stone` would publish two competing neutral ramps.
 */
export const shadcnThemesForBaseColor = (
	baseColor: ShadcnBaseColor,
): ReadonlyArray<ShadcnThemeName> => {
	const baseColorNames: ReadonlySet<string> = new Set(shadcnTheme.baseColorNames);
	return shadcnTheme.themeNames.filter((name) => name === baseColor || !baseColorNames.has(name));
};

// The create page derives this from the selected style on render and rewrites
// the query string so the built config carries the coerced radius. Resolving it
// here means the preset matches what the page actually builds, including the
// `sera` rewrite a project form would have to repeat.
const radiusForStyle = (style: ShadcnStyleName, radius: ShadcnRadiusName): ShadcnRadiusName => {
	if (style === "lyra" || (style === "sera" && radius !== "none")) return "none";
	if (style === "rhea" && radius === "large") return "default";
	return radius;
};

const assertSupported = (
	selection: Pick<ShadcnConfig, "baseColor" | "theme" | "chartColor">,
): void => {
	const baseColorNames: ReadonlySet<string> = new Set(shadcnTheme.baseColorNames);
	const themeNames: ReadonlySet<string> = new Set(shadcnTheme.themeNames);
	const unsupportedNames: ReadonlySet<string> = new Set([
		...shadcnTheme.unsupportedBaseColors,
		...shadcnTheme.unsupportedThemes,
	]);
	if (unsupportedNames.has(selection.baseColor) || !baseColorNames.has(selection.baseColor))
		throw new Error(
			`shadcn publishes no values for the "${selection.baseColor}" base color; choose one of ${shadcnTheme.baseColorNames.join(", ")}.`,
		);
	for (const theme of [selection.theme, selection.chartColor]) {
		if (unsupportedNames.has(theme) || !themeNames.has(theme))
			throw new Error(
				`shadcn publishes no values for the "${theme}" theme; choose one of ${shadcnTheme.themeNames.join(", ")}.`,
			);
	}
};

/**
 * Resolve and validate a create-page configuration.
 *
 * Validation is a runtime guard for callers that build the configuration from
 * untrusted input; the option types already exclude the gray base color and
 * the gray accent the registry lists but publishes no values for. A base color
 * paired with a theme it cannot take is not an error: the create page rewrites
 * the pair to the first theme the base color allows, which is the base color
 * itself, and the preset follows so a resolved configuration is always one the
 * page could build.
 */
export const resolveShadcnConfig = (options: ShadcnPresetOptions = {}): ShadcnConfig => {
	const { defaults } = shadcnTheme;
	const baseColor = options.baseColor ?? defaults.baseColor;
	const style = options.style ?? defaults.style;
	const radius = options.radius ?? defaults.radius;
	const theme = options.theme ?? defaults.theme;
	const chartColor = options.chartColor ?? options.theme ?? defaults.chartColor;
	assertSupported({ baseColor, theme, chartColor });
	const allowed = shadcnThemesForBaseColor(baseColor);
	const selectTheme = (name: ShadcnThemeName): ShadcnThemeName =>
		allowed.includes(name) ? name : (allowed[0] ?? baseColor);

	return {
		baseColor,
		theme: selectTheme(theme),
		chartColor: selectTheme(chartColor),
		style,
		font: options.font ?? defaults.font,
		fontHeading: options.fontHeading ?? defaults.fontHeading,
		radius: radiusForStyle(style, radius),
		menuAccent: options.menuAccent ?? defaults.menuAccent,
		menuColor: options.menuColor ?? defaults.menuColor,
		pointer: options.pointer ?? false,
	};
};

/**
 * The `:root` and `.dark` values one configuration declares.
 *
 * The base-color record and the theme record overlap, and the theme wins: that
 * is what makes `zinc` + `red` keep zinc's neutrals and take red's primary,
 * chart, and sidebar-primary roles. The chart roles then override both modes
 * from the chart color, the bold menu accent restates the primary color, and
 * the radius resolves through the style rules.
 */
export const shadcnColorVariables = (
	config: ShadcnConfig,
): { readonly light: Record<string, string>; readonly dark: Record<string, string> } => {
	const { baseColors, themes, radiusValues, defaultRadiusValue } = shadcnTheme;
	const baseColor = baseColors[config.baseColor];
	const theme = themes[config.theme];
	const chartColor = themes[config.chartColor];
	const light: Record<string, string> = { ...baseColor.light, ...theme.light };
	const dark: Record<string, string> = { ...baseColor.dark, ...theme.dark };

	for (const role of chartRoles) {
		light[role] = chartColor.light[role];
		dark[role] = chartColor.dark[role];
	}

	if (config.menuAccent === "bold") {
		light.accent = readVariable(light, "primary");
		light["accent-foreground"] = readVariable(light, "primary-foreground");
		dark.accent = readVariable(dark, "primary");
		dark["accent-foreground"] = readVariable(dark, "primary-foreground");
	}

	const radiusOverride = radiusValues[config.radius];
	light.radius = radiusOverride !== "" ? radiusOverride : (light.radius ?? defaultRadiusValue);

	return { light, dark };
};

/**
 * The custom properties one configuration declares for its fonts.
 *
 * The body font publishes its family under the custom property the registry
 * definition names, and `--font-heading` either inherits the body font or
 * carries the heading font's own family, which is what the separate
 * `font-heading-*` registry item would publish.
 */
export const shadcnFontVariables = (config: ShadcnConfig): Readonly<Record<string, string>> => {
	const bodyFont = shadcnTheme.fonts[config.font];
	const normalizedHeading = config.fontHeading === config.font ? "inherit" : config.fontHeading;
	return {
		[bodyFont.variable.slice("--".length)]: bodyFont.family,
		"font-heading":
			normalizedHeading === "inherit"
				? `var(${bodyFont.variable})`
				: shadcnTheme.fonts[normalizedHeading].family,
	};
};

const fontTokens = (config: ShadcnConfig): Record<string, string> =>
	Object.fromEntries(
		Object.entries(shadcnFontVariables(config)).map(([variable, value]) => [
			variable.replace(/^font-/u, ""),
			value,
		]),
	);

// Every color role is written out rather than mapped over the generated record,
// because the literal keys are what give `color: "$background"` its typed
// completion. `ShadcnColorRole` is derived from the generated data, so a role
// the registry adds or renames fails this object's type check instead of
// disappearing from the preset. Each key is the registry's own property name
// behind Pandwind's `$` sigil, so the preset invents no vocabulary of its own.
const colorTokens = (config: ShadcnConfig): ShadcnColorTokens => {
	const { light, dark } = shadcnColorVariables(config);
	const pair = (role: ShadcnColorRole): ShadcnColorToken => ({
		base: readVariable(light, role),
		_dark: readVariable(dark, role),
	});
	return {
		$background: pair("background"),
		$foreground: pair("foreground"),
		$card: pair("card"),
		"$card-foreground": pair("card-foreground"),
		$popover: pair("popover"),
		"$popover-foreground": pair("popover-foreground"),
		$primary: pair("primary"),
		"$primary-foreground": pair("primary-foreground"),
		$secondary: pair("secondary"),
		"$secondary-foreground": pair("secondary-foreground"),
		$muted: pair("muted"),
		"$muted-foreground": pair("muted-foreground"),
		$accent: pair("accent"),
		"$accent-foreground": pair("accent-foreground"),
		$destructive: pair("destructive"),
		$border: pair("border"),
		$input: pair("input"),
		$ring: pair("ring"),
		"$chart-1": pair("chart-1"),
		"$chart-2": pair("chart-2"),
		"$chart-3": pair("chart-3"),
		"$chart-4": pair("chart-4"),
		"$chart-5": pair("chart-5"),
		$sidebar: pair("sidebar"),
		"$sidebar-foreground": pair("sidebar-foreground"),
		"$sidebar-primary": pair("sidebar-primary"),
		"$sidebar-primary-foreground": pair("sidebar-primary-foreground"),
		"$sidebar-accent": pair("sidebar-accent"),
		"$sidebar-accent-foreground": pair("sidebar-accent-foreground"),
		"$sidebar-border": pair("sidebar-border"),
		"$sidebar-ring": pair("sidebar-ring"),
	};
};

// shadcn switches color modes with the `.dark` class, which is already what the
// stock `_dark` condition selects. `base` is the unconditional layer and takes
// the empty selector the token emitter reads as `:root`.
const tokenConditions = { base: "", _dark: ".dark &" } as const;

/**
 * The non-token custom properties one configuration declares.
 *
 * Radius multipliers keep the `calc(var(--radius) * n)` form the shadcn
 * stylesheet publishes, so `--radius` has to be declared alongside them. The
 * color, radius, and font tokens can opt into their authored registry names
 * with `tokenVariableNames: "authored"`; the pointer rule is the base rule the
 * create page injects with the theme, present only when requested.
 */
export const shadcnDeclarations = (config: ShadcnConfig): ShadcnDeclarations => ({
	cssVariables: {
		radius: shadcnColorVariables(config).light.radius ?? "0.625rem",
	},
	pointerCss: config.pointer
		? `@layer base {\n  ${shadcnTheme.pointerSelector} {\n    cursor: pointer;\n  }\n}\n`
		: undefined,
});

const shadcnTokenVariables = (config: ShadcnConfig) => ({
	colors: Object.fromEntries(Object.keys(colorTokens(config)).map((name) => [name, name.slice(1)])),
	radii: Object.fromEntries(
		Object.keys(shadcnTheme.radiusMultipliers).map((name) => [name, `radius-${name}`]),
	),
	fonts: Object.fromEntries(Object.keys(fontTokens(config)).map((name) => [name, `font-${name}`])),
});

/**
 * Property vocabulary of {@link shadcnPreset}.
 *
 * It is {@link presetProperties} with the scales shadcn owns rebound to the
 * matching group: colors from `colors`, every radius property from `radii`,
 * and `fontFamily` from `fonts`. Shadows, z-indexes, and spacing keep the stock
 * Pandwind groups, because the registry publishes no scale for them.
 *
 * @category presets
 * @since 0.1.0
 */
export const shadcnProperties = /* @__PURE__ */ createShadcnProperties({
	colors: "colors",
	radii: "radii",
	fonts: "fonts",
});

/** The inferred property-vocabulary type of {@link shadcnProperties}. */
export type ShadcnProperties = typeof shadcnProperties;

/**
 * Condition map of {@link shadcnPreset}.
 *
 * The stock Pandwind conditions, unchanged: shadcn switches color modes with
 * the `.dark` class the stock `_dark` condition already selects, and the
 * registry publishes no breakpoints, so a project adds the ones it uses.
 *
 * @category presets
 * @since 0.1.0
 */
export const shadcnConditions = /* @__PURE__ */ define.conditions({ ...presetConditions });

/** The inferred condition-key type of {@link shadcnConditions}. */
export type ShadcnConditions = typeof shadcnConditions;

const shadcnCssConfig: PandwindProperties = {};

const buildShadcnPreset = (config: ShadcnConfig) => {
	const tokens = define
		.tokens({ radii: shadcnTheme.radiusMultipliers, fonts: fontTokens(config) })
		.defineSemanticTokens(tokenConditions, { colors: colorTokens(config) });

	return {
		...define.preset(
			{ config: shadcnCssConfig, tokens },
			{
				strict: true,
				conditions: shadcnConditions,
				properties: shadcnProperties,
			},
		),
		...shadcnDeclarations(config),
		tokenVariables: shadcnTokenVariables(config),
	};
};

/**
 * A shadcn preset for the create page's configuration: the token names a
 * shadcn project already writes, resolved by Pandwind's runtime.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { createShadcnPreset } from "pandwind/preset/shadcn";

 * const preset = createShadcnPreset({ baseColor: "zinc", theme: "red" });
 * const css = createCss(preset);
 * css.class({ color: "$foreground", backgroundColor: "$background", borderRadius: "$lg" });
 * ```
 *
 * @category presets
 * @since 0.1.0
 * @see {@link https://ui.shadcn.com/create | shadcn create}
 */
export const createShadcnPreset = (options: ShadcnPresetOptions = {}) =>
	buildShadcnPreset(resolveShadcnConfig(options));

/**
 * shadcn starter preset: the registry's own default configuration, resolved by
 * Pandwind's runtime.
 *
 * Color roles, radius multipliers, and fonts come from the pinned
 * `shadcn/ui` checkout through {@link shadcnTheme}, so the preset tracks that
 * revision instead of a transcribed list. Color roles keep their light / dark
 * pairs, so a bound property emits `:root` and `.dark` declarations and
 * switches with shadcn's own class.
 *
 * The registry's color, radius, and font names are available through the
 * opt-in `tokenVariableNames: "authored"` compiler option. The preset's flat
 * `cssVariables` contract keeps the genuine non-token `--radius` root value
 * available for the multiplier tokens.
 *
 * Bound scales resolve to the registry's values and emit their custom
 * properties; pass `tokens: "used"` to the stylesheet compiler when a project
 * wants only the tokens its styles reference.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { shadcnPreset } from "pandwind/preset/shadcn";

 * const css = createCss(shadcnPreset);
 * css.class({ padding: 4, color: "$foreground", backgroundColor: "$background" });
 * ```
 *
 * @category presets
 * @since 0.1.0
 * @see {@link https://ui.shadcn.com/create | shadcn create}
 */
export const shadcnPreset = defaultShadcnPreset;

/** The inferred type of {@link shadcnPreset} and {@link createShadcnPreset}. */
export type ShadcnPreset = typeof shadcnPreset;

/** Token catalog of {@link shadcnPreset}, for the registry's default config. */
export const shadcnTokens = shadcnPreset.tokens;

/** The inferred type of {@link shadcnTokens}. */
export type ShadcnTokens = typeof shadcnTokens;

/** The color roles {@link shadcnPreset} publishes, in declaration order. */
export const shadcnColorRoles: ReadonlyArray<ShadcnColorRole> = [
	"background",
	"foreground",
	"card",
	"card-foreground",
	"popover",
	"popover-foreground",
	"primary",
	"primary-foreground",
	"secondary",
	"secondary-foreground",
	"muted",
	"muted-foreground",
	"accent",
	"accent-foreground",
	"destructive",
	"border",
	"input",
	"ring",
	...chartRoles,
	"sidebar",
	"sidebar-foreground",
	"sidebar-primary",
	"sidebar-primary-foreground",
	"sidebar-accent",
	"sidebar-accent-foreground",
	"sidebar-border",
	"sidebar-ring",
];
