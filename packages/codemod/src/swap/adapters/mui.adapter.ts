import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { StyleValue } from "../semantic-ir.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import {
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";

const spacing = new Set([
	"m",
	"mt",
	"mr",
	"mb",
	"ml",
	"mx",
	"my",
	"p",
	"pt",
	"pr",
	"pb",
	"pl",
	"px",
	"py",
]);
const styleProps = ["sx"] as const;
const propertyAliases = {
	m: "margin",
	mt: "marginTop",
	mr: "marginRight",
	mb: "marginBottom",
	ml: "marginLeft",
	mx: ["marginLeft", "marginRight"],
	my: ["marginTop", "marginBottom"],
	p: "padding",
	pt: "paddingTop",
	pr: "paddingRight",
	pb: "paddingBottom",
	pl: "paddingLeft",
	px: ["paddingLeft", "paddingRight"],
	py: ["paddingTop", "paddingBottom"],
	bgcolor: "backgroundColor",
} as const;

function defaultSpacing(property: string, value: StyleValue): StyleValue {
	if (value.kind !== "literal") return value;
	if (spacing.has(property) && typeof value.value === "number")
		return { kind: "literal", value: `${value.value * 8}px` };
	if (property === "borderRadius" && typeof value.value === "number")
		return { kind: "literal", value: `${value.value * 4}px` };
	if (
		typeof value.value === "string" &&
		/^[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*$/.test(value.value)
	) {
		return { kind: "literal", value: `var(--mui-${value.value.replace(".", "-")})` };
	}
	return value;
}

function muiTransforms(
	source: string,
): Readonly<Record<string, (value: StyleValue) => StyleValue>> {
	return Object.fromEntries(
		[...spacing, "bgcolor", "backgroundColor", "color", "borderRadius"].map((property) => [
			property,
			(value: StyleValue) => {
				if (value.kind === "literal" && typeof value.value === "string") {
					const [group, key] = value.value.split(".");
					if (group !== undefined && key !== undefined) {
						const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const resolved = new RegExp(
							`\\b${escapedGroup}\\s*:\\s*\\{[^{}]*\\b${escapedKey}\\s*:\\s*(['"])(.*?)\\1`,
						).exec(source)?.[2];
						if (resolved !== undefined) return { kind: "literal", value: resolved };
					}
				}
				return defaultSpacing(property, value);
			},
		]),
	);
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Mui,
	patterns: [
		{
			name: "mui-sx",
			regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
			form: "jsx-style",
			styleProps,
		},
		{ name: "mui-styled", kind: "styled", regex: /\bstyled\s*\(\s*[^)]+\s*\)\s*\(\s*\{/g },
	],
	packages: {
		packages: [
			dependency("@mui/system", "peer").packages[0]!,
			dependency("@mui/material", "peer").packages[0]!,
		],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Mui, "partial", {
		"function-values": "exact",
		"theme-context": "partial",
		"runtime-context": "partial",
		components: "exact",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [/@mui\/(?:system|material)/, /\bsx\s*=/, /\bstyled\s*\(/],
	sourceModules: [],
	configFiles: ["package.json", "src/theme.ts", "src/theme.js"],
	sourceObjectOptions: (source) => ({ propertyAliases, valueTransforms: muiTransforms(source) }),
	emit(program, { programObject }, context) {
		const subject = program.source?.subject;
		if (subject !== undefined) {
			if (
				context?.host?.framework !== undefined &&
				context.host.framework !== BuiltinHostFramework.React
			)
				return {
					text: programObject(program),
					residuals: [
						{
							kind: "host-framework",
							text: subject,
							hint: `MUI styled projection requires ${BuiltinHostFramework.React}`,
						},
					],
				};
			const tag = intrinsicTagForSubject(subject);
			const base = componentExpressionForSubject(subject);
			const targetSubject = tag === undefined ? (base ?? subject) : JSON.stringify(tag);
			return {
				text: `styled(${targetSubject})(${programObject(program)})`,
				imports: ['import { styled } from "@mui/system";'],
			};
		}
		if (
			context?.host?.representation === StyleHostRepresentationKind.StyleProp ||
			program.source?.hostOpenTag !== undefined
		)
			return { text: programObject(program) };
		return {
			text: programObject(program),
			residuals: [
				{
					kind: "host-framework",
					text: programObject(program),
					hint: "MUI sx styles require a host component prop; no standalone sx() API exists",
				},
			],
		};
	},
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			hostRepresentation: StyleHostRepresentationKind.Component,
			resolveHostRepresentation: ({ program, framework }) =>
				(framework === undefined || framework === BuiltinHostFramework.React) &&
				program.source?.subject === undefined
					? StyleHostRepresentationKind.StyleProp
					: framework === undefined || framework === BuiltinHostFramework.React
						? StyleHostRepresentationKind.Component
						: undefined,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
			handlesFrameworkSemantics: true,
			hostFrameworks: [BuiltinHostFramework.React],
			rewriteHost: ({ code, emittedExpression, binding, framework, representation }) => {
				if (representation !== StyleHostRepresentationKind.StyleProp)
					return { code, residuals: [] };
				if (framework !== undefined && framework !== BuiltinHostFramework.React)
					return {
						code,
						residuals: [
							{
								kind: "host-framework",
								text: emittedExpression,
								hint: `MUI sx host projection requires ${BuiltinHostFramework.React}`,
							},
						],
					};
				const expression = binding === undefined ? emittedExpression : binding;
				const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const pattern = new RegExp(`(\\b)(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
				if (!pattern.test(code))
					return {
						code,
						residuals: [
							{
								kind: "host-framework",
								text: expression,
								hint: "MUI sx host projection could not find the converted class binding",
							},
						],
					};
				return {
					code: code.replace(pattern, `$1sx={${expression}}`),
					residuals: [],
				};
			},
		},
	},
});
