import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

export default defineCodemodAdapter({
	id: CodemodAdapterId.StyledComponents,
	patterns: [
		{
			name: "styled",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g,
		},
		{
			name: "styled-template",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{
			name: "createGlobalStyle-template",
			kind: "global",
			regex: /\bcreateGlobalStyle\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{
			name: "keyframes-template",
			kind: "keyframes",
			regex: /\bkeyframes\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{ name: "createGlobalStyle", kind: "global", regex: /\bcreateGlobalStyle\s*\(\s*\{/g },
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	packages: dependency("styled-components", "peer"),
	capabilities: allRuleCapabilities(CodemodAdapterId.StyledComponents, "exact", {
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
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
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
