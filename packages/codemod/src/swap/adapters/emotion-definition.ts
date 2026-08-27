import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const EMOTION_DEFINITION: AdapterDefinition = {
	id: "emotion",
	patterns: [
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{ name: "css-template", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{ name: "keyframes", regex: /\bkeyframes\s*\(\s*\{/g },
		{ name: "global", regex: /\b(?:injectGlobal|global)\s*\(\s*\{/g },
	],
	packages: dependency("@emotion/css", "runtime"),
	capabilities: allRuleCapabilities("emotion", "exact", {
		"theme-context": "exact",
		"runtime-context": "exact",
		composition: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@emotion\/(?:css|react|styled)/, /\bcss\s*\(\s*\{/, /\bcss\s*`/],
	sourceModules: ["@emotion/css", "@emotion/react"],
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
		return {
			text: `css(${programObject(program)})`,
			imports: ['import { css } from "@emotion/css";'],
		};
	},
};
