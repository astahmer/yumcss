import { createCss } from "pandwind/css";
import { define, type PandwindProperties } from "pandwind/preset";

const conditions = define.conditions({
	base: "",
	_hover: "&:hover",
	_dark: ".dark &",
	md: "@media (min-width: 768px)",
});

const tokens = define.tokens({
	colors: {
		"$blue-500": "#2563eb",
		"$blue-600": "#1d4ed8",
		"$gray-50": "#f9fafb",
		"$gray-900": "#111827",
		$white: "#ffffff",
	},
	spacing: {
		2: "0.5rem",
		4: "1rem",
		6: "1.5rem",
		8: "2rem",
	},
	radii: {
		sm: "0.25rem",
		md: "0.375rem",
		lg: "0.5rem",
	},
	fonts: { sans: "ui-sans-serif, system-ui, sans-serif" },
	fontSizes: { sm: "0.875rem", md: "1rem", lg: "1.125rem" },
	fontWeights: { medium: "500", bold: "700" },
	lineHeights: { normal: "1.5" },
});

const themedTokens = tokens.defineSemanticTokens(conditions, {
	semantic: {
		surface: { base: "colors.$gray-50", _dark: "colors.$gray-900" },
	},
});

const colorPalettes = themedTokens.defineColorPalettes({
	brand: {
		solid: "colors.$blue-600",
		contrast: "colors.$white",
	},
});

const properties = define.properties({
	display: true,
	alignItems: true,
	color: { $tokens: "colors", $strict: false },
	backgroundColor: { $tokens: "colors", $strict: false },
	padding: { $tokens: "spacing" },
	gap: { $tokens: "spacing" },
	borderRadius: { $tokens: "radii" },
	fontFamily: { $tokens: "fonts" },
	fontSize: { $tokens: "fontSizes" },
	fontWeight: { $tokens: "fontWeights" },
	lineHeight: { $tokens: "lineHeights" },
});

const config: PandwindProperties = {};
const theme = define.theme({ config, tokens: themedTokens });

export const preset = define.preset(theme, {
	strict: true,
	conditions,
	properties,
	colorPalettes,
});

const css = createCss(preset);

const cards = [
	css.class({
		display: "flex",
		color: "$blue-500",
		backgroundColor: "colorPalette.solid",
		colorPalette: "brand",
		padding: 4,
		borderRadius: "md",
		_hover: { color: "$blue-600" },
		_dark: { backgroundColor: "$gray-900" },
		md: { padding: 6 },
	}),
	css.class({
		display: "flex",
		color: "$gray-900",
		backgroundColor: "$gray-50",
		padding: 8,
		borderRadius: "lg",
	}),
	css.class({ display: "flex", color: "$blue-600", padding: 2, gap: 4 }),
	css.class({ display: "flex", color: "$gray-900", padding: 4, gap: 6 }),
	css.class({ display: "flex", color: "$blue-500", padding: 6, gap: 8 }),
	css.class({ display: "flex", color: "$gray-900", padding: 8, gap: 2 }),
	css.class({ display: "flex", color: "$blue-600", padding: 2, gap: 4 }),
	css.class({ display: "flex", color: "$gray-900", padding: 4, gap: 6 }),
];

const compiled = css(
	{ color: "$blue-500", padding: 4 },
	{ backgroundColor: "colorPalette.solid", colorPalette: "brand" },
	{ _dark: { color: "$gray-900" } },
);
const props = css.props(compiled, css.vars({ color: "var(--runtime-color)" }));

export const workload = { cards, compiled, props, preset, theme, themedTokens };
