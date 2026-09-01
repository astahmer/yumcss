import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { canConvertStaticSolidJsx, rewriteSolidJsxToVue } from "../host-adapters.ts";
import type { AdapterEmitContext, AdapterEmitResult } from "../adapter-contract.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import type { StyleProgram } from "../semantic-ir.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";

function isStaticProgram(program: StyleProgram): boolean {
	return program.rules.every(
		(rule) =>
			rule.declarations.every((declaration) => declaration.value.kind !== "dynamic") &&
			rule.children.every((child) => isStaticProgram({ ...program, rules: [child] })),
	);
}

function functionExpression(expression: string): { parameter: string; body: string } | undefined {
	const match = /^\(([^\n]*)\)\s*=>\s*([\s\S]*)$/.exec(expression.trim());
	return match === null ? undefined : { parameter: match[1]!.trim(), body: match[2]!.trim() };
}

function functionStyleEmission(
	program: StyleProgram,
	_context: AdapterEmitContext | undefined,
	programObject: (program: StyleProgram) => string,
): AdapterEmitResult | undefined {
	const declarations = StyleProgramAnalysis.declarations(program);
	const dynamic = declarations.flatMap((declaration) =>
		declaration.value.kind === "dynamic" ? [declaration] : [],
	);
	if (dynamic.length === 0 || program.source?.subject === undefined) return undefined;
	const functions = dynamic.map((declaration) =>
		declaration.value.kind === "dynamic"
			? functionExpression(declaration.value.expression)
			: undefined,
	);
	if (functions.some((value) => value === undefined)) return undefined;
	const parameter = functions[0]!.parameter;
	if (functions.some((value) => value!.parameter !== parameter)) return undefined;
	const stripFunction = (declaration: StyleProgram["declarations"][number]) => {
		if (declaration.value.kind !== "dynamic") return declaration;
		const value = functionExpression(declaration.value.expression);
		return value === undefined
			? declaration
			: { ...declaration, value: { ...declaration.value, expression: value.body } };
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
	return {
		text: `${program.source.subject}((${parameter}) => (${programObject(body)}))`,
		imports: ['import styled from "vue-styled-components";'],
		residuals: [...program.residuals],
	};
}

function supportsStaticOrFunctionProgram(program: StyleProgram): boolean {
	if (isStaticProgram(program)) return true;
	const declarations = StyleProgramAnalysis.declarations(program);
	const dynamic = declarations.flatMap((declaration) =>
		declaration.value.kind === "dynamic" ? [declaration] : [],
	);
	if (dynamic.length === 0) return false;
	const functions = dynamic.map((declaration) =>
		declaration.value.kind === "dynamic"
			? functionExpression(declaration.value.expression)
			: undefined,
	);
	return (
		functions.every((value) => value !== undefined) &&
		new Set(functions.map((value) => value!.parameter)).size === 1
	);
}

const vueStyled = makeExtraAdapter({
	id: CodemodAdapterId.VueStyled,
	modules: ["vue-styled-components"],
	packages: { packages: [{ name: "vue-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["'](?:vue-styled-components|@vue-styled-components\/core)["']/g,
		/\bstyled\.[A-Za-z_$][\w$]*[^`]*`/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))\s*\(\s*\{/g,
	],
	call: /\bstyled\.[A-Za-z_$][\w$]*[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
	targetImports: ['import styled from "vue-styled-components";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
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
			supportsStaticOrFunctionProgram(program) &&
			(framework === undefined ||
				framework === BuiltinHostFramework.Vue ||
				framework === BuiltinHostFramework.React)
				? StyleHostRepresentationKind.Component
				: undefined,
	},
	targetEmit: functionStyleEmission,
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});

export default vueStyled;
