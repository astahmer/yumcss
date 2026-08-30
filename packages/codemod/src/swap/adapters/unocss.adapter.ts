import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterConfigContext,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type StyleAdapter,
} from "../adapter-contract.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../capabilities.ts";
import {
	styleProgramFromRules,
	styleProgramToCanonicalCss,
	type StyleCondition,
	type StyleDeclaration,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
import { CodemodAdapterId } from "../identifiers.ts";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "../project-module-loader.ts";
import { isAbsolute, join } from "node:path";

export interface UnoCssTokenResolver {
	resolve(token: string, context: AdapterParseContext): readonly StyleDeclaration[] | undefined;
}

export interface UnoCssAdapterOptions {
	readonly resolver?: UnoCssTokenResolver;
	readonly moduleLoader?: ProjectModuleLoader;
}

const unescapeUnoCssSelector = (value: string): string =>
	value
		.replace(/\\([0-9a-f]{1,6})\\s?/gi, (_match, code: string) =>
			String.fromCodePoint(Number.parseInt(code, 16)),
		)
		.replace(/\\([\s\S])/g, "$1");

const cssPropertyToStyleProperty = (value: string): string =>
	value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/** Build a resolver from CSS emitted by the real UnoCSS generator. */
export function createUnoCssResolverFromCss(css: string): UnoCssTokenResolver {
	const entries = new Map<string, readonly StyleDeclaration[]>();
	for (const rule of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
		const selector = rule[1];
		const body = rule[2];
		if (selector === undefined || body === undefined) continue;
		const classMatch = /\.([A-Za-z0-9_-]+(?:\\:[A-Za-z0-9_-]+)*)/.exec(selector);
		if (classMatch?.[1] === undefined) continue;
		const token = unescapeUnoCssSelector(classMatch[1]);
		const prefixes = token.split(":");
		const utility = prefixes.pop();
		if (utility === undefined) continue;
		const declarations: StyleDeclaration[] = [];
		for (const declaration of body.split(";")) {
			const colon = declaration.indexOf(":");
			if (colon <= 0) continue;
			const name = cssPropertyToStyleProperty(declaration.slice(0, colon).trim());
			const value = declaration.slice(colon + 1).trim();
			if (name !== "" && value !== "") declarations.push(literal(name, value));
		}
		if (declarations.length === 0) continue;
		entries.set(
			token,
			declarations.map((declaration) => ({
				...declaration,
				conditions: prefixes.map(condition),
			})),
		);
	}
	return {
		resolve(token) {
			return entries.get(token);
		},
	};
}

const literal = (property: string, value: string | number): StyleDeclaration => ({
	conditions: [],
	property,
	value: { kind: "literal", value },
});

const condition = (prefix: string): StyleCondition => {
	if (prefix === "hover" || prefix === "focus" || prefix === "active")
		return { kind: "pseudo", name: prefix };
	if (/^\d+xl$|^sm$|^md$|^lg$|^xl$|^2xl$/.test(prefix)) return { kind: "named", name: prefix };
	return { kind: "named", name: prefix };
};

const BASIC_TOKENS: Readonly<Record<string, readonly StyleDeclaration[]>> = {
	block: [literal("display", "block")],
	flex: [literal("display", "flex")],
	"inline-flex": [literal("display", "inline-flex")],
	"flex-col": [literal("flexDirection", "column")],
	"items-center": [literal("alignItems", "center")],
	"items-start": [literal("alignItems", "flex-start")],
	"justify-center": [literal("justifyContent", "center")],
	"justify-between": [literal("justifyContent", "space-between")],
	"text-center": [literal("textAlign", "center")],
	"font-sans": [literal("fontFamily", "ui-sans-serif, system-ui, sans-serif")],
	"font-semibold": [literal("fontWeight", 600)],
	"leading-8": [literal("lineHeight", 2)],
	"leading-10": [literal("lineHeight", 2.5)],
	"min-h-screen": [literal("minHeight", "100vh")],
	"w-full": [literal("width", "100%")],
	"max-w-3xl": [literal("maxWidth", "48rem")],
	"gap-4": [literal("gap", "1rem")],
	"gap-6": [literal("gap", "1.5rem")],
	"py-32": [literal("paddingBlock", "8rem")],
	"px-16": [literal("paddingInline", "4rem")],
	"rounded-full": [literal("borderRadius", "9999px")],
	"bg-white": [literal("backgroundColor", "#fff")],
	"bg-black": [literal("backgroundColor", "#000")],
	"bg-zinc-50": [literal("backgroundColor", "#fafafa")],
	"text-black": [literal("color", "#000")],
	"text-zinc-50": [literal("color", "#fafafa")],
	"text-zinc-600": [literal("color", "#52525b")],
	"text-zinc-400": [literal("color", "#a1a1aa")],
};

function defaultResolve(token: string): readonly StyleDeclaration[] | undefined {
	const parts = token.split(":");
	const utility = parts.pop();
	if (utility === undefined) return undefined;
	const declarations = BASIC_TOKENS[utility];
	if (declarations === undefined) {
		const arbitrary = /^\[([\w-]+):(.+)\]$/.exec(utility);
		if (arbitrary?.[1] === undefined || arbitrary[2] === undefined) return undefined;
		return [
			{
				...literal(
					arbitrary[1]!.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
					arbitrary[2],
				),
				conditions: parts.map(condition),
			},
		];
	}
	return declarations.map((declaration) => ({
		...declaration,
		conditions: [...parts.map(condition), ...declaration.conditions],
	}));
}

function config(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.UnoCSS,
		root: context.root,
		files: [context.file],
		values: {},
	};
}

