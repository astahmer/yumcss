import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleValue } from "../semantic-ir.ts";
import { CodemodAdapterId } from "../identifiers.ts";
import { matchBlock } from "../../sources.ts";
import type { JsxStyleHostMatch } from "../jsx-style-host.ts";

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
	"flexDir",
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
	"boxShadow",
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
	"paddingX",
	"paddingY",
	"marginX",
	"marginY",
	"insetX",
	"insetY",
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
	"bgImage",
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
	"borderTopRadius",
	"borderBottomRadius",
	"borderStartRadius",
	"borderEndRadius",
	"borderStartWidth",
	"borderEndWidth",
	"borderStartColor",
	"borderEndColor",
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
	flexDir: "flexDirection",
	wrap: "flexWrap",
	pos: "position",
	shadow: "boxShadow",
	ps: "paddingInlineStart",
	pe: "paddingInlineEnd",
	ms: "marginInlineStart",
	me: "marginInlineEnd",
	marginX: "marginInline",
	marginY: "marginBlock",
	paddingX: "paddingInline",
	paddingY: "paddingBlock",
	insetX: "insetInline",
	insetY: "insetBlock",
	insetStart: "insetInlineStart",
	insetEnd: "insetInlineEnd",
	bgImage: "backgroundImage",
	borderTopRadius: ["borderStartStartRadius", "borderStartEndRadius"],
	borderBottomRadius: ["borderEndStartRadius", "borderEndEndRadius"],
	borderStartRadius: ["borderStartStartRadius", "borderEndStartRadius"],
	borderEndRadius: ["borderStartEndRadius", "borderEndEndRadius"],
	borderStartWidth: "borderInlineStartWidth",
	borderEndWidth: "borderInlineEndWidth",
	borderStartColor: "borderInlineStartColor",
	borderEndColor: "borderInlineEndColor",
} as const;

function chakraValue(property: string, value: StyleValue): StyleValue {
	if (value.kind !== "literal") return value;
	const isSpacingProperty =
		/^(?:p|p[trblxysexy]|m|m[trblxysexy]|gap|rowGap|columnGap)$/.test(property) ||
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin") ||
		property === "paddingX" ||
		property === "paddingY" ||
		property === "marginX" ||
		property === "marginY";
	if (typeof value.value === "number" && isSpacingProperty) {
		if (value.value === 0) return { kind: "literal", value: 0 };
		const absolute = Math.abs(value.value);
		const variable = `var(--chakra-spacing-${absolute})`;
		return {
			kind: "literal",
			value: value.value < 0 ? `calc(${variable} * -1)` : variable,
		};
	}
	if (typeof value.value !== "string") return value;
	if (/^(?:-?\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|svh|svw)$/.test(value.value)) return value;
	const tokenName = /^(?:[A-Za-z][A-Za-z0-9_.-]*|\d+[A-Za-z][A-Za-z0-9_.-]*)$/.test(value.value);
	if (isSpacingProperty) {
		if (/^-?\d+(?:\.\d+)?$/.test(value.value)) {
			const absolute = value.value.replace(/^-/, "");
			const variable = `var(--chakra-spacing-${absolute})`;
			return {
				kind: "literal",
				value: value.value.startsWith("-") ? `calc(${variable} * -1)` : variable,
			};
		}
	}
	if ((property === "borderRadius" || property === "rounded") && tokenName)
		return { kind: "literal", value: `var(--chakra-radii-${value.value})` };
	if (property === "fontWeight" && tokenName)
		return { kind: "literal", value: `var(--chakra-font-weights-${value.value})` };
	if (property === "fontSize" && tokenName)
		return { kind: "literal", value: `var(--chakra-font-sizes-${value.value})` };
	if (property === "lineHeight" && tokenName)
		return { kind: "literal", value: `var(--chakra-line-heights-${value.value})` };
	if (property === "letterSpacing" && tokenName)
		return { kind: "literal", value: `var(--chakra-letter-spacings-${value.value})` };
	const numericDimension = /^\d+(?:\.\d+)?$/.test(value.value);
	if (
		["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"].includes(property) &&
		(tokenName || numericDimension)
	)
		return { kind: "literal", value: `var(--chakra-sizes-${value.value})` };
	if (property === "fontFamily" && tokenName)
		return { kind: "literal", value: `var(--chakra-fonts-${value.value})` };
	if (property === "shadow" && tokenName)
		return { kind: "literal", value: `var(--chakra-shadows-${value.value})` };
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
				value: `var(--chakra-colors-${value.value
					.replaceAll(".", "-")
					.replace("colorPalette", "color-palette")
					.replace("/", "-")})`,
			};
	}
	return value;
}

function valueTransformProperty(property: string): string {
	const alias = propertyAliases[property as keyof typeof propertyAliases];
	return typeof alias === "string" ? alias : property;
}

function preserveSeparatorGap(host: JsxStyleHostMatch): readonly string[] {
	if (!host.attributes.some((attribute) => attribute.name === "separator")) return [];
	return host.styleAttributes
		.filter((attribute) => attribute.name === "gap")
		.map((attribute) => attribute.name);
}

function preserveNextImageFill(host: JsxStyleHostMatch): readonly string[] {
	const tag = /^<\s*([A-Za-z_$][\w$.-]*)/.exec(host.openingTag)?.[1];
	if (tag !== "Image") return [];
	return host.styleAttributes
		.filter(
			(attribute) =>
				attribute.name === "fill" &&
				(attribute.value === true || attribute.value.trim() === "true"),
		)
		.map((attribute) => attribute.name);
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
			preserveHostStyleProps: (host) => [
				...preserveSeparatorGap(host),
				...preserveNextImageFill(host),
			],
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
		unwrapNestedObjectKeys: ["css"],
		propertyValueConditions: true,
		conditionKinds: {
			sm: "named",
			md: "named",
			lg: "named",
			xl: "named",
			"2xl": "named",
		},
		valueTransforms: Object.fromEntries(
			[...new Set([...styleProps, ...Object.keys(propertyAliases)])].map((property) => [
				property,
				(value: StyleValue) => chakraValue(valueTransformProperty(property), value),
			]),
		),
	}),
	emit(program, { programObject }) {
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@chakra-ui/react";'],
		};
	},
});
