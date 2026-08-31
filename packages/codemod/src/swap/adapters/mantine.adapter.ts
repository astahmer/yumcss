import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleValue } from "../semantic-ir.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

const styleProps = [
	"style",
	"sx",
	"m",
	"mt",
	"mb",
	"ml",
	"mr",
	"ms",
	"me",
	"mx",
	"my",
	"p",
	"pt",
	"pb",
	"pl",
	"pr",
	"ps",
	"pe",
	"px",
	"py",
	"maw",
	"mah",
	"miw",
	"mih",
	"w",
	"h",
	"size",
	"c",
	"bg",
	"bd",
	"radius",
	"fw",
	"fz",
	"ff",
	"lh",
	"ta",
	"td",
	"tt",
	"lts",
	"pos",
	"top",
	"left",
	"right",
	"bottom",
	"inset",
	"display",
	"flex",
	"opacity",
] as const;

const propertyAliases = {
	c: "color",
	bg: "backgroundColor",
	bd: "border",
	radius: "borderRadius",
	fw: "fontWeight",
	fz: "fontSize",
	ff: "fontFamily",
	lh: "lineHeight",
	maw: "maxWidth",
	mah: "maxHeight",
	miw: "minWidth",
	mih: "minHeight",
	pos: "position",
	ta: "textAlign",
	td: "textDecoration",
	tt: "textTransform",
	lts: "letterSpacing",
	w: "width",
	h: "height",
	size: ["width", "height"],
	ms: "marginInlineStart",
	me: "marginInlineEnd",
	mx: ["marginLeft", "marginRight"],
	my: ["marginTop", "marginBottom"],
	ps: "paddingInlineStart",
	pe: "paddingInlineEnd",
	px: ["paddingLeft", "paddingRight"],
	py: ["paddingTop", "paddingBottom"],
} as const;

function mantineValue(property: string, value: StyleValue): StyleValue {
	if (value.kind !== "literal" || typeof value.value !== "string") return value;
	if (/^(?:-?\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw)$/.test(value.value)) return value;
	if (
		(/^(?:m|m[trblseixy]|p|p[trblseixy])$/.test(property) ||
			property === "margin" ||
			property.startsWith("margin") ||
			property === "padding" ||
			property.startsWith("padding")) &&
		/^[A-Za-z][\w-]*$/.test(value.value)
	)
		return { kind: "literal", value: `var(--mantine-spacing-${value.value})` };
	if (
		(property === "fontSize" ||
			property === "lineHeight" ||
			property === "fz" ||
			property === "lh") &&
		/^[A-Za-z][\w-]*$/.test(value.value)
	)
		return {
			kind: "literal",
			value: `var(--mantine-${property === "fontSize" || property === "fz" ? "font-size" : "line-height"}-${value.value})`,
		};
	if (
		(property === "color" || property === "c") &&
		/^(?:red|blue|green|black|white|gray|grey|transparent|currentColor)$/i.test(value.value)
	)
		return value;
	if ((property === "color" || property === "c") && /^[A-Za-z][\w-]*$/.test(value.value))
		return { kind: "literal", value: `var(--mantine-color-${value.value})` };
	return value;
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Mantine,
	patterns: [
		{
			name: "mantine-style-props",
			regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
			form: "jsx-style",
			styleProps,
		},
	],
	packages: dependency("@mantine/core", "peer"),
	capabilities: allRuleCapabilities(CodemodAdapterId.Mantine, "partial", {
		"theme-context": "partial",
		"runtime-context": "partial",
		"framework-semantics": "partial",
		components: "partial",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [/@mantine\/core/, /\b(?:sx|maw|fz|c|bg)\s*=/],
	// Mantine components remain imported; only the style-prop layer is lowered.
	sourceModules: [],
	configFiles: ["package.json", "src/theme.ts", "src/theme.js"],
	sourceObjectOptions: {
		propertyAliases,
		valueTransforms: Object.fromEntries(
			styleProps.map((property) => [
				property,
				(value: StyleValue) => mantineValue(property, value),
			]),
		),
	},
	emit(program, { programObject }) {
		return {
			text: `style(${programObject(program)})`,
			imports: ['import { style } from "@mantine/core";'],
		};
	},
});
