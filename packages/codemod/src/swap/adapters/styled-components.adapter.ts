import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { CodemodAdapterId, StyleProgramEmissionHint } from "../identifiers.ts";
import type { StyleProgram } from "../semantic-ir.ts";

function markTemplateRoot(kind: "global" | "keyframes") {
	return (program: StyleProgram): StyleProgram => ({
		...program,
		rules: program.rules.map((rule, index) => (index === 0 ? { ...rule, kind } : rule)),
	});
}

function markTemplateComposable(program: StyleProgram): StyleProgram {
	return {
		...program,
		emissionHints: [...(program.emissionHints ?? []), StyleProgramEmissionHint.RawTemplate],
	};
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.StyledComponents,
	patterns: [
		{
			name: "css-template",
			kind: "style",
			regex: /\bcss(?:\s*<[^`]*>)?\s*`/g,
			form: "template",
			transform: markTemplateComposable,
		},
		{
			name: "styled",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\([^`]*\))(?:\s*<[^`]*>)?\s*\(\s*\{/g,
		},
		{
			name: "styled-template",
			kind: "styled",
			regex: /\bstyled(?=\s*(?:\.|\())/g,
			form: "template",
		},
		{
			name: "createGlobalStyle-template",
			kind: "global",
			regex: /\bcreateGlobalStyle\s*`(?:\\.|[^`])*`/g,
			form: "template",
			transform: markTemplateRoot("global"),
		},
		{
			name: "keyframes-template",
			kind: "keyframes",
			regex: /\bkeyframes\s*`(?:\\.|[^`])*`/g,
			form: "template",
			transform: markTemplateRoot("keyframes"),
		},
		{ name: "createGlobalStyle", kind: "global", regex: /\bcreateGlobalStyle\s*\(\s*\{/g },
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	packages: CodemodAdapterKit.dependency("styled-components", "peer"),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.StyledComponents, "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
		components: "exact",
	}),
	detectPatterns: [/styled-components/, /\bstyled\s*\./],
	sourceModules: ["styled-components"],
	configFiles: ["package.json"],
	emit(program, { firstKind, programObject }) {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "styled-components";'],
			};
		if (kind === "global")
			return {
				text: `createGlobalStyle(${programObject(program)})`,
				imports: ['import { createGlobalStyle } from "styled-components";'],
			};
		return {
			text: `${program.source?.subject ?? "styled.div"}(${programObject(program)})`,
			imports: ['import styled from "styled-components";'],
		};
	},
});
