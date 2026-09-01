import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterProjectConfig,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { TokenCatalog } from "../tokens.ts";
import { NODE_PROJECT_MODULE_LOADER } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { loadPandaTheme } from "./panda/index.ts";

/**
 * Panda's generated `styled-system/css` object dialect is a normal pivot
 * endpoint. The project-level `panda/` pipeline owns recipes and generated
 * component factories; this adapter owns the source/target expression used by
 * ordinary `css({...})` call sites.
 */

const pandaTokenGroup = (property: string): string | undefined => {
	if (property === "color" || property.endsWith("Color")) return "colors";
	if (property === "borderRadius") return "radii";
	if (property === "fontSize") return "fontSizes";
	if (property === "fontWeight") return "fontWeights";
	if (property === "lineHeight") return "lineHeights";
	if (property === "letterSpacing") return "letterSpacings";
	if (property === "fontFamily") return "fonts";
	if (property === "boxShadow") return "shadows";
	if (/^(?:padding|margin|gap|inset)/u.test(property)) return "spacing";
	if (/^(?:width|height|minWidth|maxWidth|minHeight|maxHeight)$/u.test(property)) return "sizes";
	return undefined;
};

const PANDA_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: "pandwind.adapter-token-policy/1",
	preserve: (program, context) =>
		TokenCatalog.fromContract(context.config.tokenCatalog)?.preserveProgram(
			program,
			pandaTokenGroup,
			(match) => match.ref,
		) ?? program,
};

function pandaConfig(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Panda,
		root: context.root,
		files: [context.file],
		values: {},
	};
}

async function officialPandaConfig(context: AdapterConfigContext): Promise<AdapterProjectConfig> {
	const fallback = pandaConfig(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	for (const candidate of ["panda.config.ts", "panda.config.js", "panda.config.mjs"]) {
		const path = joinDocumentPath(context.root, candidate);
		if (context.readFile(path) === undefined) continue;
		try {
			const theme = await loadPandaTheme(path, NODE_PROJECT_MODULE_LOADER);
			return {
				...fallback,
				files: [...fallback.files, path],
				tokenCatalog: theme.tokenCatalog,
				values: {
					pandaTheme: theme,
					officialConfigPackage: "@pandacss/config",
				},
			};
		} catch (error) {
			return {
				...fallback,
				residuals: [
					{
						kind: "configuration",
						text: "Panda project configuration",
						hint: `official Panda config loading failed: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}
	return fallback;
}

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
	configFiles: ["panda.config.ts", "panda.config.js", "panda.config.mjs"],
	loadConfig: pandaConfig,
	loadConfigAsync: officialPandaConfig,
	migration: {
		targetPolicy: {
			handlesHostRewrites: true,
			handlesFrameworkSemantics: true,
			hostRepresentation: StyleHostRepresentationKind.Class,
			dynamicClassCarrier: true,
		},
	},
	namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
	tokenPolicy: PANDA_TOKEN_POLICY,
	emit(program, renderers) {
		return {
			text: `css(${renderers.programObject(program)})`,
			imports: ['import { css } from "styled-system/css";'],
			semantic: program,
		};
	},
});
