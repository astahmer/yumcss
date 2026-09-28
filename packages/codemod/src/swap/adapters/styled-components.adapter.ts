import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import {
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	type StyleProgram,
} from "../semantic-ir.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	CodemodAdapterId,
	CodemodCallPatternKindTag,
	StyleDynamicExpressionKind,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { styledSubjectFromFunctionMatch } from "../host-component-rewriter.ts";

const styledSubjectPattern = String.raw`\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\s*\.attrs\s*\([\s\S]*?\))?`;

interface StyledFunctionValue {
	readonly expression: string;
	readonly parameter: string;
	readonly body: string;
}

function styledFunctionValue(expression: string): StyledFunctionValue | undefined {
	const arrow = expression.indexOf("=>");
	if (arrow === -1) return undefined;
	const head = expression.slice(0, arrow).trim();
	const parameter =
		head.startsWith("(") && head.endsWith(")")
			? head.slice(1, -1).trim()
			: /^[A-Za-z_$][\w$]*$/u.test(head)
				? head
				: undefined;
	if (parameter === undefined) return undefined;
	return {
		expression,
		parameter,
		body: expression.slice(arrow + 2).trim(),
	};
}

function mapStyledDeclarations(
	program: StyleProgram,
	map: (declaration: StyleProgram["declarations"][number]) => StyleProgram["declarations"][number],
): StyleProgram {
	const mapRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.map(map),
		children: rule.children.map(mapRule),
	});
	return {
		...program,
		declarations: program.declarations.map(map),
		rules: program.rules.map(mapRule),
	};
}

