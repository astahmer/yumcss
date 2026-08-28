import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleValue } from "../semantic-ir.ts";
import { CodemodAdapterId } from "../identifiers.ts";
import { matchBlock } from "../../sources.ts";

const styleProps = [
	"css",
	"__css",
	"bg",
	"bgColor",
	"background",
	"backgroundColor",
	"color",
	"p",
	"px",
	"py",
	"pt",
	"pr",
	"pb",
	"pl",
	"m",
	"mx",
	"my",
	"mt",
	"mr",
	"mb",
	"ml",
	"w",
	"h",
	"width",
	"height",
	"minW",
	"maxW",
	"minH",
	"maxH",
	"display",
	"flex",
	"flexDirection",
	"direction",
	"wrap",
	"pos",
	"align",
	"alignItems",
	"justify",
	"justifyContent",
	"gap",
	"rowGap",
	"columnGap",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"fontFamily",
	"textDecoration",
	"textDecorationColor",
	"textDecorationThickness",
	"textUnderlineOffset",
	"border",
	"borderWidth",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"borderStyle",
	"borderColor",
	"borderTop",
	"borderRight",
	"borderBottom",
	"borderLeft",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"borderRadius",
	"rounded",
	"shadow",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"inset",
	"insetStart",
	"insetEnd",
	"ps",
	"pe",
	"ms",
	"me",
	"overflow",
	"overflowX",
	"overflowY",
	"opacity",
	"zIndex",
	"visibility",
	"alignSelf",
	"alignContent",
	"justifySelf",
	"flexGrow",
	"flexShrink",
	"flexBasis",
	"flexWrap",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
	"order",
	"objectFit",
	"aspectRatio",
	"scrollMarginTop",
	"scrollMargin",
	"transition",
	"transform",
	"filter",
	"backdropFilter",
	"outline",
	"outlineWidth",
	"outlineStyle",
	"outlineColor",
	"outlineOffset",
	"backgroundImage",
	"bgGradient",
	"gradientFrom",
	"gradientVia",
	"gradientTo",
	"fill",
	"stroke",
	"textAlign",
	"textTransform",
	"whiteSpace",
	"cursor",
	"_hover",
	"_focus",
	"_active",
	"_disabled",
	"_before",
	"_after",
] as const;

const propertyAliases = {
	bg: "backgroundColor",
	bgColor: "backgroundColor",
	rounded: "borderRadius",
	w: "width",
	h: "height",
	p: "padding",
	px: ["paddingLeft", "paddingRight"],
	py: ["paddingTop", "paddingBottom"],
	pt: "paddingTop",
	pr: "paddingRight",
	pb: "paddingBottom",
	pl: "paddingLeft",
	m: "margin",
	mx: ["marginLeft", "marginRight"],
	my: ["marginTop", "marginBottom"],
	mt: "marginTop",
	mr: "marginRight",
	mb: "marginBottom",
	ml: "marginLeft",
	minW: "minWidth",
	maxW: "maxWidth",
	minH: "minHeight",
	maxH: "maxHeight",
	align: "alignItems",
	justify: "justifyContent",
	direction: "flexDirection",
	wrap: "flexWrap",
	pos: "position",
	ps: "paddingInlineStart",
	pe: "paddingInlineEnd",
	ms: "marginInlineStart",
	me: "marginInlineEnd",
	insetStart: "insetInlineStart",
	insetEnd: "insetInlineEnd",
} as const;

function chakraValue(property: string, value: StyleValue): StyleValue {
	if (value.kind !== "literal" || typeof value.value !== "string") return value;
	if (/^(?:-?\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|svh|svw)$/.test(value.value)) return value;
	if (
		/^(?:p|p[trblxysexy]|m|m[trblxysexy]|gap|rowGap|columnGap)$/.test(property) ||
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin")
	) {
		if (/^-?\d+(?:\.\d+)?$/.test(value.value)) {
			const absolute = value.value.replace(/^-/, "");
			const variable = `var(--chakra-spacing-${absolute})`;
			return {
				kind: "literal",
				value: value.value.startsWith("-") ? `calc(${variable} * -1)` : variable,
			};
		}
	}
	if (property === "borderRadius" || property === "rounded")
		return { kind: "literal", value: `var(--chakra-radii-${value.value})` };
	if (property === "fontWeight")
		return { kind: "literal", value: `var(--chakra-font-weights-${value.value})` };
	if (property === "fontSize")
		return { kind: "literal", value: `var(--chakra-font-sizes-${value.value})` };
	if (property === "lineHeight")
		return { kind: "literal", value: `var(--chakra-line-heights-${value.value})` };
	if (property === "letterSpacing")
		return { kind: "literal", value: `var(--chakra-letter-spacings-${value.value})` };
	if (["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"].includes(property))
		return { kind: "literal", value: `var(--chakra-sizes-${value.value})` };
	if (
		property === "color" ||
		property === "backgroundColor" ||
		property === "borderColor" ||
		property === "bg" ||
		property === "bgColor"
	) {
		if (/^[A-Za-z][\w-]*(?:\.[\w-]+)+(?:\/[\w-]+)?$/.test(value.value))
			return {
				kind: "literal",
				value: `var(--chakra-colors-${value.value.replaceAll(".", "-").replace("/", "-")})`,
			};
	}
	return value;
}

function objectReferences(source: string): Readonly<Record<string, string>> {
	const references: Record<string, string> = {};
	for (const match of source.matchAll(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:defineStyle\s*\(\s*)?\{/g,
	)) {
		const name = match[1];
		const start = (match.index ?? 0) + match[0].lastIndexOf("{");
		if (name === undefined) continue;
		const block = matchBlock(source, start);
		if (block !== null) references[name] = block.body;
	}
	return references;
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.ChakraUi,
	patterns: [
		{
			name: "chakra-style-props",
			regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
			form: "jsx-style",
			styleProps,
		},
	],
	packages: dependency("@chakra-ui/react", "peer"),
	capabilities: allRuleCapabilities(CodemodAdapterId.ChakraUi, "partial", {
		"theme-context": "partial",
		"runtime-context": "partial",
		"framework-semantics": "partial",
		components: "partial",
	}),
	detectPatterns: [/@chakra-ui\/react/, /<(?:(?:Box|Flex|Stack|Text|Button)(?:\s|>))/],
	// Component imports remain in place because the host element still uses Chakra's component.
	sourceModules: [],
	configFiles: ["package.json", "chakra.config.ts", "theme.ts"],
	sourceObjectOptions: (source) => ({
		propertyAliases,
		objectReferences: objectReferences(source),
		valueTransforms: Object.fromEntries(
			styleProps.map((property) => [property, (value: StyleValue) => chakraValue(property, value)]),
		),
	}),
	emit(program, { programObject }) {
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@chakra-ui/react";'],
		};
	},
});
