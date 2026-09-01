import { StyleValueKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import type { AdapterHostRewriteResult } from "../adapter-contract.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";
import {
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";

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
	if (value.kind !== StyleValueKindTag.Literal) return value;
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
				if (value.kind === StyleValueKindTag.Literal && typeof value.value === "string") {
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

function renderMuiSxHost(
	openingTag: string,
	styleAttributes: readonly string[],
	styleObject: string,
): string {
	let tag = openingTag;
	for (const raw of styleAttributes) {
		const index = tag.indexOf(raw);
		if (index === -1) continue;
		const whitespace = index > 0 && /[ \t]/.test(tag[index - 1]!) ? 1 : 0;
		tag = `${tag.slice(0, index - whitespace)}${tag.slice(index + raw.length)}`;
	}
	const insertion = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
	return `${tag.slice(0, insertion)} sx={${styleObject}}${tag.slice(insertion)}`;
}

function findTagEnd(source: string, start: number): number | undefined {
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") {
			braces++;
			continue;
		}
		if (character === "}" && braces > 0) {
			braces--;
			continue;
		}
		if (character === ">" && braces === 0) return index;
	}
	return undefined;
}

interface HostUse {
	readonly start: number;
	readonly end: number;
	readonly openingEnd: number;
	readonly tag: string;
	readonly opening: string;
	readonly attribute: string;
}

function findHostUse(source: string, binding: string | undefined): HostUse | undefined {
	if (binding === undefined) return undefined;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const attribute = new RegExp(`\\b(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
	for (const match of source.matchAll(/<[A-Za-z][\w:.-]*/g)) {
		const start = match.index ?? 0;
		const openingEnd = findTagEnd(source, start);
		if (openingEnd === undefined) continue;
		const opening = source.slice(start, openingEnd + 1);
		const attributeMatch = attribute.exec(opening);
		if (attributeMatch === null) continue;
		const tag = /^<([A-Za-z][\w:.-]*)/.exec(opening)?.[1];
		if (tag === undefined) continue;
		return {
			start,
			end: openingEnd + 1,
			openingEnd,
			tag,
			opening,
			attribute: attributeMatch[0],
		};
	}
	return undefined;
}

function tagForOpening(opening: string | undefined): string | undefined {
	return opening === undefined ? undefined : /^<([A-Za-z][\w:.-]*)/.exec(opening)?.[1];
}

function isKnownMuiComponent(source: string, tag: string): boolean {
	if (tag === "Box") return true;
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`import\\s+\\{[^}]*\\b${escaped}(?:\\s+as\\s+${escaped})?\\b[^}]*\\}\\s+from\\s+["']@mui\\/(?:material|system)["']`,
	).test(source);
}

function isStaticProgram(program: StyleProgram): boolean {
	return (
		program.residuals.length === 0 &&
		StyleProgramAnalysis.declarations(program).every(
			(declaration) => declaration.value.kind !== StyleValueKindTag.Dynamic,
		)
	);
}

function hasScalarDynamicProgram(program: StyleProgram): boolean {
	return StyleProgramAnalysis.hasScalarDynamic(program);
}

