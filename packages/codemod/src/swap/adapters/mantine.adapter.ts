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

function rewriteMantineClassHost({
	code,
	binding,
	representation,
}: {
	readonly code: string;
	readonly binding?: string;
	readonly representation: StyleHostRepresentationKind;
}): { code: string; residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[] } {
	if (representation !== StyleHostRepresentationKind.StyleProp || binding === undefined)
		return { code, residuals: [] };
	const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const classAttribute = new RegExp(`className\\s*=\\{\\s*${escapedBinding}\\s*\\}`, "g");
	if (!classAttribute.test(code))
		return {
			code,
			residuals: [
				{
					kind: "host-framework",
					text: binding,
					hint: "Mantine style-prop projection could not locate a simple className binding",
				},
			],
		};
	return { code: code.replace(classAttribute, `style={${binding}}`), residuals: [] };
}

function rewriteMantineSourceHost({
	code,
	program,
	emittedExpression,
}: {
	readonly code: string;
	readonly program: import("../semantic-ir.ts").StyleProgram;
	readonly emittedExpression: string;
}): { code: string; residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[] } {
	const openingTag = program.source?.hostOpenTag;
	if (openingTag === undefined || (program.source?.hostStyleAttributes?.length ?? 0) === 0)
		return { code, residuals: [] };
	const rendered = renderMantineHost(program, emittedExpression);
	if (rendered === undefined)
		return {
			code,
			residuals: [
				{
					kind: "host-framework",
					text: openingTag,
					hint: "Mantine style-prop projection could not render the source host",
				},
			],
		};
	const index = code.indexOf(openingTag);
	if (index < 0)
		return {
			code,
			residuals: [
				{
					kind: "host-framework",
					text: openingTag,
					hint: "Mantine style-prop projection could not locate the source host",
				},
			],
		};
	return {
		code: `${code.slice(0, index)}${rendered}${code.slice(index + openingTag.length)}`,
		residuals: [],
	};
}

function rewriteChakraBoxImport(code: string): string {
	const match = /import\s*\{\s*([^}]+?)\s*\}\s*from\s*["']@chakra-ui\/react["'];?/u.exec(code);
	if (match === null) return code;
	const imported =
		match[1]
			?.split(",")
			.map((name) => name.trim())
			.filter(Boolean) ?? [];
	if (imported.length !== 1 || imported[0] !== "Box") return code;
	return code.replace(match[0], 'import { Box } from "@mantine/core";');
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
		{
			name: "mantine-createStyles",
			regex: /\bcreateStyles\s*\(\s*\{/g,
			form: "object",
			sourceObjectOptions: { namedRuleObjects: true },
			suffix: /\.classes\b/u,
		},
	],
	packages: dependency("@mantine/core", "peer"),
	capabilities: allRuleCapabilities(CodemodAdapterId.Mantine, "partial", {
		"theme-context": "partial",
		"runtime-context": "partial",
		"framework-semantics": "partial",
		components: "partial",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.NativeMap,
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			handlesSourceHostAttributes: true,
			hostRepresentation: StyleHostRepresentationKind.StyleProp,
			resolveHostRepresentation: ({ program, framework }) => {
				if (
					program.rules.some(function containsFunction(rule): boolean {
						return (
							rule.declarations.some(
								(declaration) =>
									declaration.value.kind === "dynamic" &&
									declaration.value.expressionKind === StyleDynamicExpressionKind.Function,
							) || rule.children.some(containsFunction)
						);
					})
				)
					return undefined;
				return framework === undefined || framework === BuiltinHostFramework.React
					? StyleHostRepresentationKind.StyleProp
					: StyleHostRepresentationKind.Class;
			},
			rewriteComponent: ({ code, binding, tag, framework, emittedExpression }) => {
				if (framework !== BuiltinHostFramework.React)
					return {
						code,
						residuals: [
							{
								kind: "host-framework",
								text: binding,
								hint: `Mantine style-prop projection requires ${BuiltinHostFramework.React}`,
							},
						],
					};
				const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const assignment = new RegExp(
					`\\b(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*[^;]+;`,
				).exec(code);
				if (assignment === null)
					return {
						code,
						residuals: [
							{
								kind: "host-framework",
								text: binding,
								hint: "Mantine style-prop component declaration could not be located",
							},
						],
					};
				const declaration =
					`${binding} = (props) => <${tag} {...props} ` +
					`style={{ ...${emittedExpression}, ...props.style }} />;`;
				const bindingOffset = assignment[0].indexOf(binding);
				return {
					code:
						code.slice(0, assignment.index + bindingOffset) +
						declaration +
						code.slice(assignment.index + assignment[0].length),
					residuals: [],
				};
			},
			rewriteHost: ({ code, binding, representation, program, emittedExpression }) => {
				const sourceHost = rewriteMantineSourceHost({ code, program, emittedExpression });
				if (sourceHost.residuals.length > 0) return sourceHost;
				const host = rewriteMantineClassHost({
					code: sourceHost.code,
					binding,
					representation,
				});
				return { ...host, code: rewriteChakraBoxImport(host.code) };
			},
			resolveRepresentation: ({ program, hostRepresentation }) =>
				hostRepresentation === StyleHostRepresentationKind.Class &&
				program.rules.every((rule) => rule.kind === "style") &&
				program.rules.every((rule) => rule.name === undefined) &&
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
		if (
			context?.host?.subject !== undefined ||
			context?.host?.representation === StyleHostRepresentationKind.StyleProp
		)
			return { text: styleObject, semantic: program };
		if (program.rules.some((rule) => rule.name !== undefined))
			return {
				text: styleObject,
				residuals: [
					{
						kind: "host-framework",
						text: styleObject,
						hint: "Mantine style maps require a host component style prop or an explicit CSS module",
					},
				],
			};
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
