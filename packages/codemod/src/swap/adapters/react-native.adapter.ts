import { StyleValueKindTag } from "../semantic-ir.ts";
import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterHostFrameworkConversion } from "../adapter-contract.ts";
import type { AdapterParseContext } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleLoweringId,
} from "../identifiers.ts";
import { STYLE_LOWERING_SCHEMA, type StyleLowering } from "../lowering.ts";
import type { StyleProgram, StyleProgramResidual } from "../semantic-ir.ts";
import {
	componentAttrsExpressionForSubject,
	componentAttrsValueExpression,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";

const reactLayoutHosts = new Set([
	"article",
	"div",
	"footer",
	"header",
	"li",
	"main",
	"nav",
	"ol",
	"section",
	"ul",
	"Box",
]);

function reactNativeHostTag(tag: string): "View" | undefined {
	return reactLayoutHosts.has(tag) ? "View" : undefined;
}

const reactToReactNative: readonly AdapterHostFrameworkConversion[] = [
	{ from: BuiltinHostFramework.React, to: BuiltinHostFramework.ReactNative },
	{
		from: BuiltinHostFramework.Solid,
		to: BuiltinHostFramework.ReactNative,
		canConvert: ({ file, source }) =>
			/\.(?:jsx|tsx)$/.test(file) &&
			!/\b(?:createSignal|createMemo|createEffect)\s*\(|\bon:|\buse:/.test(source),
	},
	{
		from: BuiltinHostFramework.Vue,
		to: BuiltinHostFramework.ReactNative,
		canConvert: ({ file, source }) => canConvertStaticVueSfc(file, source),
		rewriteDocument: ({ code, targetFramework }) => rewriteVueSfcToJsx(code, targetFramework),
	},
];

function reactNativeValue(
	property: string,
	value: string | number | boolean,
): string | number | boolean {
	if (typeof value !== "string") return value;
	const dimension = /^(-?(?:\d+\.?\d*|\.\d+))(rem|px)$/u.exec(value.trim());
	if (dimension !== null) {
		const amount = Number(dimension[1]);
		return dimension[2] === "rem" ? amount * 16 : amount;
	}
	return value;
}

function reactNativeProgram(program: StyleProgram): StyleProgram {
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === StyleValueKindTag.Literal
				? { ...item.value, value: reactNativeValue(item.property, item.value.value) }
				: item.value,
	});
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

const reactNativeUnitLowering: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.ReactNativeNumericNormalization,
	apply: ({ program, target }) =>
		target.adapter === CodemodAdapterId.ReactNative
			? {
					program: reactNativeProgram(program),
					residuals: [],
					applied: [StyleLoweringId.ReactNativeNumericNormalization],
				}
			: { program, residuals: [], applied: [] },
};

function hasOnlyStaticDeclarations(program: StyleProgram): boolean {
	return program.rules.every(
		(rule) =>
			rule.declarations.every(
				(declaration) => declaration.value.kind !== StyleValueKindTag.Dynamic,
			) &&
			rule.children.every((child) => hasOnlyStaticDeclarations({ ...program, rules: [child] })),
	);
}

function hasViewTextColor(program: StyleProgram): boolean {
	const rulesHaveColor = (rules: StyleProgram["rules"]): boolean =>
		rules.some(
			(rule) =>
				rule.declarations.some((declaration) => declaration.property === "color") ||
				rulesHaveColor(rule.children),
		);
	return (
		program.declarations.some((declaration) => declaration.property === "color") ||
		rulesHaveColor(program.rules)
	);
}

function hostResidual(text: string, hint: string): StyleProgramResidual {
	return { kind: "host-framework", text, hint };
}

interface ReactHostSource {
	readonly hostOpenTag: string;
	readonly hostStyleAttributes: readonly string[];
}

