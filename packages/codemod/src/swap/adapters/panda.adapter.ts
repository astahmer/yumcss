import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleProgramResidualKindTag, StyleValueKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterProjectConfig,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { TokenCatalog } from "../tokens.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import type { PandaTheme } from "./panda/theme.ts";
import {
	preserveUnsupportedRecipeFields,
	recipeSourceObjectOptions,
} from "./recipe-source.ts";

const pandaJsxStyleProps = (context: import("../adapter-contract.ts").AdapterParseContext) =>
	(context.config.values.pandaTheme as PandaTheme | undefined)?.jsxStyleProps.matches ??
	(() => false);

function pandaFactoryHostTag(program: StyleProgram): StyleProgram {
	const source = program.source;
	const openingTag = source?.hostOpenTag;
	if (source === undefined || openingTag === undefined || source.hostTag !== undefined)
		return program;
	const tag = /^<\s*[A-Za-z_$][\w$]*\.([a-z][\w-]*)\b/u.exec(openingTag)?.[1];
	return tag === undefined ? program : { ...program, source: { ...source, hostTag: tag } };
}

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

function pandaSourceValue(
	value: StyleValue,
	property: string,
	context: import("../adapter-contract.ts").AdapterParseContext,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return value;
	const group = pandaTokenGroup(property);
	const theme = context.config.values.pandaTheme as PandaTheme | undefined;
	const token =
		group === undefined
			? undefined
			: TokenCatalog.fromContract(theme?.tokenCatalog)?.findByReference([group], value.value);
	if (token === undefined) return value;
	return {
		kind: "token",
		ref: token.ref,
		authored: value.value,
		resolved: token.resolved,
	};
}

function pandaConfig(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Panda,
		root: context.root,
		files: [context.file],
		values: {},
	};
}

export interface PandaAdapterOptions {
	readonly moduleLoader?: ProjectModuleLoader | null;
}

function createPandaConfigLoader(options: PandaAdapterOptions): ProjectModuleLoader | undefined {
	return options.moduleLoader === null ? undefined : options.moduleLoader;
}

async function officialPandaConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = pandaConfig(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	// The official Panda loader is Node-only. Keep it behind the project-aware
	// async path so the browser catalog can still ship the same adapter without
	// pulling Panda's filesystem/config implementation into the client bundle.
	// Self-package subpath so the specifier resolves identically from src
	// (nub/tests) and dist (browser playground bundle): a relative dynamic
	// import would break because dist emits .js next to a different folder
	// depth than the source tree.
	const { loadPandaTheme } = await import("pandwind-codemod/swap/official/panda");
	const discovered = context
		.listFiles?.(context.root)
		.filter((candidate) => /(?:^|[\\/])panda\.config\.(?:ts|tsx|js|mjs|cjs)$/u.test(candidate));
	const candidates = [
		"panda.config.ts",
		"panda.config.tsx",
		"panda.config.js",
		"panda.config.mjs",
		"panda.config.cjs",
		...(discovered ?? []),
	];
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		if (context.readFile(path) === undefined) continue;
		try {
			const theme = await loadPandaTheme(path, loader, context.readFile);
			return {
				...fallback,
				files: [...fallback.files, path],
				tokenCatalog: theme.tokenCatalog,
				...(theme.officialConfigError === undefined
					? {}
					: {
							residuals: [
								{
									kind: StyleProgramResidualKindTag.Configuration,
									text: "Panda project configuration",
									hint: theme.officialConfigError,
								},
							],
						}),
				values: {
					pandaTheme: theme,
					...(theme.plugins === undefined ? {} : { plugins: theme.plugins }),
					officialConfigPackage: "@pandacss/config",
				},
			};
		} catch (error) {
			return {
				...fallback,
				residuals: [
					{
						kind: StyleProgramResidualKindTag.Configuration,
						text: "Panda project configuration",
						hint: `official Panda config loading failed: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}
	return fallback;
}

export function createPandaAdapter(options: PandaAdapterOptions = {}) {
	const moduleLoader = createPandaConfigLoader(options);
	return defineCodemodAdapter({
		id: CodemodAdapterId.Panda,
		officialApi: {
			pluginSystems: ["presets", "plugins", "patterns", "recipes", "slot-recipes"],
			compilerIntegrations: ["@pandacss/config", "@pandacss/dev"],
		},
		patterns: [
			{ name: "css", regex: /\bcss\s*\(\s*\{/g },
			{
				name: "jsx-style-props",
				regex: /<\s*styled\.[A-Za-z_$][\w$]*\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps: pandaJsxStyleProps,
				semanticBindings: [{ source: "styled-system/jsx", imported: "styled" }],
				regexForBinding: (binding) =>
					new RegExp(
						`<\\s*${binding.localName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\.[A-Za-z_$][\\w$]*\\b`,
						"g",
					),
				transform: pandaFactoryHostTag,
			},
			{
				name: "cva",
				regex: /\bcva\s*\(\s*\{/g,
				sourceObjectOptions: recipeSourceObjectOptions,
				transform: preserveUnsupportedRecipeFields,
			},
			{
				name: "sva",
				regex: /\bsva\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.Composition,
					hint: "Panda sva slot recipes require slot-aware target lowering",
				},
			},
			{
				name: "generated-styled",
				regex: /\bstyled\.[A-Za-z_$][\w$]*\s*\(/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: "component",
					hint: "Panda generated styled components require host/component lowering",
				},
			},
		],
		packages: {
			packages: [CodemodAdapterKit.dependency("@pandacss/dev", "development").packages[0]!],
			files: ["panda.config.ts", "panda.config.js", "styled-system"],
		},
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Panda, "partial", {
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
		sourceModuleMatchers: [
			(moduleSpecifier) => /(?:^|[\\/])styled-system\/(?:css|jsx|recipes)$/u.test(moduleSpecifier),
		],
		configFiles: ["panda.config.ts", "panda.config.js", "panda.config.mjs"],
		loadConfig: pandaConfig,
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialPandaConfig(context, moduleLoader),
				}),
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
		sourceObjectOptions: (_source, context) => ({
			propertyAliases: Object.fromEntries(
				(
					(context.config.values.pandaTheme as PandaTheme | undefined)?.utilityCatalog
						.propertyAliases ?? new Map()
				).entries(),
			),
			valueTransforms: {
				"*": (value, property) => pandaSourceValue(value, property ?? "", context),
			},
		}),
		emit(program, renderers) {
			return {
				text: `css(${renderers.programObject(program)})`,
				imports: ['import { css } from "styled-system/css";'],
				semantic: program,
			};
		},
	});
}
