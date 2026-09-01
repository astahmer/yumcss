import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";
import type { StyleProgram } from "../semantic-ir.ts";

function hasDynamicValues(program: StyleProgram): boolean {
	return program.rules.some(function containsDynamic(rule): boolean {
		return (
			rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
			rule.children.some(containsDynamic)
		);
	});
}

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
	packages: CodemodAdapterKit.dependency("next-yak", "peer"),
	capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.NextYak, "partial", {
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
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			standaloneHostRepresentation: StyleHostRepresentationKind.Component,
			resolveHostRepresentation: ({ program, hasHostContext }) =>
				program.source?.subject !== undefined && hasHostContext && hasDynamicValues(program)
					? StyleHostRepresentationKind.Component
					: StyleHostRepresentationKind.Class,
			resolveRepresentation: ({ program, hasHostContext }) =>
				program.source?.subject !== undefined && hasDynamicValues(program)
					? StyleRepresentationKind.TargetNative
					: !hasHostContext && program.source?.subject === undefined && hasDynamicValues(program)
						? StyleRepresentationKind.RuntimeCarrier
						: undefined,
			capabilitiesForRepresentation: ({ program, representation }) =>
				[StyleRepresentationKind.RuntimeCarrier, StyleRepresentationKind.TargetNative].includes(
					representation,
				) && hasDynamicValues(program)
					? ["dynamic-values", "theme-context", "runtime-context"]
					: [],
			preservesResidualKindsForRepresentation: ({ program, representation }) =>
				[StyleRepresentationKind.RuntimeCarrier, StyleRepresentationKind.TargetNative].includes(
					representation,
				) && hasDynamicValues(program)
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