function hostForBinding(source: string, binding: string | undefined): ReactHostSource | undefined {
	if (binding === undefined) return undefined;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`\\b(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`, "u");
	for (let start = source.indexOf("<"); start >= 0; start = source.indexOf("<", start + 1)) {
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
			if (character !== ">" || braces > 0) continue;
			const hostOpenTag = source.slice(start, index + 1);
			const match = /^<([A-Za-z_$][\w$.-]*)([\s\S]*?)(?:\/?>)$/.exec(hostOpenTag);
			if (match === null || !pattern.test(match[2] ?? "")) break;
			const attribute = (match[2] ?? "").match(
				/((?:className|class)\s*=\s*\{\s*[A-Za-z_$][\w$]*\s*\})/u,
			)?.[1];
			return {
				hostOpenTag,
				hostStyleAttributes: attribute === undefined ? [] : [attribute],
			};
		}
	}
	return undefined;
}

function hostSource(
	program: StyleProgram,
	source: string | undefined,
	binding: string | undefined,
): ReactHostSource | undefined {
	if (program.source?.hostOpenTag !== undefined)
		return {
			hostOpenTag: program.source.hostOpenTag,
			hostStyleAttributes: program.source.hostStyleAttributes ?? [],
		};
	return source === undefined ? undefined : hostForBinding(source, binding);
}

function canRewriteReactHost(
	program: StyleProgram,
	source: string | undefined,
	binding: string | undefined,
): boolean {
	const hostOpenTag = hostSource(program, source, binding)?.hostOpenTag;
	if (hostOpenTag === undefined || !hasOnlyStaticDeclarations(program)) return false;
	const opening = /^<([A-Za-z_$][\w$.-]*)([\s\S]*?)(\/?>)$/.exec(hostOpenTag);
	const sourceTag = opening?.[1];
	if (opening === null || sourceTag === undefined || reactNativeHostTag(sourceTag) === undefined)
		return false;
	const attributes = opening[2] ?? "";
	if (/\bstyle\s*=\s*/u.test(attributes)) return false;
	return (program.source?.hostStyleAttributes ?? []).every((attribute) =>
		attributes.includes(attribute),
	);
}

function rewriteReactStyledSubject(
	code: string,
	binding: string,
	tag: string,
	styleExpression: string,
): {
	code: string;
	imports: readonly string[];
	residuals: readonly StyleProgramResidual[];
} {
	const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const openingPattern = new RegExp(`<${escapedBinding}\\b([^>]*)>`, "g");
	const selfClosingPattern = new RegExp(`<${escapedBinding}\\b([^>]*)\\/\\s*>`, "g");
	const closingPattern = new RegExp(`</${escapedBinding}\\s*>`, "g");
	const invalid = (text: string): boolean => /\b(?:style|className|class|as)\s*=/.test(text);
	if ([...code.matchAll(openingPattern)].some((match) => invalid(match[1] ?? "")))
		return {
			code,
			imports: [],
			residuals: [
				hostResidual(
					binding,
					"React Native styled subject conversion requires explicit style/class/as props to be migrated first",
				),
			],
		};
	if ([...code.matchAll(selfClosingPattern)].some((match) => invalid(match[1] ?? "")))
		return {
			code,
			imports: [],
			residuals: [
				hostResidual(
					binding,
					"React Native styled subject conversion requires explicit style/class/as props to be migrated first",
				),
			],
		};
	const next = code
		.replace(
			selfClosingPattern,
			(_match, attributes: string) =>
				`<${tag}${attributes.trim() === "" ? "" : ` ${attributes.trim()}`} style={${styleExpression}} />`,
		)
		.replace(
			openingPattern,
			(_match, attributes: string) =>
				`<${tag}${attributes.trim() === "" ? "" : ` ${attributes.trim()}`} style={${styleExpression}}>`,
		)
		.replace(closingPattern, `</${tag}>`);
	if (next === code)
		return {
			code,
			imports: [],
			residuals: [hostResidual(binding, `no rewritable ${binding} JSX usage found`)],
		};
	return { code: next, imports: ['import { View } from "react-native";'], residuals: [] };
}

function removeUnusedNamedHostImport(code: string, tag: string): string {
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const importPattern = new RegExp(
		`^import\\s*\\{\\s*${escaped}\\s*\\}\\s*from\\s*(["'][^"']+["'])\\s*;?\\s*`,
		"mu",
	);
	const withoutImports = code.replace(/^import[^\n;]*(?:;|$)\s*/gmu, "");
	return withoutImports.includes(tag) ? code : code.replace(importPattern, "");
}

