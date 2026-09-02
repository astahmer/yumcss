import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { StyleRuleKindTag } from "../semantic-ir.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

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
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*\{/g,
		},
		{
			name: "styled-function",
			kind: "styled",
			regex:
				/\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
			functionCall: {
				functionCall:
					/\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
				subjectFromMatch: (match) =>
					match
						.match(/^styled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/)?.[0]
						?.replace(/\s+/g, " ")
						.replace(/\.\s+/g, "."),
			},
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
		{
			name: "runtime-context",
			regex:
				/(?:import[^;\n]*\b(?:ThemeProvider|StyleSheetManager|ServerStyleSheet)\b[^;\n]*;|<(?:ThemeProvider|StyleSheetManager|ServerStyleSheet)\b[^>]*>)/g,
			form: "residual",
			residual: {
				kind: "runtime-context",
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
	emit(program, { firstKind, programObject }) {
		const kind = firstKind(program);
		if (kind === StyleRuleKindTag.Keyframes)
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "styled-components";'],
			};
		if (kind === StyleRuleKindTag.Global)
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