type UnoConfigPackage = {
	loadConfig?: (
		cwd?: string,
		configOrPath?: string,
	) => Promise<{ config?: unknown; sources?: readonly string[] }>;
};

type UnoCorePackage = {
	createGenerator?: (config?: unknown) => Promise<{
		generate(
			input: readonly string[],
			options?: { preflights?: boolean; minify?: boolean },
		): Promise<{
			css: string;
		}>;
	}>;
};

function staticUnoTokens(source: string): readonly string[] {
	return [
		...new Set(
			[...source.matchAll(/\b(?:className|class)\s*=\s*(["'])([^"']*)\1/g)].flatMap((match) =>
				(match[2] ?? "").split(/\s+/).filter(Boolean),
			),
		),
	];
}

async function officialConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = config(context);
	if (context.root === undefined) return fallback;
	const [configPackage, corePackage] = await Promise.all([
		loader.importPackage<UnoConfigPackage>("@unocss/config", context.root),
		loader.importPackage<UnoCorePackage>("@unocss/core", context.root),
	]);
	if (configPackage?.loadConfig === undefined || corePackage?.createGenerator === undefined)
		return fallback;
	try {
		const loaded = await configPackage.loadConfig(context.root, context.root);
		const generator = await corePackage.createGenerator(loaded.config);
		const generated = await generator.generate(staticUnoTokens(context.source), {
			preflights: false,
			minify: true,
		});
		return {
			...fallback,
			files: [
				...fallback.files,
				...(loaded.sources ?? []).map((file) =>
					isAbsolute(file) ? file : join(context.root!, file),
				),
			],
			values: {
				...fallback.values,
				unoConfig: loaded.config,
				unoResolver: createUnoCssResolverFromCss(generated.css),
				unoGeneratedCss: generated.css,
				officialConfigPackages: ["@unocss/config", "@unocss/core"],
			},
		};
	} catch (error) {
		return {
			...fallback,
			values: {
				...fallback.values,
				officialConfigError: error instanceof Error ? error.message : String(error),
			},
		};
	}
}

function parseUnoCss(
	source: string,
	context: AdapterParseContext,
	resolver: UnoCssTokenResolver,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] =
		typeof context.config.values.officialConfigError === "string"
			? [
					{
						kind: "configuration",
						text: "UnoCSS project configuration",
						hint: `official UnoCSS config loading failed: ${context.config.values.officialConfigError}`,
					},
				]
			: [];
	const excluded = context.document?.isExcluded ?? (() => false);
	const attribute = /\b(className|class)\s*=\s*(["'])([^"']*)\2/g;
	for (const match of source.matchAll(attribute)) {
		const start = match.index ?? 0;
		if (excluded(start)) continue;
		const attributeName = match[1];
		const value = match[3] ?? "";
		if (attributeName === undefined || value.trim() === "") continue;
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of value.split(/\s+/).filter(Boolean)) {
			const resolved = resolver.resolve(token, context);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		const program = styleProgramFromRules(
			[
				{
					kind: "style",
					conditions: [],
					declarations,
					children: [],
					order: 0,
				},
			],
			{
				source: {
					file: context.file,
					start,
					end: start + match[0].length,
					adapter: CodemodAdapterId.UnoCSS,
					framework: context.document?.framework,
					hostAttribute: attributeName,
				},
				residuals: unknown.map((token) => ({
					kind: "unknown-utility",
					text: token,
					hint: "UnoCSS utility requires the project resolver/preset to be loaded",
				})),
			},
		);
		matches.push({ start, end: start + match[0].length, program, sourceText: match[0] });
	}
	return { matches, residuals };
}

/** UnoCSS is class/compiler driven; project presets and shortcuts are resolved through this port. */
export function createUnoCssAdapter(options: UnoCssAdapterOptions = {}): StyleAdapter {
	const fallbackResolver = options.resolver ?? {
		resolve: (token: string) => defaultResolve(token),
	};
	const moduleLoader = options.moduleLoader ?? NODE_PROJECT_MODULE_LOADER;
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: CodemodAdapterId.UnoCSS,
		version: "2",
		sourceModules: ["unocss", "@unocss/core", "@unocss/preset-wind"],
		dependencies: { packages: [{ name: "unocss", kind: "development" }] },
		capabilities: {
			schema: ADAPTER_CAPABILITIES_SCHEMA,
			adapter: CodemodAdapterId.UnoCSS,
			version: "1",
			capabilities: {
				declarations: "exact",
				"token-values": "partial",
				"named-conditions": "partial",
				"pseudo-conditions": "exact",
				"dynamic-values": "unsupported",
				"framework-semantics": "exact",
			},
		},
		detect: (context) => {
			const matched = /\b(?:className|class)\s*=\s*["'][^"']+["']/.test(context.source);
			return {
				matched,
				confidence: /@unocss\/|\bunocss\b|presetWind/.test(context.source) ? 1 : 0.55,
				evidence: matched ? ["literal-class-attribute"] : [],
			};
		},
		loadConfig: (context) => config(context),
		loadConfigAsync: (context) => officialConfig(context, moduleLoader),
		parse: (source, context) =>
			parseUnoCss(
				source,
				context,
				(context.config.values.unoResolver as UnoCssTokenResolver | undefined) ?? fallbackResolver,
			),
		emit: (program) => ({
			text: styleProgramToCanonicalCss(program),
			residuals: [],
		}),
		validate: (source, target, residuals = []) => {
			const canonicalSource = styleProgramToCanonicalCss(source);
			const canonicalTarget = styleProgramToCanonicalCss(target);
			return {
				valid: canonicalSource === canonicalTarget && residuals.length === 0,
				lossiness:
					canonicalSource !== canonicalTarget
						? "unsupported"
						: residuals.length > 0
							? "lossy"
							: "lossless",
				canonicalSource,
				canonicalTarget,
				differences:
					canonicalSource === canonicalTarget && residuals.length === 0
						? []
						: ["canonical CSS differs or has residuals"],
				residuals,
			};
		},
	};
}

export default createUnoCssAdapter();
