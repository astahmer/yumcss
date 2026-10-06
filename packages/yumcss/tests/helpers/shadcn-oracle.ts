/**
 * shadcn/ui create-page oracle: upstream's css-variable folding, transcribed.
 *
 * There is no live module to load here. Chakra's preset can call the installed
 * `@chakra-ui/react` and Tailwind's can read its installed stylesheet, but the
 * shadcn values this preset ships live in the shadcn/ui repository rather than
 * in the published `shadcn` package: a project installs the CLI, the schema,
 * and the `tailwind.css` bridge, while the base colors, the accent overlays,
 * and the radius multipliers are repository files.
 * `scripts/promote-shadcn-preset.ts` reads those files from the pinned
 * checkout at generation time, so the checked-in data is the only copy both
 * sides of the parity test can see. This module therefore re-implements the
 * create page's own folding of a design-system config over that data, and the
 * test compares the preset against upstream's *algorithm* instead of against
 * the preset's own helpers.
 *
 * Transcribed from the pinned shadcn/ui commit
 * `683a5a9b370acdb7785a0529434e6a3b8c7e0441`:
 *
 * - `apps/v4/registry/config.ts` — `buildRegistryTheme`,
 *   `buildThemeForPreset`, the `themeVars` half of `buildRegistryBase`, and
 *   `DEFAULT_RADIUS_VALUE`.
 * - `apps/v4/app/(app)/(create)/components/design-system-provider.tsx` — the
 *   `lyra` / `sera` / `rhea` radius rewrite.
 * - `apps/v4/app/(app)/(create)/lib/build-instructions.ts` — the radius
 *   multipliers a generated project stylesheet publishes.
 */
import { shadcnTheme } from "../../src/preset/generated/shadcn-theme.ts";
import type { ShadcnConfig, ShadcnRadiusName, ShadcnStyleName } from "../../src/preset/shadcn.ts";

const chartRoles = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

/** The properties a create-page config resolves into, per color mode. */
export interface ShadcnOracleVariables {
	readonly dark: Record<string, string>;
	readonly light: Record<string, string>;
}

/**
 * The declared value of a property name, or a failure when the data has none.
 *
 * Upstream reads these records with plain property access, so a missing name
 * would propagate `undefined`. The oracle throws instead: a data hole is a
 * generator bug, and silently dropping a color role would make the parity test
 * agree with a wrong preset.
 */
const declare = (variables: Record<string, string>, name: string): string => {
	const value = variables[name];
	if (value === undefined) throw new Error("The generated shadcn data declares no --" + name + ".");
	return value;
};

/**
 * `design-system-provider.tsx` L89 and L144-151: the create page rewrites the
 * query string for three style / radius pairs, so the config it builds and the
 * URL a project copies both carry the coerced radius.
 */
export const effectiveRadius = (
	style: ShadcnStyleName,
	radius: ShadcnRadiusName,
): ShadcnRadiusName => {
	if (style === "lyra" || (style === "sera" && radius !== "none")) return "none";
	if (style === "rhea" && radius === "large") return "default";
	return radius;
};

/**
 * `buildRegistryTheme`: base color, then theme, then the chart override in
 * both modes, then the bold menu accent, then the radius.
 *
 * The chart loop is what makes a `zinc` palette take `red`'s chart roles
 * while keeping its own neutrals; the accent rewrite is what makes "bold" mean
 * "the accent surfaces restate primary"; and the radius writes
 * `RADII[radius].value` only when it is non-empty, so `default` leaves the
 * base color's own `--radius` in place.
 */
const buildRegistryTheme = (config: ShadcnConfig): ShadcnOracleVariables => {
	const baseColor = shadcnTheme.baseColors[config.baseColor];
	const theme = shadcnTheme.themes[config.theme];
	const chartTheme = shadcnTheme.themes[config.chartColor];
	const light: Record<string, string> = { ...baseColor.light, ...theme.light };
	const dark: Record<string, string> = { ...baseColor.dark, ...theme.dark };

	for (const role of chartRoles) {
		light[role] = chartTheme.light[role];
		dark[role] = chartTheme.dark[role];
	}

	if (config.menuAccent === "bold") {
		light.accent = declare(light, "primary");
		light["accent-foreground"] = declare(light, "primary-foreground");
		dark.accent = declare(dark, "primary");
		dark["accent-foreground"] = declare(dark, "primary-foreground");
	}

	const radiusValue = shadcnTheme.radiusValues[effectiveRadius(config.style, config.radius)];
	if (radiusValue !== "") light.radius = radiusValue;

	return { dark, light };
};

/**
 * `buildThemeForPreset`: `buildRegistryTheme` plus the radius the config
 * resolves to, which is the base color's value when the radius is `default`
 * and `DEFAULT_RADIUS_VALUE` when even that is absent.
 */
export const buildThemeForPreset = (config: ShadcnConfig): ShadcnOracleVariables => {
	const variables = buildRegistryTheme(config);
	const coerced = effectiveRadius(config.style, config.radius);
	const radius = shadcnTheme.radiusValues[coerced];
	const radiusValue =
		coerced === "default"
			? (variables.light.radius ?? shadcnTheme.defaultRadiusValue)
			: radius !== ""
				? radius
				: variables.light.radius;
	if (radiusValue !== undefined) variables.light.radius = radiusValue;
	return variables;
};

/** `getInheritedHeadingFontValue`: the body font's own custom property. */
const inheritedHeadingFont = (font: ShadcnConfig["font"]): string =>
	"var(" + shadcnTheme.fonts[font].variable + ")";

/**
 * The `theme` css-vars block `buildRegistryBase` publishes: empty unless the
 * heading font is `inherit` (or spelled as the body font, which normalizes to
 * `inherit`), in which case `--font-heading` points at the body font's own
 * variable.
 */
export const buildRegistryBaseThemeVars = (config: ShadcnConfig): Record<string, string> => {
	const normalizedHeading = config.fontHeading === config.font ? "inherit" : config.fontHeading;
	return normalizedHeading === "inherit"
		? { "--font-heading": inheritedHeadingFont(config.font) }
		: {};
};
