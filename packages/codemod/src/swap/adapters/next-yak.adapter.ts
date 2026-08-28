import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";

/** Next-yak's extracted css and styled template dialects share one adapter. */
export default defineCodemodAdapter({
	id: "next-yak",
	patterns: [
		{ name: "css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "styled",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
	],
	packages: dependency("next-yak", "peer"),
	capabilities: allRuleCapabilities("next-yak", "partial", {
		"theme-context": "partial",
		"runtime-context": "partial",
		composition: "partial",
		"plugin-transforms": "exact",
		"framework-semantics": "exact",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "partial",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/\bfrom\s+["']next-yak["']/, /\b(?:css|styled)\s*`/],
	sourceModules: ["next-yak"],
	configFiles: ["package.json"],
	emit(program, { templateCss }) {
		const text = templateCss(program);
		return program.source?.subject !== undefined
			? {
					text: `${program.source.subject}\`${text}\``,
					imports: ['import { styled } from "next-yak";'],
				}
			: { text: `css\`${text}\``, imports: ['import { css } from "next-yak";'] };
	},
});
