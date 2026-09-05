import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleRuleKindTag, StyleValueKindTag, type StyleProgram } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
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
	const serializedValue = (value: StyleProgram["declarations"][number]["value"]): string => {
		if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
		if (value.kind === StyleValueKindTag.Token) return JSON.stringify(value.authored);
		return JSON.stringify(value.value);
	};
	const root: SerializedObject = { values: [], children: new Map() };
	const add = (
		node: SerializedObject,
		index: number,
		declaration: StyleProgram["declarations"][number],
	): void => {
		const condition = declaration.conditions[index];
		if (condition === undefined) {
			node.values.push([declaration.property, serializedValue(declaration.value)]);
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

export default defineCodemodAdapter({
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
			residual: {
				kind: "component",
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
