import { adapter, allRuleCapabilities, dependency, templateCss } from "../external-adapters.ts";

export const LINARIA = adapter(
	"linaria",
	[
		{ name: "linaria-css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "linaria-styled",
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
	],
	{
		packages: [
			dependency("@linaria/core", "peer").packages[0]!,
			dependency("@linaria/react", "peer").packages[0]!,
		],
	},
	allRuleCapabilities("linaria", "unsupported", {
		"dynamic-values": "partial",
		components: "exact",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
	}),
	(program) => {
		const component = program.source?.subject;
		const text = templateCss(program);
		return component !== undefined
			? { text: `${component}\`${text}\``, imports: ['import { styled } from "@linaria/react";'] }
			: { text: `css\`${text}\``, imports: ['import { css } from "@linaria/core";'] };
	},
	[/@linaria\/(?:core|react)/, /\b(?:css|styled)\s*`/],
	["@linaria/core", "@linaria/react"],
);
