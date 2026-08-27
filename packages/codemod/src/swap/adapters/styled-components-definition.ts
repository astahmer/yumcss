import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const STYLED_COMPONENTS_DEFINITION: AdapterDefinition = {
	id: "styled-components",
	patterns: [
		{ name: "styled", regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g },
		{
			name: "styled-template",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{ name: "createGlobalStyle", regex: /\bcreateGlobalStyle\s*\(\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	packages: dependency("styled-components", "peer"),
	capabilities: allRuleCapabilities("styled-components", "exact", {
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
};
