import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import {
	CodemodCallPatternKindTag,
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

export default defineCodemodAdapter({
	id: CodemodAdapterId.Linaria,
	officialApi: {
		apis: [
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "styled", status: AdapterOfficialApiStatusTag.Supported },
		],
		compilerIntegrations: ["@linaria/babel-preset", "@linaria/webpack-loader"],
	},
	patterns: [
		{ name: "linaria-css", regex: /\bcss\s*`(?:\\.|[^`])*`/g, form: "template" },
		{
			name: "linaria-styled",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: "template",
		},
	],
	packages: {
		packages: [
			CodemodAdapterKit.dependency("@linaria/core", "peer").packages[0]!,
			CodemodAdapterKit.dependency("@linaria/react", "peer").packages[0]!,
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Linaria, "unsupported", {
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
		targetPolicy: {
			handlesHostRewrites: true,
			dynamicClassCarrier: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
		},
	},
	emit(program, { templateCss }, context) {
		const text = templateCss(program);
		return program.source?.subject !== undefined &&
			context?.host?.representation !== StyleHostRepresentationKind.Class
			? {
					text: `${program.source.subject}\`${text}\``,
					imports: ['import { styled } from "@linaria/react";'],
				}
			: { text: `css\`${text}\``, imports: ['import { css } from "@linaria/core";'] };
	},
});