function rewriteReactHost(
	code: string,
	program: StyleProgram,
	emittedExpression: string,
	sourceModules: readonly string[],
	binding: string | undefined,
): {
	code: string;
	imports: readonly string[];
	removeSourceModules?: readonly string[];
	residuals: readonly StyleProgramResidual[];
} {
	const host = hostSource(program, code, binding);
	const hostOpenTag = host?.hostOpenTag;
	if (hostOpenTag === undefined)
		return {
			code,
			imports: [],
			residuals: [
				hostResidual("React host", "React-to-React Native conversion requires a host tag"),
			],
		};
	if (!hasOnlyStaticDeclarations(program))
		return {
			code,
			imports: [],
			residuals: [
				hostResidual(
					program.source?.hostOpenTag ?? "React host",
					"React-to-React Native conversion currently requires static style declarations",
				),
			],
		};
	const opening = /^<([A-Za-z_$][\w$.-]*)([\s\S]*?)(\/?>)$/.exec(hostOpenTag);
	const sourceTag = opening?.[1];
	const nativeTag = sourceTag === undefined ? undefined : reactNativeHostTag(sourceTag);
	if (opening === null || sourceTag === undefined || nativeTag === undefined)
		return {
			code,
			imports: [],
			residuals: [
				hostResidual(
					hostOpenTag,
					"React-to-React Native conversion supports only known layout host tags",
				),
			],
		};
	let attributes = opening[2] ?? "";
	if (/\bstyle\s*=\s*/u.test(attributes))
		return {
			code,
			imports: [],
			residuals: [hostResidual(hostOpenTag, "React Native host style must be merged explicitly")],
		};
	for (const attribute of host?.hostStyleAttributes ?? []) {
		if (!attributes.includes(attribute))
			return {
				code,
				imports: [],
				residuals: [
					hostResidual(
						attribute,
						"React-to-React Native conversion could not locate the source style attribute",
					),
				],
			};
		attributes = attributes.replace(attribute, "");
	}
	const hostExpression = binding ?? emittedExpression;
	const hostReplacement = `<${nativeTag}${attributes} style={${hostExpression}}${opening[3]}`;
	const originalHostIndex = code.indexOf(hostOpenTag);
	const carrierIndex = code.indexOf(emittedExpression);
	const hostIndex = originalHostIndex >= 0 ? originalHostIndex : carrierIndex;
	const replacedText = originalHostIndex >= 0 ? hostOpenTag : emittedExpression;
	if (hostIndex < 0)
		return {
			code,
			imports: [],
			residuals: [hostResidual(hostOpenTag, "React Native host carrier was not found")],
		};
	return {
		code:
			sourceTag === "Box"
				? removeUnusedNamedHostImport(
						code.slice(0, hostIndex) +
							hostReplacement +
							code.slice(hostIndex + replacedText.length),
						sourceTag,
					)
				: code.slice(0, hostIndex) + hostReplacement + code.slice(hostIndex + replacedText.length),
		imports: ['import { View } from "react-native";'],
		removeSourceModules: sourceModules,
		residuals: [],
	};
}

