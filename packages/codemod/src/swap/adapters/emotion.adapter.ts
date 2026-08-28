import { allRuleCapabilities, defineCodemodAdapter } from "../external-adapters.ts";
import { CodemodAdapterId } from "../identifiers.ts";

export default defineCodemodAdapter({
	id: CodemodAdapterId.Emotion,
	patterns: [
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "css-template", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
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
		{ name: "keyframes", kind: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "global", kind: "global", regex: /\b(?:injectGlobal|global)\s*\(\s*\{/g },
	],
	packages: {
		packages: [
			{ name: "@emotion/css", kind: "runtime" },
			{ name: "@emotion/styled", kind: "peer" },
		],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Emotion, "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@emotion\/(?:css|react|styled)/, /\bcss\s*\(\s*\{/, /\bcss\s*`/],
	sourceModules: ["@emotion/css", "@emotion/react", "@emotion/styled"],
	configFiles: [".emotionrc", "emotion.config.js", "package.json"],
	emit(program, { firstKind, programObject }) {
		const kind = firstKind(program);
		if (kind === "keyframes")
			return {
				text: `keyframes(${programObject(program)})`,
				imports: ['import { keyframes } from "@emotion/css";'],
			};
		if (kind === "global")
			return {
				text: `injectGlobal(${programObject(program)})`,
				imports: ['import { injectGlobal } from "@emotion/css";'],
			};
		if (program.source?.subject !== undefined)
			return {
				text: `${program.source.subject}(${programObject(program)})`,
				imports: ['import styled from "@emotion/styled";'],
			};
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@emotion/css";'],
		};
	},
});