function styledDynamicEmission(
	program: StyleProgram,
	programObject: (program: StyleProgram) => string,
) {
	const findDynamic = (rules: StyleProgram["rules"]): StyleProgram["declarations"] =>
		rules.flatMap((rule) => [
			...rule.declarations.filter(
				(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
			),
			...findDynamic(rule.children),
		]);
	const ruleDynamic = findDynamic(program.rules);
	const dynamic =
		ruleDynamic.length > 0
			? ruleDynamic
			: program.declarations.filter(
					(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
				);
	if (dynamic.length === 0) return { text: programObject(program), residuals: [] };
	const callbacks = dynamic.map((declaration) =>
		declaration.value.kind === StyleValueKindTag.Dynamic &&
		declaration.value.expressionKind === StyleDynamicExpressionKind.Function
			? styledFunctionValue(declaration.value.expression)
			: undefined,
	);
	if (callbacks.every((callback) => callback === undefined)) {
		const unsafeValues = dynamic.filter(
			(declaration) =>
				declaration.value.kind === StyleValueKindTag.Dynamic &&
				declaration.value.expressionKind !== StyleDynamicExpressionKind.Identifier &&
				declaration.value.expressionKind !== StyleDynamicExpressionKind.Member,
		);
		if (unsafeValues.length === 0) return { text: programObject(program), residuals: [] };
		return {
			text: "",
			residuals: [
				{
					kind: StyleProgramResidualKindTag.DynamicValues,
					text: unsafeValues
						.map((declaration) =>
							declaration.value.kind === StyleValueKindTag.Dynamic
								? declaration.value.expression
								: "",
						)
						.join(", "),
					hint: "styled-components style-object callbacks require function-valued declarations",
				},
			],
		};
	}
	if (callbacks.some((callback) => callback === undefined))
		return {
			text: "",
			residuals: [
				{
					kind: StyleProgramResidualKindTag.DynamicValues,
					text: dynamic
						.map((declaration) =>
							declaration.value.kind === StyleValueKindTag.Dynamic
								? declaration.value.expression
								: "",
						)
						.join(", "),
					hint: "styled-components style-object callbacks require function-valued declarations",
				},
			],
		};
	const sharedParameter = callbacks.every(
		(callback) => callback!.parameter === callbacks[0]!.parameter,
	)
		? callbacks[0]!.parameter
		: "props";
	const transformed = mapStyledDeclarations(program, (declaration) => {
		if (declaration.value.kind !== StyleValueKindTag.Dynamic) return declaration;
		const callback = styledFunctionValue(declaration.value.expression);
		if (callback === undefined) return declaration;
		const expression =
			callback.parameter === sharedParameter && !callback.body.startsWith("{")
				? callback.body
				: `(${callback.expression})(${sharedParameter})`;
		return {
			...declaration,
			value: { ...declaration.value, expression },
		};
	});
	return {
		text: `(${sharedParameter}) => (${programObject(transformed)})`,
		residuals: [],
	};
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.StyledComponents,
	officialApi: {
		pluginSystems: ["babel-plugin-styled-components", "attrs", "ThemeProvider"],
		compilerIntegrations: ["babel-plugin-styled-components", "@swc/plugin-styled-components"],
		ssrHooks: ["ServerStyleSheet", "interleaveWithNodeStream"],
	},
	patterns: [
		{
			name: "styled",
			kind: CodemodCallPatternKindTag.Styled,
			regex: new RegExp(`${styledSubjectPattern}\\s*\\(\\s*\\{`, "g"),
		},
		{
			name: "styled-function",
			kind: CodemodCallPatternKindTag.Styled,
			regex: new RegExp(
				`${styledSubjectPattern}\\s*\\(\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`,
				"g",
			),
			functionCall: {
				functionCall: new RegExp(
					`${styledSubjectPattern}\\s*\\(\\s*(?:\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`,
					"g",
				),
				subjectFromMatch: (match) => styledSubjectFromFunctionMatch(match),
			},
		},
		{
			name: "styled-template",
			kind: CodemodCallPatternKindTag.Styled,
			regex: new RegExp(`${styledSubjectPattern}\\s*\\x60(?:\\\\.|[^\\x60])*\\x60`, "g"),
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "createGlobalStyle-template",
			kind: CodemodCallPatternKindTag.Global,
			regex: /\bcreateGlobalStyle\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "keyframes-template",
			kind: CodemodCallPatternKindTag.Keyframes,
			regex: /\bkeyframes\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "createGlobalStyle",
			kind: CodemodCallPatternKindTag.Global,
			regex: /\bcreateGlobalStyle\s*\(\s*\{/g,
		},
		{
			name: "keyframes",
			kind: CodemodCallPatternKindTag.Keyframes,
			regex: /\bkeyframes\s*\(\s*\{/g,
		},
		{
			name: "runtime-context",
			regex:
				/(?:import[^;\n]*\b(?:ThemeProvider|StyleSheetManager|ServerStyleSheet)\b[^;\n]*;|<(?:ThemeProvider|StyleSheetManager|ServerStyleSheet)\b[^>]*>)/g,
			form: CodemodCallPatternFormTag.Residual,
			residual: {
				kind: StyleProgramResidualKindTag.RuntimeContext,
				hint: "styled-components runtime providers require target-aware context lowering",
			},
		},
	],
	packages: CodemodAdapterKit.dependency("styled-components", "peer"),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.StyledComponents, "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		"function-values": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
		components: "exact",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			hostRepresentation: StyleHostRepresentationKind.Component,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
			hostFrameworks: [BuiltinHostFramework.React],
		},
	},
	detectPatterns: [/styled-components/, /\bstyled\s*\./],
	sourceModules: ["styled-components"],
	configFiles: ["package.json"],
	emit(program, { firstKind, programObject, templateCss }) {
		const kind = firstKind(program);
		if (kind === StyleRuleKindTag.Keyframes)
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "styled-components";'],
			};
		if (kind === StyleRuleKindTag.Global)
			return {
				text: `createGlobalStyle\`${templateCss(program)}\``,
				imports: ['import { createGlobalStyle } from "styled-components";'],
			};
		const dynamic = styledDynamicEmission(program, programObject);
		return {
			text: `${program.source?.subject ?? "styled.div"}(${dynamic.text})`,
			imports: ['import styled from "styled-components";'],
			residuals: dynamic.residuals,
		};
	},
});
