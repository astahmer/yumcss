import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleValueKindTag } from "../semantic-ir.ts";
import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type { AdapterEmitContext, AdapterEmitResult } from "../adapter-contract.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { StyleProgramResidualKindTag, type StyleProgram } from "../semantic-ir.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import { camelPropertyName } from "../adapter-template-parser.ts";
import {
	componentAttrsExpressionForSubject,
	componentAttrsValueExpression,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";

function isStaticProgram(program: StyleProgram): boolean {
	return StyleProgramAnalysis.declarations(program).every(
		(declaration) => declaration.value.kind !== StyleValueKindTag.Dynamic,
	);
}

function functionExpression(expression: string): { parameter: string; body: string } | undefined {
	const match = /^\(([^\n]*)\)\s*=>\s*([\s\S]*)$/.exec(expression.trim());
	return match === null ? undefined : { parameter: match[1]!.trim(), body: match[2]!.trim() };
}

function solidStyledEmission(
	program: StyleProgram,
	_context: AdapterEmitContext | undefined,
	programObject: (program: StyleProgram) => string,
): AdapterEmitResult | undefined {
	const subject = program.source?.subject;
	if (subject === undefined) return undefined;
	const tag = intrinsicTagForSubject(subject);
	if (tag === undefined)
		return {
			text: "",
			imports: ['import { styled } from "solid-styled-components";'],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: subject,
					hint: "solid-styled-components requires a documented intrinsic tag subject",
				},
			],
		};
	const mapDeclaration = (declaration: StyleProgram["declarations"][number]) => ({
		...declaration,
		property: declaration.property.startsWith("--")
			? declaration.property
			: camelPropertyName(declaration.property),
	});
	const stripFunction = (declaration: StyleProgram["declarations"][number]) => {
		if (declaration.value.kind !== StyleValueKindTag.Dynamic) return mapDeclaration(declaration);
		const value = functionExpression(declaration.value.expression);
		return value === undefined
			? mapDeclaration(declaration)
			: {
					...mapDeclaration(declaration),
					value: { ...declaration.value, expression: value.body },
				};
	};
	const stripRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.map(stripFunction),
		children: rule.children.map(stripRule),
	});
	const body = {
		...program,
		declarations: program.declarations.map(stripFunction),
		rules: program.rules.map(stripRule),
	};
	const dynamic = StyleProgramAnalysis.declarations(program).filter(
		(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
	);
	const functions = dynamic.map((declaration) =>
		declaration.value.kind === StyleValueKindTag.Dynamic
			? functionExpression(declaration.value.expression)
			: undefined,
	);
	if (functions.some((value) => value === undefined)) return undefined;
	const parameter = functions[0]?.parameter;
	if (functions.some((value) => value?.parameter !== parameter)) return undefined;
	const styleFactory =
		dynamic.length === 0
			? `() => (${programObject(body)})`
			: `(${parameter}) => (${programObject(body)})`;
	const component = `styled(${JSON.stringify(tag)})(${styleFactory})`;
	const attrsExpression = componentAttrsExpressionForSubject(subject);
	if (attrsExpression === undefined)
		return {
			text: component,
			semantic: program,
			imports: ['import { styled } from "solid-styled-components";'],
			residuals: [...program.residuals],
		};
	if (/(?:^|[{,])\s*(?:["']as["']|as)\s*:/u.test(attrsExpression))
		return {
			text: "",
			imports: ['import { styled } from "solid-styled-components";'],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: attrsExpression,
					hint: "solid-styled-components does not document the polymorphic as prop",
				},
			],
		};
	const attrsValue = componentAttrsValueExpression(attrsExpression, "props");
	if (attrsValue === undefined)
		return {
			text: "",
			imports: ['import { styled } from "solid-styled-components";'],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.HostFramework,
					text: attrsExpression,
					hint: "styled component attrs must be a static object or a props callback to preserve them",
				},
			],
		};
	return {
		text: `((Component) => (props) => { const attrs = ${attrsValue}; const { className: _attrsClassName, class: attrsClass, style: attrsStyle, ...attrsProps } = attrs; const { className: _className, class: propsClass, style: propsStyle, ...rest } = props; return __pandwindCreateComponent(Component, { ...rest, ...attrsProps, class: [propsClass, _className, attrsClass, _attrsClassName].filter(Boolean).join(" ") || undefined, style: { ...propsStyle, ...attrsStyle } }); })(${component})`,
		semantic: program,
		imports: [
			'import { styled } from "solid-styled-components";',
			'import { createComponent as __pandwindCreateComponent } from "solid-js";',
		],
		residuals: [...program.residuals],
	};
}

function supportsStaticOrFunctionProgram(program: StyleProgram): boolean {
	if (isStaticProgram(program)) return true;
	const declarations = StyleProgramAnalysis.declarations(program);
	const dynamic = declarations.flatMap((declaration) =>
		declaration.value.kind === StyleValueKindTag.Dynamic ? [declaration] : [],
	);
	if (dynamic.length === 0) return false;
	const functions = dynamic.map((declaration) =>
		declaration.value.kind === StyleValueKindTag.Dynamic
			? functionExpression(declaration.value.expression)
			: undefined,
	);
	return (
		functions.every((value) => value !== undefined) &&
		new Set(functions.map((value) => value!.parameter)).size === 1
	);
}

const solidStyled = makeExtraAdapter({
	id: CodemodAdapterId.SolidStyled,
	officialApi: {
		apis: [
			{ name: "styled(tagName)", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "ThemeProvider", status: AdapterOfficialApiStatusTag.Supported },
		],
	},
	modules: ["solid-styled-components"],
	packages: {
		packages: [{ name: "solid-styled-components", kind: AdapterDependencyKindTag.Runtime }],
	},
	detect: [
		/from\s+["']solid-styled-components["']/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))\s*\(\s*\{/g,
	],
	call: /\b(?:styled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))(?:\.props\s*\(\s*\{[\s\S]*?\}\s*\))?[^`]*`(?:\\.|[^`])*`|css\s*\(\s*\{)/g,
	forms: [CodemodCallPatternFormTag.Template, CodemodCallPatternFormTag.Object],
	prefix: "css(",
	functionValues: true,
	targetImports: ['import { css } from "solid-styled-components";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	capabilityOverrides: {
		components: "exact",
		"framework-semantics": "exact",
		"function-values": "exact",
	},
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.Solid],
		hostFrameworkConversions: [
			{ from: BuiltinHostFramework.React, to: BuiltinHostFramework.Solid },
			{
				from: BuiltinHostFramework.Vue,
				to: BuiltinHostFramework.Solid,
				canConvert: ({ file, source }) => canConvertStaticVueSfc(file, source),
				rewriteDocument: ({ code, targetFramework }) => rewriteVueSfcToJsx(code, targetFramework),
			},
		],
		hostRepresentation: StyleHostRepresentationKind.Component,
		standaloneHostRepresentation: StyleHostRepresentationKind.Component,
		resolveHostRepresentation: ({ framework, program }) =>
			supportsStaticOrFunctionProgram(program) &&
			(framework === undefined ||
				framework === BuiltinHostFramework.Solid ||
				framework === BuiltinHostFramework.React)
				? StyleHostRepresentationKind.Component
				: undefined,
	},
	targetEmit: solidStyledEmission,
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});

export default solidStyled;
