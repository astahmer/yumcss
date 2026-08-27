import { allRuleCapabilities, dependency, type AdapterDefinition } from "./definition.ts";

export const LINARIA_DEFINITION: AdapterDefinition = {
	id: "linaria",
	patterns: [
		{ name: "linaria-css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "linaria-styled",
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
	capabilities: allRuleCapabilities("linaria", "unsupported", {
		"dynamic-values": "partial",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	detectPatterns: [/@linaria\/(?:core|react)/, /\b(?:css|styled)\s*`/],
	sourceModules: ["@linaria/core", "@linaria/react"],
	emit(program, { templateCss }) {
		const text = templateCss(program);
		return program.source?.subject !== undefined
			? {
					text: `${program.source.subject}\`${text}\``,
					imports: ['import { styled } from "@linaria/react";'],
				}
			: { text: `css\`${text}\``, imports: ['import { css } from "@linaria/core";'] };
	},
};
