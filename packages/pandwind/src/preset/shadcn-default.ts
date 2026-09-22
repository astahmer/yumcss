import { define } from "../types/define-preset.export.ts";
import type { TokenGroupKey } from "../types/typings.ts";
import { presetConditions } from "./conditions.ts";
import { shadcnDefaultTheme } from "./generated/shadcn-default-theme.ts";
import type { PandwindProperties } from "./properties.ts";
import { createShadcnProperties } from "./shadcn-properties.ts";

type ShadcnDefaultTheme = typeof shadcnDefaultTheme;
type ShadcnDefaultBaseColorVariables = ShadcnDefaultTheme["colorVariables"]["light"];
type ShadcnDefaultColorRole = Exclude<keyof ShadcnDefaultBaseColorVariables, "radius">;
type ShadcnDefaultColorToken = { readonly base: string; readonly _dark: string };
type ShadcnDefaultColorTokens = Record<`$${ShadcnDefaultColorRole}`, ShadcnDefaultColorToken>;

type ShadcnDefaultTokenGroups = {
	readonly colors: ShadcnDefaultColorTokens;
	readonly radii: ShadcnDefaultTheme["radiusMultipliers"];
	readonly fonts: Readonly<Record<string, string>>;
};

type ShadcnDefaultTokenGroup = TokenGroupKey<ShadcnDefaultTokenGroups>;

const tokenConditions = { base: "", _dark: ".dark &" } as const;
const shadcnCssConfig: PandwindProperties = {};

const defaultLight = shadcnDefaultTheme.colorVariables.light;
const defaultDark = shadcnDefaultTheme.colorVariables.dark;

const readVariable = (variables: Readonly<Record<string, string>>, name: string): string => {
	const value = variables[name];
	if (value === undefined) throw new Error("The generated shadcn default data has no --" + name);
	return value;
};

const pair = (role: ShadcnDefaultColorRole): ShadcnDefaultColorToken => ({
	base: readVariable(defaultLight, role),
	_dark: readVariable(defaultDark, role),
});

const colorTokens: ShadcnDefaultColorTokens = {
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

const fontTokens = Object.fromEntries(
	Object.entries(shadcnDefaultTheme.fontVariables).map(([name, value]) => [
		name.replace(/^font-/u, ""),
		value,
	]),
);

const shadcnProperties = createShadcnProperties({
	colors: "colors",
	radii: "radii",
	fonts: "fonts",
});

const shadcnTokenVariables = {
	colors: Object.fromEntries(Object.keys(colorTokens).map((name) => [name, name.slice(1)])),
	radii: Object.fromEntries(
		Object.keys(shadcnDefaultTheme.radiusMultipliers).map((name) => [name, "radius-" + name]),
	),
	fonts: Object.fromEntries(Object.keys(fontTokens).map((name) => [name, "font-" + name])),
};

const shadcnTokens = define
	.tokens({ radii: shadcnDefaultTheme.radiusMultipliers, fonts: fontTokens })
	.defineSemanticTokens(tokenConditions, { colors: colorTokens });

export const shadcnPreset = {
	...define.preset(
		{ config: shadcnCssConfig, tokens: shadcnTokens },
		{
			strict: true,
			conditions: define.conditions({ ...presetConditions }),
			properties: shadcnProperties,
		},
	),
	cssVariables: {
		radius: shadcnDefaultTheme.radius,
	},
	pointerCss: undefined,
	tokenVariables: shadcnTokenVariables,
};
