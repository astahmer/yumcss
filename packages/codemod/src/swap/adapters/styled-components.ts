import {
	adapter,
	allRuleCapabilities,
	dependency,
	firstKind,
	programObject,
} from "../external-adapters.ts";

export const STYLED_COMPONENTS = adapter(
	"styled-components",
	[
		{ name: "styled", regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g },
		{
			name: "styled-template",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
		{ name: "createGlobalStyle", regex: /\bcreateGlobalStyle\s*\(\s*\{/g },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
	],
	dependency("styled-components", "peer"),
	allRuleCapabilities("styled-components", "exact", {
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
	(program) => {
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
	[/styled-components/, /\bstyled\s*\./],
	["styled-components"],
);
