import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type AdapterSourceObjectOptions,
} from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterProjectConfig,
	AdapterParseContext,
} from "../adapter-contract.ts";
import { AdapterDependencyKindTag } from "../adapter-contract.ts";
import type {
	StyleCondition,
	StyleDeclaration,
	StyleProgram,
	StyleProgramResidual,
	StyleValue,
} from "../semantic-ir.ts";
import { StyleProgramResidualKindTag, StyleValueKindTag } from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	CodemodPatternId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { createTokenPolicy, TokenCatalog } from "../tokens.ts";

function camelCase(property: string): string {
	return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function readAliases(
	context: AdapterConfigContext,
): Readonly<Record<string, string | readonly string[]>> {
	const aliases: Record<string, string | readonly string[]> = {};
	if (context.readFile === undefined || context.root === undefined) return aliases;
	const candidates = [
		".tokenami/tokenami.config.ts",
		".tokenami/tokenami.config.js",
		".tokenami/tokenami.config.cjs",
		"tokenami.config.ts",
		"tokenami.config.js",
		"tokenami.config.cjs",
	];
	for (const candidate of candidates) {
		const source = context.readFile(`${context.root}/${candidate}`);
		if (source === undefined) continue;
		const block = /\baliases\s*:\s*\{([\s\S]*?)\}/.exec(source)?.[1];
		if (block === undefined) continue;
		for (const entry of block.matchAll(
			/([A-Za-z_$][\w$]*)\s*:\s*(?:\[\s*)?((?:['"][^'"]+['"]\s*,?\s*)+)(?:\])?/g,
		)) {
			const name = entry[1];
			const values = entry[2]?.match(/['"]([^'"]+)['"]/g)?.map((value) => value.slice(1, -1)) ?? [];
			if (name !== undefined && values !== undefined && values.length > 0)
				aliases[name] = values.length === 1 ? values[0]! : values;
		}
		break;
	}
	return aliases;
}

function tokenamiConfig(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Tokenami,
		root: context.root,
		files: [context.file],
		values: { tokenamiAliases: readAliases(context) },
	};
}

interface TokenamiConfigShape {
	readonly aliases?: Readonly<Record<string, string | readonly string[]>>;
	readonly selectors?: Readonly<Record<string, string | readonly string[]>>;
	readonly responsive?: Readonly<Record<string, string>>;
	readonly tokens?: Readonly<Record<string, unknown>>;
}

function configModuleValue(value: unknown): TokenamiConfigShape | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const candidate = value as Record<string, unknown>;
	if (
		candidate.aliases === undefined &&
		candidate.selectors === undefined &&
		candidate.responsive === undefined &&
		candidate.tokens === undefined
	)
		return undefined;
	return candidate as TokenamiConfigShape;
}

function tokenamiTokenGroup(property: string): string | undefined {
	if (property === "color" || property.endsWith("Color")) return "colors";
	if (property === "borderRadius") return "radii";
	if (/^(?:padding|margin|gap|inset)/u.test(property)) return "spacing";
	if (/^(?:width|height|minWidth|maxWidth|minHeight|maxHeight)$/u.test(property)) return "sizes";
	if (property === "fontSize") return "fontSizes";
	if (property === "fontWeight") return "fontWeights";
	if (property === "lineHeight") return "lineHeights";
	if (property === "letterSpacing") return "letterSpacings";
	if (property === "fontFamily") return "fonts";
	if (property === "boxShadow") return "shadows";
	return undefined;
}

const TOKENAMI_TOKEN_POLICY = createTokenPolicy(
	tokenamiTokenGroup,
	(match) => `$${match.group}.${match.ref}`,
);

