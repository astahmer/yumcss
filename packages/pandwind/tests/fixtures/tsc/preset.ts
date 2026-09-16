import { define } from "pandwind/preset";

const conditions = define.conditions({
	base: "",
	_hover: "&:hover",
	_dark: ".dark &",
	md: "@media (min-width: 768px)",
});
const tokens = define.tokens({
	colors: { "$blue-500": "#2563eb", "$gray-900": "#111827" },
	spacing: { 2: "0.5rem", 4: "1rem", 8: "2rem" },
	radii: { md: "0.375rem" },
});
const semanticTokens = tokens.defineSemanticTokens(conditions, {
	semantic: { surface: { base: "colors.$blue-500", _dark: "colors.$gray-900" } },
});
const colorPalettes = semanticTokens.defineColorPalettes({
	brand: { solid: "colors.$blue-500", contrast: "colors.$gray-900" },
});
const properties = define.properties({
	display: true,
	color: { $tokens: "colors", $strictness: "inherits" },
	padding: { $tokens: "spacing" },
	borderRadius: { $tokens: "radii" },
});
const theme = define.theme({ config: {}, tokens: semanticTokens });
const preset = define.preset(theme, {
	strict: true,
	conditions,
	properties,
	colorPalettes,
});

export const workload = {
	conditions,
	colorPalettes,
	properties,
	preset,
	semanticTokens,
	theme,
	tokens,
};
