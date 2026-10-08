import { CodemodCallPatternFormTag } from "../identifiers.ts";
import {
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	styleProgramFromSourceObject,
	type StyleProgram,
} from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type { AdapterParseContext, AdapterParseResult } from "../adapter-contract.ts";
import { JsxStyleHost } from "../jsx-style-host.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { SourceBindingKind, type SourceBinding } from "yumcss/source";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import { normalizeCssObjectNumericUnits } from "../style-program-units.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodCallPatternKindTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

type SerializedObject = {
	values: Array<[string, string]>;
	children: Map<string, SerializedObject>;
};

/** Compiled's authored object style quotes every key, including CSS
 * properties and condition selectors. Target emission must reproduce that
 * byte-for-byte rather than reusing the shared identifier-style renderer. */
const serializedObjectText = (node: SerializedObject): string => {
	const values = node.values.map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
	const children = [...node.children].map(
		([key, child]) => `${JSON.stringify(key)}: ${serializedObjectText(child)}`,
	);
	return `{ ${[...values, ...children].join(", ")} }`;
};

const serializedProgramText = (program: StyleProgram): string => {
	const serializedValue = (
		value: StyleProgram["declarations"][number]["value"],
		important = false,
	): string => {
		if (value.kind === StyleValueKindTag.Dynamic)
			return important ? `(${value.expression}) + " !important"` : value.expression;
		const resolved =
			value.kind === StyleValueKindTag.Token
				? important
					? (value.resolved ?? value.authored)
					: value.authored
				: value.value;
		return JSON.stringify(important ? `${String(resolved)} !important` : resolved);
	};
	const root: SerializedObject = { values: [], children: new Map() };
	const add = (
		node: SerializedObject,
		index: number,
		declaration: StyleProgram["declarations"][number],
	): void => {
		const condition = declaration.conditions[index];
		if (condition === undefined) {
			node.values.push([
				declaration.property,
				serializedValue(declaration.value, declaration.important),
			]);
			return;
		}
		const key = condition.raw ?? condition.value ?? condition.name;
		const child = node.children.get(key) ?? { values: [], children: new Map() };
		node.children.set(key, child);
		add(child, index + 1, declaration);
	};
	const addRule = (node: SerializedObject, rule: StyleProgram["rules"][number]): void => {
		for (const declaration of rule.declarations) add(node, 0, declaration);
		for (const child of rule.children.toReversed()) {
			const key = child.name ?? child.selector ?? child.kind;
			const nested = node.children.get(key) ?? { values: [], children: new Map() };
			node.children.set(key, nested);
			addRule(nested, child);
		}
	};
	const firstRule = program.rules[0];
	if (firstRule?.kind === StyleRuleKindTag.Keyframes) {
		const keyframes: SerializedObject = { values: [], children: new Map() };
		for (const child of firstRule.children) {
			const frame: SerializedObject = { values: [], children: new Map() };
			addRule(frame, child);
			keyframes.children.set(child.selector ?? "from", frame);
		}
		return serializedObjectText(keyframes);
	}
	if (program.rules.some((rule) => rule.name !== undefined)) {
		for (const rule of program.rules) {
			if (rule.name === undefined) continue;
			const named: SerializedObject = { values: [], children: new Map() };
			addRule(named, rule);
			root.children.set(rule.name, named);
		}
	} else {
		const declarations = program.rules[0]?.declarations ?? program.declarations;
		for (const declaration of declarations) add(root, 0, declaration);
	}
	return serializedObjectText(root);
};

