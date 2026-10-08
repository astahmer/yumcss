import { CodemodCallPatternFormTag } from "../identifiers.ts";
import {
	getHostComponentRewriter,
	preflightHostComponentDeclaration,
} from "../host-component-rewriter.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodCallPatternKindTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";

/** Next-yak's extracted css and styled template dialects share one adapter. */
export default defineCodemodAdapter({
	id: CodemodAdapterId.NextYak,
	officialApi: {
		apis: [
			{ name: "css", status: AdapterOfficialApiStatusTag.Supported },
			{ name: "styled", status: AdapterOfficialApiStatusTag.Supported },
		],
		compilerIntegrations: ["next-yak/swc", "next-yak/vite"],
	},
	patterns: [
		{
			name: "jsx-css",
			regex: /<[A-Za-z_$][\w$.-]*\b/g,
			form: CodemodCallPatternFormTag.JsxStyle,
			styleProps: ["css"],
		},
		{ name: "css", regex: /\bcss\s*`/g, form: CodemodCallPatternFormTag.Template },
		{
			name: "styled",
			kind: CodemodCallPatternKindTag.Styled,
			regex: /\bstyled\s*(?:\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))(?:<[^`]*>)?\s*`/g,
			form: CodemodCallPatternFormTag.Template,
			functionValues: true,
		},
	],
	packages: CodemodAdapterKit.dependency("next-yak", "peer"),
	hostPropFilter: { prefixes: ["$"] },
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.NextYak, "partial", {
		keyframes: "unsupported",
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
	sourceModulesSideEffectFree: ["next-yak"],
	configFiles: ["package.json"],
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
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
								hint: "Next-yak class projection requires a reusable wrapper for the source component contract",
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
			resolveHostRepresentation: ({ program, hasHostContext }) =>
				program.source?.subject !== undefined &&
				hasHostContext &&
				StyleProgramAnalysis.hasDynamic(program)
					? StyleHostRepresentationKind.Component
					: StyleHostRepresentationKind.Class,
			resolveRepresentation: ({ program, hasHostContext }) =>
				program.source?.subject !== undefined && StyleProgramAnalysis.hasDynamic(program)
					? StyleRepresentationKind.TargetNative
					: !hasHostContext &&
						  program.source?.subject === undefined &&
						  StyleProgramAnalysis.hasDynamic(program)
						? StyleRepresentationKind.RuntimeCarrier
						: undefined,
			capabilitiesForRepresentation: ({ program, representation }) =>
				[StyleRepresentationKind.RuntimeCarrier, StyleRepresentationKind.TargetNative].includes(
					representation,
				) && StyleProgramAnalysis.hasDynamic(program)
					? ["dynamic-values", "theme-context", "runtime-context"]
					: [],
			preservesResidualKindsForRepresentation: ({ program, representation }) =>
				[StyleRepresentationKind.RuntimeCarrier, StyleRepresentationKind.TargetNative].includes(
					representation,
				) && StyleProgramAnalysis.hasDynamic(program)
					? ["dynamic"]
					: [],
		},
		prepareDynamic: ({ program }) => ({
			handled:
				program.source?.hostOpenTag !== undefined &&
				program.source.hostStyleAttributes !== undefined,
		}),
	},
	emit(program, { templateCss }, context) {
		const text = templateCss(program);
		return program.source?.subject !== undefined &&
			context?.host?.representation !== StyleHostRepresentationKind.Class
			? {
					text: `${program.source.subject}\`${text}\``,
					imports: ['import { styled } from "next-yak";'],
				}
			: { text: `css\`${text}\``, imports: ['import { css } from "next-yak";'] };
	},
});