function rewriteMuiIntrinsicHost(
	code: string,
	expression: string,
	host: HostUse,
): AdapterHostRewriteResult {
	const opening = host.opening;
	const selfClosing = /\/\s*>$/.test(opening);
	const attributes = opening
		.slice(1 + host.tag.length, -1)
		.replace(/\/\s*$/, "")
		.replace(host.attribute, "")
		.trim();
	const suffix = attributes === "" ? "" : ` ${attributes}`;
	const replacement = `<Box component=${JSON.stringify(host.tag)}${suffix} sx={${expression}}${selfClosing ? " /" : ""}>`;
	let rewritten = `${code.slice(0, host.start)}${replacement}${code.slice(host.end)}`;
	if (!selfClosing) {
		const closing = new RegExp(`<\\/\\s*${host.tag}\\s*>`).exec(
			rewritten.slice(host.start + replacement.length),
		);
		if (closing !== null) {
			const closingStart = host.start + replacement.length + closing.index;
			rewritten = `${rewritten.slice(0, closingStart)}</Box>${rewritten.slice(closingStart + closing[0].length)}`;
		}
	}
	return {
		code: rewritten,
		imports: ['import { Box } from "@mui/material";'],
		residuals: [],
	};
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
			CodemodAdapterKit.dependency("@mui/system", "peer").packages[0]!,
			CodemodAdapterKit.dependency("@mui/material", "peer").packages[0]!,
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Mui, "partial", {
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
		if (context?.host?.representation === StyleHostRepresentationKind.StyleProp) {
			const styleObject = programObject(program);
			if (program.source?.hostOpenTag !== undefined)
				return {
					text: renderMuiSxHost(
						program.source.hostOpenTag,
						program.source.hostStyleAttributes ?? [],
						styleObject,
					),
				};
			return { text: styleObject };
		}
		if (
			context?.host?.representation === StyleHostRepresentationKind.Class &&
			context.host.representationKind === StyleRepresentationKind.PortableArtifact
		)
			return {
				text: `css.class(${programObject(program)})`,
				imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
				semantic: program,
			};
		if (program.source?.hostOpenTag !== undefined) return { text: programObject(program) };
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
			requiresHostContext: true,
			hostContextRequiredHint:
				"MUI sx styles require a host component prop; no standalone sx() API exists",
			hostRepresentation: StyleHostRepresentationKind.Component,
			resolveHostRepresentation: ({ program, hasHostContext, framework, source, binding }) =>
				program.source?.subject === undefined && !hasHostContext
					? StyleHostRepresentationKind.Class
					: (framework === undefined || framework === BuiltinHostFramework.React) &&
						  program.source?.subject === undefined
						? (() => {
								const host = findHostUse(source ?? "", binding);
								const tag = host?.tag ?? tagForOpening(program.source?.hostOpenTag);
								if (tag === undefined) return undefined;
								return tag[0] === tag[0]?.toLowerCase() || isKnownMuiComponent(source ?? "", tag)
									? StyleHostRepresentationKind.StyleProp
									: isStaticProgram(program)
										? StyleHostRepresentationKind.Class
										: undefined;
							})()
						: framework === undefined || framework === BuiltinHostFramework.React
							? StyleHostRepresentationKind.Component
							: undefined,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
			resolveRepresentation: ({ program, hostRepresentation }) =>
				hostRepresentation === StyleHostRepresentationKind.Class &&
				program.source?.subject === undefined &&
				program.residuals.length === 0
					? StyleRepresentationKind.PortableArtifact
					: program.source?.subject !== undefined && hasScalarDynamicProgram(program)
						? StyleRepresentationKind.TargetNative
						: undefined,
			capabilitiesForRepresentation: ({ program, representation }) => {
				if (representation === StyleRepresentationKind.PortableArtifact) return ["theme-context"];
				if (
					representation === StyleRepresentationKind.TargetNative &&
					hasScalarDynamicProgram(program)
				)
					return ["dynamic-values", "theme-context"];
				return [];
			},
			preservesResidualKindsForRepresentation: ({ program, representation }) =>
				representation === StyleRepresentationKind.TargetNative && hasScalarDynamicProgram(program)
					? ["dynamic"]
					: [],
			handlesFrameworkSemantics: true,
			hostFrameworks: [BuiltinHostFramework.React],
			hostFrameworkConversions: [
				{
					from: BuiltinHostFramework.Solid,
					to: BuiltinHostFramework.React,
					canConvert: ({ file, source }) =>
						/\.(?:jsx|tsx)$/.test(file) &&
						!/\b(?:createSignal|createMemo|createEffect)\s*\(|\bon:|\buse:|\bclass\s*=/.test(
							source,
						),
				},
				{
					from: BuiltinHostFramework.Vue,
					to: BuiltinHostFramework.React,
					canConvert: ({ file, source }) => canConvertStaticVueSfc(file, source),
					rewriteDocument: ({ code, targetFramework }) => rewriteVueSfcToJsx(code, targetFramework),
				},
			],
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
				const host = findHostUse(code, binding);
				if (host === undefined)
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
				if (host.tag[0] === host.tag[0]?.toLowerCase())
					return rewriteMuiIntrinsicHost(code, expression, host);
				if (!isKnownMuiComponent(code, host.tag))
					return {
						code,
						residuals: [
							{
								kind: "host-framework",
								text: host.tag,
								hint: "MUI sx projection requires an intrinsic Box wrapper or a known MUI component",
							},
						],
					};
				const escaped = expression.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
				const pattern = new RegExp(`(\\b)(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
				return {
					code: code.replace(pattern, `$1sx={${expression}}`),
					residuals: [],
				};
			},
		},
	},
});
