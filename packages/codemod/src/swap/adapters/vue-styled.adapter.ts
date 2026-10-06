import { CodemodCallPatternFormTag } from "../identifiers.ts";
import {
	StyleValueKindTag,
	StyleProgramResidualKindTag,
	type StyleProgram,
} from "../semantic-ir.ts";
import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { canConvertStaticSolidJsx, rewriteSolidJsxToVue } from "../host-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterEmitContext, AdapterEmitResult } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
} from "../identifiers.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import {
	componentAttrsExpressionForSubject,
	componentAttrsValueExpression,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";

function functionExpression(expression: string): { parameter: string; body: string } | undefined {
	const match = /^\s*(?:\(\s*([^)]*?)\s*\)|([A-Za-z_$][\w$]*))\s*=>\s*([\s\S]*)$/u.exec(
		expression.trim(),
	);
	if (match === null) return undefined;
	return { parameter: (match[1] ?? match[2] ?? "").trim(), body: match[3]!.trim() };
}

function dynamicStyleProps(program: StyleProgram): readonly string[] | undefined {
	const names = new Set<string>();
	for (const declaration of StyleProgramAnalysis.declarations(program)) {
		if (declaration.value.kind !== StyleValueKindTag.Dynamic) continue;
		const callback = functionExpression(declaration.value.expression);
		if (callback === undefined || callback.parameter === "") return undefined;
		const parameter = callback.parameter;
		if (/^\{[^{}]*\}$/u.test(parameter)) {
			for (const property of parameter.slice(1, -1).split(",")) {
				const name = property.trim();
				if (!/^[A-Za-z_$][\w$]*$/u.test(name)) return undefined;
				names.add(name);
			}
			continue;
		}
		if (!/^[A-Za-z_$][\w$]*$/u.test(parameter)) return undefined;
		if (new RegExp(`\\b${parameter}\\.theme(?:\\.|\\b)`, "u").test(callback.body)) return undefined;
		if (new RegExp(`\\b${parameter}\\s*\\[`, "u").test(callback.body)) return undefined;
		const member = new RegExp(`\\b${parameter}\\.([A-Za-z_$][\\w$]*)`, "gu");
		for (const match of callback.body.matchAll(member)) {
			if (match[0]!.split(".").length !== 2) return undefined;
			names.add(match[1]!);
		}
	}
	return [...names].toSorted();
}

function templateCss(
	program: StyleProgram,
	renderTemplateCss: (program: StyleProgram) => string,
): string {
	const dynamicValues: Array<{ marker: string; expression: string }> = [];
	const mapDeclaration = (declaration: StyleProgram["declarations"][number]) => {
		if (declaration.value.kind !== StyleValueKindTag.Dynamic) return declaration;
		const marker = `__yumcss_dynamic_value_${dynamicValues.length}__`;
		dynamicValues.push({ marker, expression: declaration.value.expression });
		return {
			...declaration,
			value: { kind: StyleValueKindTag.Literal as const, value: marker },
		};
	};
	const mapRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.map(mapDeclaration),
		children: rule.children.map(mapRule),
	});
	const serialized = renderTemplateCss({
		...program,
		declarations: program.declarations.map(mapDeclaration),
		rules: program.rules.map(mapRule),
	});
	const escaped = serialized
		.replaceAll("\\", "\\\\")
		.replaceAll("`", "\\`")
		.replaceAll("${", "\\${");
	return dynamicValues.reduce(
		(css, { marker, expression }) => css.replaceAll(marker, `\${${expression}}`),
		escaped,
	);
}