async function officialTokenamiConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = tokenamiConfig(context);
	if (context.root === undefined) return fallback;
	const configFiles =
		context
			.listFiles?.(context.root)
			.filter((candidate) =>
				/(?:^|[\\/])(?:\.tokenami[\\/])?tokenami\.config\.(?:ts|js|cjs|mjs)$/u.test(candidate),
			) ?? [];
	const packageModule = await loader.importPackage<
		Record<string, unknown> & {
			createConfig?: (config: TokenamiConfigShape) => unknown;
		}
	>("@tokenami/config", context.root);
	if (packageModule === undefined)
		return configFiles.length > 0
			? AdapterEvidence.configurationFailure(
					fallback,
					"Tokenami project configuration",
					"the official @tokenami/config package is unavailable for a discovered config",
				)
			: fallback;
	const discovered = context
		.listFiles?.(context.root)
		.filter((candidate) =>
			/(?:^|[\\/])(?:\.tokenami[\\/])?tokenami\.config\.(?:ts|js|cjs|mjs)$/u.test(candidate),
		);
	const candidates = [
		".tokenami/tokenami.config.ts",
		".tokenami/tokenami.config.js",
		".tokenami/tokenami.config.cjs",
		"tokenami.config.ts",
		"tokenami.config.js",
		"tokenami.config.cjs",
		"tokenami.config.mjs",
		...(discovered ?? []),
	];
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		// Preserve candidate priority: the first project config wins.
		const module = await loader.importFile<Record<string, unknown>>(path);
		if (module === undefined) continue;
		const rawValues = [module.default, ...Object.values(module)]
			.map(configModuleValue)
			.find((value): value is TokenamiConfigShape => value !== undefined);
		if (rawValues === undefined) continue;
		const values = packageModule.createConfig?.(rawValues) ?? rawValues;
		const normalized = configModuleValue(values) ?? rawValues;
		return {
			...fallback,
			files: [...fallback.files, path],
			tokenCatalog: TokenCatalog.fromNested(normalized.tokens)?.contract,
			values: {
				...fallback.values,
				tokenamiAliases: normalized.aliases ?? {},
				tokenamiConfig: normalized,
				officialConfigPackage: "@tokenami/config",
			},
		};
	}
	if (configFiles.length > 0) {
		return {
			...fallback,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Configuration,
					text: "Tokenami project configuration",
					hint: "Tokenami configuration was not found or could not be loaded",
				},
			],
		};
	}
	return fallback;
}

function condition(prefix: string): StyleCondition {
	const selector = /^\{([\s\S]+)\}$/.exec(prefix)?.[1];
	if (selector !== undefined)
		return { kind: "selector", name: selector, value: selector, raw: prefix };
	if (/^@media(?:\s|$)/.test(prefix)) return { kind: "media", name: prefix, value: prefix };
	if (/^@supports(?:\s|$)/.test(prefix)) return { kind: "supports", name: prefix, value: prefix };
	if (
		/^(?:hover|active|focus|focus-visible|focus-within|disabled|checked|before|after)$/.test(prefix)
	)
		return { kind: "pseudo", name: prefix };
	return { kind: "named", name: prefix };
}

function decodeProperty(
	property: string,
	aliases: Readonly<Record<string, string | readonly string[]>>,
): { property: string; conditions: readonly StyleCondition[] } {
	const encoded = property.startsWith("--") ? property.slice(2) : property;
	const parts = encoded.split("_").filter(Boolean);
	const alias = parts.pop() ?? encoded;
	const mapped = aliases[alias] ?? camelCase(alias);
	return {
		property: typeof mapped === "string" ? mapped : (mapped[0] ?? camelCase(alias)),
		conditions: parts.map(condition),
	};
}

