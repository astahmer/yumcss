import type { StandardProperties } from "csstype";
import {
	definePreset,
	defineTheme,
	defineTokens,
} from "../types/define-preset.ts";

const tokens = defineTokens({
	colors: {
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
});

const semanticTokens = defineTokens({
	colors: {
		success: tokens.colors["$green-500"],
		error: tokens.colors["$red-500"],
	},
	spacing: {
		"button.padding": tokens.spacing["20"],
	},
});

const theme = defineTheme({
	config: {} as StandardProperties,
	tokens: {
		colors: {
			...tokens.colors,
			...semanticTokens.colors,
		},
		spacing: {
			...tokens.spacing,
			...semanticTokens.spacing,
		},
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
		padding: tokens.spacing,
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
// examplePreset.;

export type ExamplePreset = typeof examplePreset;
