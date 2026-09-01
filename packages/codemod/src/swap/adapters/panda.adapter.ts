import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type { AdapterEmitContext } from "../adapter-contract.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import type { StyleProgram } from "../semantic-ir.ts";

/**
 * Panda's generated `styled-system/css` object dialect is a normal pivot
 * endpoint. The project-level `panda/` pipeline owns recipes and generated
 * component factories; this adapter owns the source/target expression used by
 * ordinary `css({...})` call sites.
 */

function renderedCss(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
	object: string,
) {
	const expression = `css(${object})`;
	const host = context?.host;
	if (host?.subject === undefined && program.source?.hostOpenTag !== undefined) {
		const attribute = /\b(?:className|class)\s*=\s*(?:"[^"]*"|'[^']*'|\{[^{}]*\})/u;
		const openingTag = program.source.hostOpenTag;
		const replaced = attribute.test(openingTag)
			? openingTag.replace(attribute, `className={${expression}}`)
			: openingTag.replace(/\s*\/?>$/u, ` className={${expression}}$&`);
		return { text: replaced, imports: ['import { css } from "styled-system/css";'] };
	}
	return { text: expression, imports: ['import { css } from "styled-system/css";'] };
}

export default defineCodemodAdapter({
	id: CodemodAdapterId.Panda,
	patterns: [{ name: "css", regex: /\bcss\s*\(\s*\{/g }],
	packages: {
		packages: [dependency("@pandacss/dev", "development").packages[0]!],
		files: ["panda.config.ts", "panda.config.js", "styled-system"],
	},
	capabilities: allRuleCapabilities(CodemodAdapterId.Panda, "partial", {
		// This endpoint is the generated Panda object dialect. It can express
		// declarations and nested conditions, but it is not a general stylesheet
		// rule API. Keep unsupported rule kinds explicit so the IR residual remains
		// actionable instead of claiming a false exact conversion.
		"rule-level": "partial",
		"custom-properties": "exact",
		"global-rules": "unsupported",
		keyframes: "unsupported",
		"font-face": "unsupported",
		layers: "unsupported",
		"supports-rules": "unsupported",
		"property-rules": "unsupported",
		selectors: "partial",
		nesting: "partial",
		ordering: "unsupported",
		"theme-context": "partial",
		"runtime-context": "unsupported",
		composition: "partial",
		recipes: "partial",
		"plugin-transforms": "partial",
		"framework-semantics": "exact",
		components: "partial",
	}),
	detectPatterns: [
		/from\s+["'](?:@pandacss\/dev|styled-system\/css)["']/,
		/\b(?:cva|sva|css)\s*\(\s*\{/,
	],
	sourceModules: ["@pandacss/dev", "styled-system/css", "styled-system/recipes"],
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			dynamicClassCarrier: true,
		},
	},
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	emit(program, renderers, context) {
		return renderedCss(program, context, renderers.programObject(program));
	},
});
