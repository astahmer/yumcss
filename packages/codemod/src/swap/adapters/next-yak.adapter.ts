import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

/** Next-yak's extracted css and styled template dialects share one adapter. */
export default defineCodemodAdapter({
	id: CodemodAdapterId.NextYak,
	patterns: [
		{
			name: "jsx-css",
			regex: /<[A-Za-z_$][\w$.-]*\b/g,
			form: "jsx-style",
			styleProps: ["css"],
		},
		{ name: "css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "styled",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
	],
	packages: dependency("next-yak", "peer"),
	capabilities: allRuleCapabilities(CodemodAdapterId.NextYak, "partial", {
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
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [/\bfrom\s+["']next-yak["']/, /\b(?:css|styled)\s*`/],
	sourceModules: ["next-yak"],
	configFiles: ["package.json"],
	migration: {
		prepareDynamic: ({ program }) => ({
			handled:
				program.source?.hostOpenTag !== undefined &&
				program.source.hostStyleAttributes !== undefined,
		}),
	},
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
