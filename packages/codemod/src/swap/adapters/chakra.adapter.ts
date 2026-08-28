import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleValue } from "../semantic-ir.ts";

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
	"align",
	"alignItems",
	"justify",
	"justifyContent",
	"gap",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"border",
	"borderWidth",
	"borderColor",
	"borderRadius",
	"rounded",
	"shadow",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"inset",
	"overflow",
	"opacity",
	"zIndex",
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
} as const;

function chakraValue(property: string, value: StyleValue): StyleValue {
	if (value.kind !== "literal" || typeof value.value !== "string") return value;
	if (/^(?:-?\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|svh|svw)$/.test(value.value)) return value;
	if (
		/^(?:p|p[trblxy]|m|m[trblxy])$/.test(property) ||
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin")
	) {
		if (/^\d+(?:\.\d+)?$/.test(value.value))
			return { kind: "literal", value: `var(--chakra-spacing-${value.value})` };
	}
	if (property === "borderRadius" || property === "rounded")
		return { kind: "literal", value: `var(--chakra-radii-${value.value})` };
	if (property === "fontWeight")
		return { kind: "literal", value: `var(--chakra-font-weights-${value.value})` };
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

export default defineCodemodAdapter({
	id: "chakra-ui",
	patterns: [
		{
			name: "chakra-style-props",
			regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
			form: "jsx-style",
			styleProps,
		},
	],
	packages: dependency("@chakra-ui/react", "peer"),
	capabilities: allRuleCapabilities("chakra-ui", "partial", {
		"theme-context": "partial",
		"runtime-context": "partial",
		"framework-semantics": "partial",
		components: "partial",
	}),
	detectPatterns: [/@chakra-ui\/react/, /<(?:(?:Box|Flex|Stack|Text|Button)(?:\s|>))/],
	// Component imports remain in place because the host element still uses Chakra's component.
	sourceModules: [],
	configFiles: ["package.json", "chakra.config.ts", "theme.ts"],
	sourceObjectOptions: {
		propertyAliases,
		valueTransforms: Object.fromEntries(
			styleProps.map((property) => [property, (value: StyleValue) => chakraValue(property, value)]),
		),
	},
	emit(program, { programObject }) {
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@chakra-ui/react";'],
		};
	},
});
