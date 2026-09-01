import { makeExtraAdapter } from "./extra-adapter-runtime.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import type { StyleProgram } from "../semantic-ir.ts";

function isStaticProgram(program: StyleProgram): boolean {
	return program.rules.every(
		(rule) =>
			rule.declarations.every((declaration) => declaration.value.kind !== "dynamic") &&
			rule.children.every((child) => isStaticProgram({ ...program, rules: [child] })),
	);
}

const solidStyled = makeExtraAdapter({
	id: CodemodAdapterId.SolidStyled,
	modules: ["solid-styled-components"],
	packages: { packages: [{ name: "solid-styled-components", kind: "runtime" }] },
	detect: [
		/from\s+["']solid-styled-components["']/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`/g,
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))\s*\(\s*\{/g,
	],
	call: /\bstyled(?:\.[A-Za-z_$][\w$]*|\([^)]*\))[^`]*`(?:\\.|[^`])*`/g,
	form: "template",
	prefix: "styled.div(",
	targetImports: ['import { styled } from "solid-styled-components";'],
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	capabilityOverrides: {
		components: "exact",
		"framework-semantics": "exact",
	},
	targetPolicy: {
		handlesHostRewrites: true,
		handlesFrameworkSemantics: true,
		hostFrameworks: [BuiltinHostFramework.Solid],
		hostFrameworkConversions: [
			{ from: BuiltinHostFramework.React, to: BuiltinHostFramework.Solid },
		],
		hostRepresentation: StyleHostRepresentationKind.Component,
		standaloneHostRepresentation: StyleHostRepresentationKind.Component,
		resolveHostRepresentation: ({ framework, program }) =>
			isStaticProgram(program) &&
			(framework === undefined ||
				framework === BuiltinHostFramework.Solid ||
				framework === BuiltinHostFramework.React)
				? StyleHostRepresentationKind.Component
				: undefined,
	},
	functionCall:
		/\bstyled(?:\.[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^>]*>)?(?:\.props\s*\([^)]*\))?\s*\(/g,
});

export default solidStyled;
