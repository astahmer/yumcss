import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import { CodemodAdapterId, StyleNamedRuleStrategy } from "../identifiers.ts";

export default defineCodemodAdapter({
	id: CodemodAdapterId.Linaria,
	patterns: [
		{ name: "linaria-css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "linaria-styled",
			kind: "styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
	],
	packages: {
		packages: [
			dependency("@linaria/core", "peer").packages[0]!,
			dependency("@linaria/react", "peer").packages[0]!,
		],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Linaria, "unsupported", {
		"dynamic-values": "partial",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	detectPatterns: [/@linaria\/(?:core|react)/, /\b(?:css|styled)\s*`/],
	sourceModules: ["@linaria/core", "@linaria/react"],
	configFiles: ["linaria.config.js", "package.json"],
	migration: {
		targetPolicy: { handlesHostRewrites: true, handlesFrameworkSemantics: true },
	},
	emit(program, { templateCss }) {
		const text = templateCss(program);
		return program.source?.subject !== undefined
			? {
					text: `${program.source.subject}\`${text}\``,
					imports: ['import { styled } from "@linaria/react";'],
				}
			: { text: `css\`${text}\``, imports: ['import { css } from "@linaria/core";'] };
	},
});
