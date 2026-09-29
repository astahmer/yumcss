import { CodemodCallPatternFormTag } from "../identifiers.ts";
import {
	getHostComponentRewriter,
	preflightHostComponentDeclaration,
} from "../host-component-rewriter.ts";
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
		{
			name: "linaria-css",
			regex: /\bcss\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
		{
			name: "linaria-styled",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`(?:\\.|[^`])*`/g,
			form: CodemodCallPatternFormTag.Template,
		},
	],
	packages: {
		packages: [
			CodemodAdapterKit.dependency("@linaria/core", "peer").packages[0]!,
			CodemodAdapterKit.dependency("@linaria/react", "peer").packages[0]!,
		],
	},
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Linaria, "unsupported", {
		keyframes: "unsupported",
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
			rewriteComponent: (context) => {
				if (context.representation === StyleHostRepresentationKind.Component)
					return { code: context.code, residuals: [] };
				const rewriteDeclaration = getHostComponentRewriter(context.framework)?.rewriteDeclaration;
				if (rewriteDeclaration === undefined)
					return {
						code: context.code,
						residuals: [
							{
								kind: "host-framework",
								text: context.binding,
								hint: "Linaria class projection requires a reusable wrapper for the source component contract",
							},
						],
					};
				if (context.phase === "preflight") {
					const preview = preflightHostComponentDeclaration({
						file: context.file,
						binding: context.binding,
						tag: context.tag,
						framework: context.framework,
						...(context.attrsExpression === undefined
							? {}
							: { attrsExpression: context.attrsExpression }),
						...(context.program.source?.hostPropFilter?.prefixes === undefined
							? {}
							: { filteredPropPrefixes: context.program.source.hostPropFilter.prefixes }),
					});
					return { code: context.code, residuals: preview.residuals };
				}
				const rewritten = rewriteDeclaration({
					source: context.code,
					file: context.file,
					binding: context.binding,
					tag: context.tag,
					framework: context.framework,
					classExpression: context.emittedExpression,
					...(context.attrsExpression === undefined
						? {}
						: { attrsExpression: context.attrsExpression }),
					...(context.program.source?.hostPropFilter?.prefixes === undefined
						? {}
						: { filteredPropPrefixes: context.program.source.hostPropFilter.prefixes }),
				});
				return {
					code: rewritten.code,
					...(rewritten.imports === undefined ? {} : { imports: rewritten.imports }),
					residuals: rewritten.residuals,
				};
			},
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