const reactNativeAdapter = makeExtraAdapter({
	id: CodemodAdapterId.ReactNative,
	officialApi: {
		apis: [
			{ name: "StyleSheet.create", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "style", status: AdapterOfficialApiStatusTag.Supported },
		],
	},
	modules: ["react-native"],
	packages: { packages: [{ name: "react-native", kind: AdapterDependencyKindTag.Peer }] },
	detect: [/from\s+["']react-native["']/g, /\bStyleSheet\.create\s*\(\s*\{/g],
	call: /\bStyleSheet\.create\s*\(\s*\{/g,
	prefix: "StyleSheet.create(",
	jsxStyle: {
		regex: /<[A-Za-z_$][\w$.-]*\b/g,
		props: ["style"],
		shouldParse: (match) =>
			match.styleAttributes.every((attribute) => {
				if (!attribute.expression || typeof attribute.value !== "string") return false;
				const expression = attribute.value.trim();
				return expression.startsWith("{") || expression.startsWith("[");
			}),
	},
	residualPatterns: [
		{
			name: "Platform.select",
			regex: /\bPlatform\.select\s*\(/g,
			kind: "framework-semantics",
			hint: "React Native Platform.select requires platform-aware target lowering",
		},
	],
	targetImports: ['import { StyleSheet } from "react-native";'],
	namedObjects: true,
	sourceObjectOptions: { namedRuleObjects: true },
	lowerings: [reactNativeUnitLowering],
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.ReactNative],
		hostFrameworkConversions: reactToReactNative,
		handlesSourceHostAttributes: true,
		hostRepresentation: StyleHostRepresentationKind.StyleProp,
		standaloneHostRepresentation: StyleHostRepresentationKind.Component,
		preflight: ({ program }) => {
			const sourceTag =
				program.source?.subject === undefined
					? program.source?.hostTag
					: intrinsicTagForSubject(program.source.subject);
			if (
				sourceTag === undefined ||
				reactNativeHostTag(sourceTag) !== "View" ||
				!hasViewTextColor(program)
			)
				return [];
			return [
				hostResidual(
					program.source?.subject ?? program.source?.hostOpenTag ?? "color",
					"React Native View styles cannot preserve Text color semantics; keep the source until a Text host is established",
				),
			];
		},
		resolveHostRepresentation: ({
			framework,
			sourceFramework,
			program,
			source,
			binding,
			hasHostContext,
		}) => {
			const sourceHostFramework = sourceFramework ?? framework;
			if (
				sourceHostFramework === undefined ||
				sourceHostFramework === BuiltinHostFramework.ReactNative
			)
				return StyleHostRepresentationKind.StyleProp;
			if (
				(sourceHostFramework === BuiltinHostFramework.React ||
					sourceHostFramework === BuiltinHostFramework.Solid ||
					sourceHostFramework === BuiltinHostFramework.Vue) &&
				framework === BuiltinHostFramework.ReactNative &&
				program.source?.subject !== undefined &&
				intrinsicTagForSubject(program.source.subject) !== undefined &&
				hasOnlyStaticDeclarations(program)
			)
				return StyleHostRepresentationKind.Component;
			if (
				sourceHostFramework === BuiltinHostFramework.React &&
				framework === BuiltinHostFramework.ReactNative &&
				canRewriteReactHost(program, source, binding)
			)
				return StyleHostRepresentationKind.StyleProp;
			if (
				(sourceHostFramework === BuiltinHostFramework.React ||
					sourceHostFramework === BuiltinHostFramework.Solid) &&
				framework === BuiltinHostFramework.ReactNative &&
				program.source?.subject !== undefined &&
				!hasHostContext &&
				intrinsicTagForSubject(program.source.subject) !== undefined &&
				hasOnlyStaticDeclarations(program)
			)
				return StyleHostRepresentationKind.Component;
			return undefined;
		},
		rewriteComponent: ({
			code,
			binding,
			framework,
			sourceFramework,
			emittedExpression,
			representation,
		}) => {
			if (representation !== StyleHostRepresentationKind.StyleProp) return { code, residuals: [] };
			if (
				sourceFramework !== BuiltinHostFramework.React &&
				sourceFramework !== BuiltinHostFramework.Solid &&
				sourceFramework !== BuiltinHostFramework.Vue &&
				framework !== BuiltinHostFramework.React &&
				framework !== BuiltinHostFramework.Solid
			)
				return {
					code,
					residuals: [
						hostResidual(
							emittedExpression,
							`React Native styled subject projection requires ${BuiltinHostFramework.React}`,
						),
					],
				};
			return rewriteReactStyledSubject(code, binding, "View", binding);
		},
		rewriteHost: ({
			code,
			emittedExpression,
			binding,
			framework,
			sourceFramework,
			representation,
			program,
			sourceModules,
		}) => {
			if (representation !== StyleHostRepresentationKind.StyleProp) return { code, residuals: [] };
			const sourceHostFramework = sourceFramework ?? framework;
			if (
				sourceHostFramework === BuiltinHostFramework.React ||
				sourceHostFramework === BuiltinHostFramework.Solid
			)
				return rewriteReactHost(code, program, emittedExpression, sourceModules, binding);
			if (
				sourceHostFramework !== undefined &&
				sourceHostFramework !== BuiltinHostFramework.ReactNative
			)
				return {
					code,
					residuals: [
						{
							kind: "host-framework",
							text: emittedExpression,
							hint: `React Native style projection requires ${BuiltinHostFramework.ReactNative}`,
						},
					],
				};
			const expression = binding ?? emittedExpression;
			const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const pattern = new RegExp(`(\\s)(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
			if (!pattern.test(code))
				return {
					code,
					residuals: [
						{
							kind: "host-framework",
							text: expression,
							hint: "React Native style projection requires an exact class binding",
						},
					],
				};
			return { code: code.replace(pattern, `$1style={${expression}}`), residuals: [] };
		},
	},
	targetEmit: (program, context, programObject) => {
		const subject = program.source?.subject ?? context?.host?.subject;
		if (
			context?.host?.representation === StyleHostRepresentationKind.Component &&
			subject !== undefined &&
			hasOnlyStaticDeclarations(program)
		) {
			const sourceTag = intrinsicTagForSubject(subject);
			if (sourceTag === undefined || reactNativeHostTag(sourceTag) === undefined)
				return {
					text: "",
					imports: [],
					residuals: [
						hostResidual(
							subject,
							`React Native cannot preserve the ${sourceTag ?? "unknown"} host semantics as a View`,
						),
					],
				};
			const style = `StyleSheet.create({ style: ${programObject(reactNativeProgram(program))} }).style`;
			const attrsExpression = componentAttrsExpressionForSubject(subject);
			const attrsValue = componentAttrsValueExpression(attrsExpression);
			if (attrsExpression !== undefined && /\bas\b/u.test(attrsExpression))
				return {
					text: "",
					imports: [],
					residuals: [
						hostResidual(
							attrsExpression,
							"React Native View wrappers cannot preserve polymorphic attrs",
						),
					],
				};
			if (attrsExpression !== undefined && attrsValue === undefined)
				return {
					text: "",
					imports: [],
					residuals: [
						hostResidual(
							attrsExpression,
							"React Native component projection requires static attrs or a props callback",
						),
					],
				};
			const component =
				attrsExpression === undefined
					? `((style: NonNullable<ViewProps["style"]>) => __pandwindForwardRef<ComponentRef<typeof View>, ViewProps>((props, ref) => <View {...props} ref={ref} style={[style, props.style]} />))(${style})`
					: `((style: NonNullable<ViewProps["style"]>) => __pandwindForwardRef<ComponentRef<typeof View>, ViewProps>((props, ref) => { const attrs: Partial<ViewProps> = ${attrsValue}; return <View {...props} {...attrs} ref={ref} style={[style, props.style, attrs.style]} />; }))(${style})`;
			return {
				text: component,
				semantic: reactNativeProgram(program),
				imports: [
					'import { forwardRef as __pandwindForwardRef, type ComponentRef } from "react";',
					'import { StyleSheet, View, type ViewProps } from "react-native";',
				],
				residuals: [],
			};
		}
		if (context?.host?.representation !== StyleHostRepresentationKind.StyleProp) return undefined;
		if (program.rules.some((rule) => rule.name !== undefined)) return undefined;
		return {
			text: `StyleSheet.create({ style: ${programObject(program)} }).style`,
			semantic: reactNativeProgram(program),
			imports: ['import { StyleSheet } from "react-native";'],
			residuals: [],
		};
	},
});

export default {
	...reactNativeAdapter,
	parse: (source: string, context: AdapterParseContext) => {
		const parsed = reactNativeAdapter.parse(source, context);
		if (context.targetId === undefined || context.targetId === CodemodAdapterId.ReactNative)
			return parsed;
		return {
			...parsed,
			matches: parsed.matches.map((match) => ({
				...match,
				program: normalizeCssObjectNumericUnits(match.program, new Set(["lineHeight"])),
			})),
		};
	},
};
