import {
	definePreset,
	defineSemanticTokens,
	defineTheme,
	defineTokens,
	type PandwindProperties,
} from "pandwind/preset";

const tokens = defineTokens({
	colors: {
		$white: "#ffffff",
		$black: "#000000",
		"$gray-50": "#f9fafb",
		"$gray-100": "#f3f4f6",
		"$gray-200": "#e5e7eb",
		"$gray-300": "#d1d5db",
		"$gray-400": "#9ca3af",
		"$gray-500": "#6b7280",
		"$gray-600": "#4b5563",
		"$gray-700": "#374151",
		"$gray-800": "#1f2937",
		"$gray-900": "#111827",
		"$blue-50": "#ebf8ff",
		"$blue-100": "#bee3f8",
		"$blue-200": "#90cdf4",
		"$blue-300": "#63b3ed",
		"$blue-400": "#4299e1",
		"$blue-500": "#3182ce",
		"$blue-600": "#2b6cb0",
		"$blue-700": "#2c5282",
		"$blue-800": "#2a4365",
		"$blue-900": "#1A365D",
		"$red-50": "#FFF5F5",
		"$red-100": "#FED7D7",
		"$red-200": "#FEB2B2",
		"$red-300": "#FC8181",
		"$red-400": "#F56565",
		"$red-500": "#E53E3E",
		"$red-600": "#C53030",
		"$red-700": "#9B2C2C",
		"$red-800": "#822727",
		"$red-900": "#63171B",
		"$green-50": "#F7FAFC",
		"$green-100": "#EFF6F8",
		"$green-200": "#D7E8EE",
		"$green-300": "#BFDAE4",
		"$green-400": "#90BFD0",
		"$green-500": "#60A3BC",
		"$green-600": "#5693A9",
		"$green-700": "#3A6271",
		"$green-800": "#2B4955",
		"$green-900": "#1D3138",
	},
	radii: {
		none: "0",
		sm: "0.125rem",
		base: "0.25rem",
		md: "0.375rem",
		lg: "0.5rem",
		xl: "0.75rem",
		"2xl": "1rem",
		"3xl": "1.5rem",
		full: "9999px",
	},
	spacing: {
		4: "4px",
		8: "8px",
		12: "12px",
		16: "16px",
		20: "20px",
		24: "24px",
	},
	fonts: {
		sans: "ui-sans-serif, system-ui, sans-serif",
		serif: "ui-serif, Georgia, serif",
		mono: "ui-monospace, SFMono-Regular, monospace",
	},
	fontSizes: {
		xs: "0.75rem",
		sm: "0.875rem",
		base: "1rem",
		lg: "1.125rem",
		xl: "1.25rem",
		"2xl": "1.5rem",
		"3xl": "1.875rem",
		"4xl": "2.25rem",
	},
	fontWeights: {
		normal: "400",
		medium: "500",
		semibold: "600",
		bold: "700",
	},
	lineHeights: {
		none: "1",
		tight: "1.25",
		snug: "1.375",
		normal: "1.5",
		relaxed: "1.625",
		loose: "2",
	},
	letterSpacings: {
		tighter: "-0.05em",
		tight: "-0.025em",
		normal: "0em",
		wide: "0.025em",
		wider: "0.05em",
		widest: "0.1em",
	},
});

const semanticTokens = defineTokens({
	colors: {
		brand: tokens.colors["$blue-600"],
		success: tokens.colors["$green-500"],
		error: tokens.colors["$red-500"],
	},
	spacing: {
		"button.padding": tokens.spacing["20"],
	},
});

// Condition-bound tokens live in their own group and use
// defineSemanticTokens (values keyed by preset condition names). They bridge
// into @theme as --color-surface plus a `.dark` override rule.
const conditionBoundTokens = defineSemanticTokens(
	{ _dark: ".dark &" },
	{
		semantic: {
			surface: { base: tokens.colors["$gray-50"], _dark: tokens.colors["$gray-900"] },
		},
	},
);

const cssConfig: PandwindProperties = {};

const theme = defineTheme({
	config: cssConfig,
	tokens: {
		colors: {
			...tokens.colors,
			...semanticTokens.colors,
		},
		semantic: {
			...conditionBoundTokens.semantic,
		},
		spacing: {
			...tokens.spacing,
			...semanticTokens.spacing,
		},
		radii: tokens.radii,
		fonts: tokens.fonts,
		fontSizes: tokens.fontSizes,
		fontWeights: tokens.fontWeights,
		lineHeights: tokens.lineHeights,
		letterSpacings: tokens.letterSpacings,
	},
});

export const examplePreset = definePreset(theme, {
	strict: true,
	conditions: {
		// State modifiers
		_hover: "&:hover",
		_focus: "&:focus",
		_active: "&:active, &[data-active=true]",
		_disabled: "&:disabled, &[aria-disabled=true]",
		// Color modes
		_dark: ".dark &",
		_light: ".light &",
		// Mixed
		_supportHover: ["@media (hover: hover) and (pointer: fine)", "&:hover"],
		// Breakpoints
		smDown: "@media (max-width: 640px)",
		sm: "@media (min-width: 640px)",
		smToMedium: "@media (min-width: 640px) and (max-width: 768px)",
		mdDown: "@media (max-width: 768px)",
		md: "@media (min-width: 768px)",
		mdToLarge: "@media (min-width: 768px) and (max-width: 1024px)",
		lgDown: "@media (max-width: 1024px)",
		lg: "@media (min-width: 1024px)",
		lgToXl: "@media (min-width: 1024px) and (max-width: 1280px)",
		xl: "@media (min-width: 1280px)",
	},
	properties: {
		display: true,
		margin: true,
		color: {
			$strictness: "inherits",
			...tokens.colors,
			...semanticTokens.colors,
		},
		backgroundColor: tokens.colors,
		borderColor: tokens.colors,
		borderRadius: tokens.radii,
		padding: {
			...tokens.spacing,
			...semanticTokens.spacing,
		},
		marginTop: {
			// $strictness: "inherits",
			$tokens: "spacing",
		},
		width: {
			"1/2": "50%",
		},
		height: true,
		fontSize: true,
	},
});

/**
 * Codegen-only theme scopes used by the basic example. The utility classes do
 * not change when the data-theme attribute changes; only these variables do.
 */
export const exampleThemeScopes = {
	themes: {
		ocean: {
			"--color-brand": "#0369a1",
			"--color-surface": "#f0f9ff",
		},
		forest: {
			"--color-brand": "#166534",
			"--color-surface": "#f0fdf4",
		},
		sunset: {
			"--color-brand": "#c2410c",
			"--color-surface": "#fff7ed",
		},
	},
} as const;
// examplePreset.;

export type ExamplePreset = typeof examplePreset;