const defaultAdapter = defineCodemodAdapter({
	id: CodemodAdapterId.Compiled,
	officialApi: {
		apis: [
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "cssMap", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "keyframes", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "styled", status: AdapterOfficialApiStatusTag.Deprecated },
			{ name: "ClassNames", status: AdapterOfficialApiStatusTag.Deprecated },
		],
		compilerIntegrations: ["@compiled/babel-plugin", "@compiled/webpack-loader"],
	},
	patterns: [
		{
			name: "jsx-css",
			regex: /<[A-Za-z_$][\w$.-]*\b/g,
			form: CodemodCallPatternFormTag.JsxStyle,
			styleProps: ["css"],
		},
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{
			name: "cssMap",
			regex: /\bcssMap\s*\(\s*\{/g,
			objectKind: "named",
			sourceObjectOptions: { namedRuleObjects: true },
		},
		{
			name: "styled",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g,
		},
		{
			name: "styled-template",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "keyframes",
			kind: CodemodCallPatternKindTag.Keyframes,
			regex: /\bkeyframes\s*\(\s*\{/g,
		},
		{
			name: "ClassNames",
			regex: /<\s*ClassNames\b/g,
			form: CodemodCallPatternFormTag.Residual,
			semanticBindings: [{ source: "@compiled/react", imported: "ClassNames" }],
			regexForBinding: (binding: SourceBinding) => {
				const reference =
					binding.kind === SourceBindingKind.Namespace
						? `${binding.localName}.ClassNames`
						: binding.localName;
				return new RegExp(`<\\s*${reference.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "g");
			},
			residual: {
				kind: StyleProgramResidualKindTag.Component,
				hint: "Compiled ClassNames requires a host-aware render-prop lowering",
			},
		},
	],
	packages: CodemodAdapterKit.dependency("@compiled/react", "peer"),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Compiled, "partial", {
		components: "partial",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [
		/from\s+["']@compiled\/(?:react|css-in-js)["']/,
		/\b(?:css|cssMap|styled|keyframes)\s*[({]/,
		/<\s*ClassNames\b/,
	],
	sourceModules: ["@compiled/react", "@compiled/css-in-js"],
	sourceModulesSideEffectFree: ["@compiled/react"],
	configFiles: ["package.json"],
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			dynamicClassCarrier: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
		},
	},
	emit(program, { firstKind }) {
		if (firstKind(program) === StyleRuleKindTag.Keyframes)
			return {
				text: `keyframes(${serializedProgramText(program)})`,
				imports: ['import { keyframes } from "@compiled/react";'],
			};
		return {
			text: `css(${serializedProgramText(program)})`,
			imports: ['import { css } from "@compiled/react";'],
		};
	},
});

function parseStaticClassNames(
	source: string,
	context: AdapterParseContext,
): AdapterParseResult["matches"] {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const references = compiledClassNamesReferences(context);
	const tag = references.length === 0 ? "ClassNames" : references.join("|");
	const wrapper = new RegExp(
		`<\\s*(?:${tag})\\s*>\\s*\\{\\s*\\(\\s*\\{\\s*css\\s*\\}\\s*\\)\\s*=>\\s*(<[^>]+\\/>)\\s*\\}\\s*<\\/\\s*(?:${tag})\\s*>`,
		"gu",
	);
	for (const match of source.matchAll(wrapper)) {
		const start = match.index ?? 0;
		const openingReference = match[0].match(/^<\s*([^\s>]+)/u)?.[1];
		const localName = openingReference?.split(".")[0];
		if (localName !== undefined && context.bindings?.isShadowedAt(localName, start) === true)
			continue;
		const openingTag = match[1];
		if (openingTag === undefined) continue;
		const hostStart = start + match[0].indexOf(openingTag);
		const host = JsxStyleHost.parse(source, hostStart, context, ["className"], {
			file: context.file,
			start,
			end: start + match[0].length,
			adapter: context.config.adapter,
			framework: BuiltinHostFramework.React,
		});
		if (host === undefined || host.body.trim() === "") continue;
		const program = styleProgramFromSourceObject(host.body, {
			source: {
				...host.source,
				start,
				end: start + match[0].length,
				framework: BuiltinHostFramework.React,
			},
			sourceOffset: hostStart,
		});
		if (
			program.residuals.length > 0 ||
			StyleProgramAnalysis.hasDynamic(program) ||
			program.rules.length === 0
		)
			continue;
		matches.push({
			start,
			end: start + match[0].length,
			program,
			sourceText: match[0],
		});
	}
	return matches;
}

function compiledClassNamesReferences(context: AdapterParseContext): readonly string[] {
	return (
		context.bindings
			?.fromModule("@compiled/react")
			.filter((binding) => binding.importedName === "ClassNames")
			.map((binding) =>
				binding.kind === SourceBindingKind.Namespace
					? `${binding.localName}\\.ClassNames`
					: binding.localName.replaceAll("$", "\\$"),
			)
			.filter((reference, index, all) => all.indexOf(reference) === index) ?? []
	);
}

function widenClassNamesResidual(
	match: AdapterParseResult["matches"][number],
	source: string,
	context: AdapterParseContext,
): AdapterParseResult["matches"][number] {
	if (!match.program.residuals.some(({ kind }) => kind === StyleProgramResidualKindTag.Component))
		return match;
	const references = compiledClassNamesReferences(context);
	const tag = references.length === 0 ? "ClassNames" : references.join("|");
	const wrapper = new RegExp(`<\\s*(?:${tag})\\b[\\s\\S]*?<\\/\\s*(?:${tag})\\s*>`, "gu");
	const wholeWrapper = [...source.matchAll(wrapper)].find(
		(candidate) => candidate.index === match.start,
	);
	if (wholeWrapper === undefined) return match;
	return {
		...match,
		end: match.start + wholeWrapper[0].length,
		sourceText: wholeWrapper[0],
		program: {
			...match.program,
			source: {
				...match.program.source,
				end: match.start + wholeWrapper[0].length,
			},
		},
	};
}

export default {
	...defaultAdapter,
	parse(source: string, context: AdapterParseContext): AdapterParseResult {
		const parsed = defaultAdapter.parse(source, context);
		const staticClassNames = parseStaticClassNames(source, context);
		const residualClassNames = parsed.matches.map((match) =>
			widenClassNamesResidual(match, source, context),
		);
		const protectedMatches = [
			...staticClassNames,
			...residualClassNames.filter((match) =>
				match.program.residuals.some(({ kind }) => kind === StyleProgramResidualKindTag.Component),
			),
		];
		if (protectedMatches.length === 0)
			return {
				...parsed,
				matches: parsed.matches.map((match) => ({
					...match,
					program: normalizeCssObjectNumericUnits(match.program),
				})),
			};
		const ranges = protectedMatches.map((match) => ({ start: match.start, end: match.end }));
		const overlaps = (match: { readonly start: number; readonly end: number }): boolean =>
			ranges.some((range) => match.start < range.end && match.end > range.start);
		return {
			matches: [
				...residualClassNames.filter((match) => !overlaps(match)),
				...staticClassNames,
				...protectedMatches.filter((match) =>
					match.program.residuals.some(
						({ kind }) => kind === StyleProgramResidualKindTag.Component,
					),
				),
			]
				.toSorted((left, right) => left.start - right.start)
				.map((match) => ({
					...match,
					program: normalizeCssObjectNumericUnits(match.program),
				})),
			residuals: parsed.residuals,
		};
	},
};