function vueStyledEmission(
	program: StyleProgram,
	_context: AdapterEmitContext | undefined,
	_programObject: (program: StyleProgram) => string,
	renderTemplateCss: (program: StyleProgram) => string,
): AdapterEmitResult {
	const namedRules = program.rules.filter((rule) => rule.name !== undefined);
	if (namedRules.length > 0)
		return {
			text: "",
			imports: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Capability,
					text: namedRules.map((rule) => rule.name).join(", "),
					hint: "vue-styled-components emits component constructors, so preserving this named style map requires project-wide component-use rewrites",
				},
			],
		};
	const subject = program.source?.subject;
	const tag =
		subject === undefined ? (program.source?.hostTag ?? "div") : intrinsicTagForSubject(subject);
	if (tag === undefined)
		return {
			text: "",
			imports: ['import styled from "vue-styled-components";'],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: subject ?? "styled component",
					hint: "vue-styled-components can preserve only intrinsic tag subjects from styled-components",
				},
			],
		};
	const props = dynamicStyleProps(program);
	if (props === undefined)
		return {
			text: "",
			imports: ['import styled from "vue-styled-components";'],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.FunctionDynamic,
					text: program.source?.subject ?? "dynamic styled props",
					hint: "vue-styled-components dynamic styles require statically identifiable, non-theme props",
				},
			],
		};
	const tagExpression =
		props.length === 0
			? /^[a-z][\w-]*$/u.test(tag)
				? `styled.${tag}`
				: `styled(${JSON.stringify(tag)})`
			: `styled(${JSON.stringify(tag)}, { ${props.map((name) => `${JSON.stringify(name)}: null`).join(", ")} })`;
	const component = `${tagExpression}\`${templateCss(program, renderTemplateCss)}\``;
	const attrsExpression =
		subject === undefined ? undefined : componentAttrsExpressionForSubject(subject);
	if (attrsExpression === undefined)
		return {
			text: component,
			imports: ['import styled from "vue-styled-components";'],
			residuals: [...program.residuals],
		};
	const attrsValue = componentAttrsValueExpression(
		attrsExpression,
		"({ ...this.$attrs, ...this.$props })",
	);
	if (attrsValue === undefined)
		return {
			text: "",
			imports: ['import styled from "vue-styled-components";'],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: attrsExpression,
					hint: "styled component attrs must be a static object or a props callback to preserve them",
				},
			],
		};
	const styleProps = `{ ${props.map((name) => `${JSON.stringify(name)}: forwarded[${JSON.stringify(name)}]`).join(", ")} }`;
	const removeStyleProps = props
		.map((name) => `delete forwarded[${JSON.stringify(name)}];`)
		.join(" ");
	return {
		text: `((Component) => Vue.extend({ inheritAttrs: false, render(h) { const authoredAttrs = ${attrsValue}; const forwarded = { ...this.$attrs, ...this.$props, ...authoredAttrs }; const { class: authoredClass, className: authoredClassName, style: authoredStyle, ...attrs } = forwarded; const props = ${styleProps}; ${removeStyleProps} return h(Component, { attrs, props, on: this.$listeners, class: [this.$vnode.data?.class, authoredClass, authoredClassName].filter(Boolean), style: { ...this.$vnode.data?.style, ...authoredStyle } }, this.$slots.default); } }))(${component})`,
		imports: ['import styled from "vue-styled-components";', 'import Vue from "vue";'],
		residuals: [...program.residuals],
	};
}

const vueStyled = makeExtraAdapter({
	id: CodemodAdapterId.VueStyled,
	officialApi: {
		apis: [
			{
				name: "styled(tagName)",
				status: AdapterOfficialApiStatusTag.Supported,
				forms: ["template"],
			},
			{ name: "ThemeProvider", status: AdapterOfficialApiStatusTag.Supported },
		],
	},
	modules: ["vue-styled-components"],
	packages: {
		packages: [
			{ name: "vue-styled-components", kind: AdapterDependencyKindTag.Runtime },
			{ name: "vue", kind: AdapterDependencyKindTag.Runtime },
		],
	},
	detect: [
		/from\s+["'](?:vue-styled-components|@vue-styled-components\/core)["']/g,
		/\bstyled\.[A-Za-z_$][\w$]*(?:<[^`]*>)?\s*`/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))\s*\(\s*\{/g,
	],
	call: /\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*`(?:\\.|[^`])*`/g,
	form: CodemodCallPatternFormTag.Template,
	functionValues: true,
	prefix: "styled.div`",
	targetImports: ['import styled from "vue-styled-components";'],
	capabilityOverrides: {
		components: "exact",
		"framework-semantics": "exact",
		"function-values": "exact",
	},
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.Vue],
		hostFrameworkConversions: [
			{ from: BuiltinHostFramework.React, to: BuiltinHostFramework.Vue },
			{
				from: BuiltinHostFramework.Solid,
				to: BuiltinHostFramework.Vue,
				canConvert: ({ file, source }) => canConvertStaticSolidJsx(file, source),
				rewriteDocument: ({ code, file, targetFramework }) =>
					rewriteSolidJsxToVue(code, file, targetFramework),
			},
		],
		hostRepresentation: StyleHostRepresentationKind.Component,
		standaloneHostRepresentation: StyleHostRepresentationKind.Component,
		resolveHostRepresentation: ({ framework, program }) =>
			(framework === undefined ||
				framework === BuiltinHostFramework.Vue ||
				framework === BuiltinHostFramework.React) &&
			dynamicStyleProps(program) !== undefined &&
			subjectSupported(program)
				? StyleHostRepresentationKind.Component
				: undefined,
	},
	targetEmit: vueStyledEmission,
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});

function subjectSupported(program: StyleProgram): boolean {
	const subject = program.source?.subject;
	return subject === undefined || intrinsicTagForSubject(subject) !== undefined;
}

export default vueStyled;
