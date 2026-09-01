import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";

/**
 * Panda's generated `styled-system/css` object dialect is a normal pivot
 * endpoint. The project-level `panda/` pipeline owns recipes and generated
 * component factories; this adapter owns the source/target expression used by
 * ordinary `css({...})` call sites.
 */

export default defineCodemodAdapter({
	id: CodemodAdapterId.Panda,
	patterns: [
		{ name: "css", regex: /\bcss\s*\(\s*\{/g },
		{
			name: "cva",
			regex: /\bcva\s*\(\s*\{/g,
			form: "residual",
			residual: {
				kind: "composition",
				hint: "Panda cva recipes require variant-aware target lowering",
			},
		},
		{
			name: "sva",
			regex: /\bsva\s*\(\s*\{/g,
			form: "residual",
			residual: {
				kind: "composition",
				hint: "Panda sva slot recipes require slot-aware target lowering",
			},
		},
		{
			name: "generated-styled",
			regex: /\bstyled\.[A-Za-z_$][\w$]*\s*\(/g,
			form: "residual",
			residual: {
				kind: "component",
				hint: "Panda generated styled components require host/component lowering",
			},
		},
	],
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
		/from\s+["'](?:@pandacss\/dev|styled-system\/(?:css|jsx|recipes))["']/,
		/\b(?:cva|sva|css)\s*\(\s*\{/,
	],
	sourceModules: [
		"@pandacss/dev",
		"styled-system/css",
		"styled-system/jsx",
		"styled-system/recipes",
	],
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			dynamicClassCarrier: true,
		},
	},
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	emit(program, renderers) {
		return {
			text: `css(${renderers.programObject(program)})`,
			imports: ['import { css } from "styled-system/css";'],
			semantic: program,
		};
	},
});
