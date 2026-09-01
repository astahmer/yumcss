import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleValue } from "../semantic-ir.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleDynamicExpressionKind,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";

function hasScalarDynamicProgram(program: import("../semantic-ir.ts").StyleProgram): boolean {
	return program.rules.some(function containsScalarDynamic(rule): boolean {
		return (
			rule.declarations.some(
				(declaration) =>
					declaration.value.kind === "dynamic" &&
					declaration.value.expressionKind !== StyleDynamicExpressionKind.Function &&
					!/=>|^function\b/.test(declaration.value.expression.trim()),
			) || rule.children.some(containsScalarDynamic)
		);
	});
}

function renderMantineHost(
	program: import("../semantic-ir.ts").StyleProgram,
	styleObject: string,
): string | undefined {
	const source = program.source;
	if (source?.hostOpenTag === undefined) return undefined;
	let host = source.hostOpenTag;
	for (const attribute of source.hostStyleAttributes ?? []) {
		const index = host.indexOf(attribute);
		if (index < 0) continue;
		const whitespace = index > 0 && /[ \t]/u.test(host[index - 1]!) ? 1 : 0;
		host = `${host.slice(0, index - whitespace)}${host.slice(index + attribute.length)}`;
	}
	const insertion = /\/\s*>$/u.test(host) ? host.length - 2 : host.length - 1;
	return `${host.slice(0, insertion)} style={${styleObject}}${host.slice(insertion)}`;
}

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
	m: "margin",
	p: "padding",
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
		// Mantine's standalone target projection must also be parseable when a
		// later migration starts from the emitted file.
		{
			name: "mantine-style",
			regex: /\bstyle\s*\(\s*\{/g,
			form: "object",
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
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			resolveHostRepresentation: ({ program, hasHostContext, framework }) =>
				program.source?.subject === undefined &&
				program.source?.hostOpenTag !== undefined &&
				hasHostContext &&
				(framework === undefined || framework === BuiltinHostFramework.React) &&
				!program.rules.some(function containsFunction(rule): boolean {
					return (
						rule.declarations.some(
							(declaration) =>
								declaration.value.kind === "dynamic" &&
								declaration.value.expressionKind === StyleDynamicExpressionKind.Function,
						) || rule.children.some(containsFunction)
					);
				})
					? StyleHostRepresentationKind.StyleProp
					: StyleHostRepresentationKind.Class,
			resolveRepresentation: ({ program, hostRepresentation }) =>
				hostRepresentation === StyleHostRepresentationKind.Class &&
				program.source?.subject === undefined &&
				program.residuals.length === 0
					? StyleRepresentationKind.PortableArtifact
					: undefined,
			capabilitiesForRepresentation: ({ program, representation }) =>
				representation === StyleRepresentationKind.TargetNative && hasScalarDynamicProgram(program)
					? ["dynamic-values", "theme-context"]
					: [],
			preservesResidualKindsForRepresentation: ({ program, representation }) =>
				representation === StyleRepresentationKind.TargetNative && hasScalarDynamicProgram(program)
					? ["dynamic"]
					: [],
		},
	},
	detectPatterns: [/@mantine\/core/, /\b(?:style|sx|maw|fz|c|bg)\s*=/],
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
	emit(program, { programObject }, context) {
		if (program.rules.some((rule) => rule.kind !== "style"))
			return {
				text: programObject(program),
				residuals: [
					{
						kind: "rule-level",
						text: program.rules.map((rule) => rule.kind).join(", "),
						hint: "Mantine standalone style projection supports style rules only",
					},
				],
			};
		const styleObject = programObject(program);
		if (context?.host?.subject !== undefined)
			return {
				text: `style(${styleObject})`,
				imports: ['import { style } from "@mantine/core";'],
			};
		if (context?.host?.representation === StyleHostRepresentationKind.StyleProp) {
			const host = renderMantineHost(program, styleObject);
			if (host !== undefined) return { text: host, semantic: program };
		}
		return {
			text: styleObject,
			residuals: [
				{
					kind: "host-framework",
					text: styleObject,
					hint: "Mantine standalone styles require a host style prop or a portable Pandwind artifact",
				},
			],
		};
	},
});