function normalizeProgram(program: StyleProgram, context: AdapterParseContext): StyleProgram {
	const aliases = (context.config.values.tokenamiAliases ?? {}) as Readonly<
		Record<string, string | readonly string[]>
	>;
	const normalize = (declaration: StyleDeclaration): StyleDeclaration => {
		const decoded = decodeProperty(declaration.property, aliases);
		return {
			...declaration,
			property: decoded.property,
			conditions: [...decoded.conditions, ...declaration.conditions],
		};
	};
	const rules = program.rules.map((rule) => ({
		...rule,
		declarations: rule.declarations.map(normalize),
		children: rule.children.map((child) => ({
			...child,
			declarations: child.declarations.map(normalize),
		})),
	}));
	const residuals: StyleProgramResidual[] = [...program.residuals];
	for (const composition of program.compositions ?? [])
		residuals.push({
			kind: StyleProgramResidualKindTag.Composition,
			text: composition.reference,
			hint: "Tokenami includes require target-side composition lowering",
		});
	return {
		...program,
		rules,
		declarations: program.declarations.map(normalize),
		residuals,
	};
}

const sourceOptions: AdapterSourceObjectOptions = {
	variantContainerKeys: ["variants"],
	compositionArrayKeys: ["includes"],
};

function tokenamiSourceValue(
	value: StyleValue,
	property: string,
	context: AdapterParseContext,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return value;
	if (!value.value.startsWith("$")) return value;
	const group = tokenamiTokenGroup(property);
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	if (group === undefined || catalog === undefined) return value;
	const reference = value.value
		.slice(1)
		.replace(new RegExp(`^${group}\\.`), "")
		.replaceAll("-", ".");
	const match = catalog.findByReference([group], reference);
	return match === undefined
		? value
		: {
				kind: StyleValueKindTag.Token,
				ref: match.ref,
				authored: value.value,
				resolved: match.resolved,
			};
}

const tokenamiSourceOptions = (_source: string, context: AdapterParseContext) => ({
	...sourceOptions,
	valueTransforms: {
		"*": (value: StyleValue, property?: string) =>
			tokenamiSourceValue(value, property ?? "", context),
	},
});

/** Semantic Tokenami source adapter. It owns Tokenami's encoded property keys and aliases. */
export function createTokenamiAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	return defineCodemodAdapter({
		id: CodemodAdapterId.Tokenami,
		officialApi: {
			pluginSystems: ["aliases", "conditions", "themes", "composition", "variants"],
			compilerIntegrations: ["@tokenami/config"],
		},
		packages: {
			packages: [
				{ name: "@tokenami/css", kind: AdapterDependencyKindTag.Runtime },
				{ name: "@tokenami/config", kind: AdapterDependencyKindTag.Peer },
			],
		},
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Tokenami, "partial", {
			"token-values": "exact",
			"custom-properties": "exact",
			"named-conditions": "partial",
			"pseudo-conditions": "exact",
			"selector-conditions": "exact",
			composition: "partial",
			"theme-context": "partial",
			"runtime-context": "exact",
			"framework-semantics": "exact",
			"global-rules": "unsupported",
			keyframes: "unsupported",
			layers: "unsupported",
			"supports-rules": "unsupported",
		}),
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		detectPatterns: [
			/@tokenami\/(?:css|config)/,
			/\bcss\.compose\s*\(/,
			/['"]--(?:[A-Za-z_$][\w$-]*)(?:_[^'"]+)?['"]\s*:/,
		],
		sourceModules: ["@tokenami/css", "@tokenami/config"],
		configFiles: [".tokenami/tokenami.config.ts", ".tokenami/tokenami.config.js", "package.json"],
		loadConfig: tokenamiConfig,
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialTokenamiConfig(context, moduleLoader),
				}),
		sourceObjectOptions: tokenamiSourceOptions,
		tokenPolicy: TOKENAMI_TOKEN_POLICY,
		patterns: [
			{ name: "css", regex: /\bcss\s*\(\s*\{/g, transform: normalizeProgram },
			{
				name: CodemodPatternId.TokenamiCompose,
				regex: /\bcss\.compose\s*\(\s*\{/g,
				transform: normalizeProgram,
			},
		],
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostRepresentation: StyleHostRepresentationKind.Class,
				dynamicClassCarrier: true,
			},
		},
		emit(program, { programObject }) {
			return {
				text: `css(${programObject(program)})`,
				imports: ['import { css } from "@tokenami/css";'],
				semantic: program,
			};
		},
	});
}
