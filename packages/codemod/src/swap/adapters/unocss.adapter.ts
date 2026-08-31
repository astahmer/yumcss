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
	type StyleProgram,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
import { CodemodAdapterId, StyleHostRepresentationKind } from "../identifiers.ts";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "../project-module-loader.ts";
import { isAbsoluteDocumentPath, joinDocumentPath } from "../../path-utils.ts";
import { detectStaticClassTarget } from "../class-target-detection.ts";

export interface UnoCssTokenResolver {
	resolve(token: string, context: AdapterParseContext): readonly StyleDeclaration[] | undefined;
}

export interface UnoCssAdapterOptions {
	readonly resolver?: UnoCssTokenResolver;
	readonly moduleLoader?: ProjectModuleLoader | null;
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
		const declarations: StyleDeclaration[] = [];
		for (const declaration of body.split(";")) {
			const colon = declaration.indexOf(":");
			if (colon <= 0) continue;
			const name = cssPropertyToStyleProperty(declaration.slice(0, colon).trim());
			const value = declaration.slice(colon + 1).trim();
			if (name !== "" && value !== "") declarations.push(literal(name, value));
		}
		if (declarations.length === 0) continue;
		for (const classMatch of selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) {
			const rawToken = classMatch[1];
			if (rawToken === undefined) continue;
			const token = unescapeUnoCssSelector(rawToken);
			const prefixes = token.split(":");
			const utility = prefixes.pop();
			if (utility === undefined) continue;
			entries.set(
				token,
				declarations.map((declaration) => ({
					...declaration,
					conditions: prefixes.map(condition),
				})),
			);
		}
	}
	for (const theme of css.matchAll(/@theme[^{}]*\{([^{}]*)\}/gs)) {
		const body = theme[1] ?? "";
		for (const variable of body.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);?/g)) {
			const name = variable[1];
			const value = variable[2]?.trim();
			if (name === undefined || value === undefined || value === "") continue;
			entries.set(`bg-${name}`, [literal("backgroundColor", value)]);
			entries.set(`text-${name}`, [literal("color", value)]);
		}
	}
	return {
		resolve(token) {
			return entries.get(token);
		},
	};
}

function projectThemeCss(context: AdapterConfigContext): string {
	if (context.root === undefined || context.readFile === undefined) return "";
	const readFile = context.readFile;
	return (
		["app/globals.css", "src/app/globals.css", "styles/globals.css", "src/styles/globals.css"]
			.map((file) => readFile(joinDocumentPath(context.root!, file)))
			.find((source) => source !== undefined) ?? ""
	);
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
	"bg-red-500": [literal("backgroundColor", "#ef4444")],
	"bg-zinc-50": [literal("backgroundColor", "#fafafa")],
	"text-black": [literal("color", "#000")],
	"text-red-500": [literal("color", "#ef4444")],
	"text-zinc-50": [literal("color", "#fafafa")],
	"text-zinc-600": [literal("color", "#52525b")],
	"text-zinc-400": [literal("color", "#a1a1aa")],
	"p-4": [literal("padding", "1rem")],
};

function defaultResolve(token: string): readonly StyleDeclaration[] | undefined {
	const arbitrary = /^\[([\w-]+):(.+)\]$/.exec(token);
	if (arbitrary?.[1] !== undefined && arbitrary[2] !== undefined)
		return [
			literal(
				arbitrary[1].replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
				arbitrary[2],
			),
		];
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

function unoProperty(property: string): string {
	return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function unoValue(value: string | number | boolean): string {
	return String(value)
		.replaceAll("\\", "\\\\")
		.replaceAll(" ", "_")
		.replaceAll("[", "\\[")
		.replaceAll("]", "\\]");
}

function unoCondition(condition: StyleCondition): string {
	if (condition.kind === "pseudo") return `${condition.name}:`;
	if (condition.kind === "selector") {
		const selector = condition.value ?? condition.name;
		return `[&${selector.startsWith("&") ? selector.slice(1) : selector}]:`;
	}
	return `${condition.name}:`;
}

function unoToken(declaration: StyleDeclaration): string | undefined {
	if (declaration.value.kind !== "literal") return undefined;
	const property = `[${unoProperty(declaration.property)}:${unoValue(declaration.value.value)}]`;
	return `${declaration.conditions.map(unoCondition).join("")}${property}`;
}

function emitUnoClassTokens(program: StyleProgram): {
	readonly text: string;
	readonly residuals: readonly StyleProgramResidual[];
} {
	const residuals: StyleProgramResidual[] = [];
	const rules = program.rules.filter((rule) => rule.kind === "style");
	const declarations =
		rules.length > 0 ? rules.flatMap((rule) => rule.declarations) : program.declarations;
	const tokens: string[] = [];
	for (const declaration of declarations) {
		const token = unoToken(declaration);
		if (token === undefined) {
			residuals.push({
				kind: "dynamic",
				text: declaration.property,
				hint: "UnoCSS arbitrary utility projection requires a literal declaration",
			});
			continue;
		}
		tokens.push(token);
	}
	return { text: JSON.stringify([...new Set(tokens)].join(" ")), residuals };
}

function emitUnoNamedMap(program: StyleProgram): {
	readonly text: string;
	readonly residuals: readonly StyleProgramResidual[];
} {
	const entries: string[] = [];
	const residuals: StyleProgramResidual[] = [];
	for (const rule of program.rules.filter((candidate) => candidate.kind === "style")) {
		if (rule.name === undefined) continue;
		const emitted = emitUnoClassTokens({
			...program,
			rules: [rule],
			declarations: rule.declarations,
		});
		entries.push(`${JSON.stringify(rule.name)}: ${emitted.text}`);
		residuals.push(...emitted.residuals);
	}
	return { text: `{ ${entries.join(", ")} }`, residuals };
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

function staticClassAssignments(source: string): readonly RegExpExecArray[] {
	return [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"']*)\2/g)];
}

function standaloneClassLiteral(
	source: string,
): { value: string; start: number; end: number } | undefined {
	const match = /^\s*(["'])([^"']*\[[^"']*)\1\s*;?\s*$/u.exec(source);
	if (match?.[2] === undefined) return undefined;
	const start = source.indexOf(match[1]!, match[0].indexOf(match[1]!));
	return start < 0 ? undefined : { value: match[2], start, end: start + match[2].length + 2 };
}

function classLiteralExpressions(source: string): readonly RegExpExecArray[] {
	return [...source.matchAll(/(["'])([^"']*\[[^"']*)\1/g)];
}

function isExecutableClassLiteral(source: string, start: number): boolean {
	const lineStart = source.lastIndexOf("\n", start - 1) + 1;
	const linePrefix = source.slice(lineStart, start);
	if (/\/\/.*$/u.test(linePrefix)) return false;
	const blockStart = source.lastIndexOf("/*", start);
	const blockEnd = source.lastIndexOf("*/", start);
	if (blockStart > blockEnd) return false;
	return /(?:^|;)\s*$/u.test(linePrefix);
}

function namedClassMapEntries(source: string): readonly RegExpExecArray[] {
	return [...source.matchAll(/(["'])([A-Za-z_$][\w$-]*)\1\s*:\s*(["'])([^"']*\[[^"']*)\3/g)];
}

function staticClassValue(source: string, binding: string): string | undefined {
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*(["'])([^"']*)\\1`).exec(
		source,
	)?.[2];
}

function openingTagForAttribute(
	source: string,
	attributeStart: number,
): { start: number; end: number; text: string } | undefined {
	const start = source.lastIndexOf("<", attributeStart);
	if (start < 0) return undefined;
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") {
			braces++;
			continue;
		}
		if (character === "}" && braces > 0) {
			braces--;
			continue;
		}
		if (character === ">" && braces === 0)
			return { start, end: index + 1, text: source.slice(start, index + 1) };
	}
	return undefined;
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
		const themeCss = projectThemeCss(context);
		return {
			...fallback,
			files: [
				...fallback.files,
				...(loaded.sources ?? []).map((file) =>
					isAbsoluteDocumentPath(file) ? file : joinDocumentPath(context.root!, file),
				),
			],
			values: {
				...fallback.values,
				unoConfig: loaded.config,
				unoResolver: createUnoCssResolverFromCss(`${themeCss}\n${generated.css}`),
				unoGeneratedCss: generated.css,
				officialConfigPackages: ["@unocss/config", "@unocss/core"],
			},
		};
	} catch (error) {
		return {
			...fallback,
			residuals: [
				{
					kind: "configuration",
					text: "UnoCSS project configuration",
					hint: `official UnoCSS config loading failed: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
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
	const residuals: StyleProgramResidual[] = [...(context.config.residuals ?? [])];
	const excluded = context.document?.isExcluded ?? (() => false);
	const attribute = /\b(className|class)\s*=\s*(["'])([^"']*)\2/g;
	for (const match of source.matchAll(attribute)) {
		const attributeStart = match.index ?? 0;
		if (excluded(attributeStart)) continue;
		const attributeName = match[1];
		const value = match[3] ?? "";
		if (attributeName === undefined || value.trim() === "") continue;
		const openingTag = openingTagForAttribute(source, attributeStart);
		if (openingTag === undefined) continue;
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
					start: openingTag.start,
					end: openingTag.end,
					adapter: CodemodAdapterId.UnoCSS,
					framework: context.document?.framework,
					hostAttribute: attributeName,
					hostOpenTag: openingTag.text,
					hostStyleAttributes: [match[0]],
				},
				residuals: unknown.map((token) => ({
					kind: "unknown-utility",
					text: token,
					hint: "UnoCSS utility requires the project resolver/preset to be loaded",
				})),
			},
		);
		matches.push({
			start: openingTag.start,
			end: openingTag.end,
			program,
			sourceText: openingTag.text,
		});
	}
	for (const assignment of staticClassAssignments(source)) {
		const binding = assignment[1];
		const quote = assignment[2];
		const value = assignment[3];
		if (binding === undefined || value === undefined || !value.includes("[")) continue;
		const start = (assignment.index ?? 0) + assignment[0].lastIndexOf(`${quote ?? '"'}${value}`);
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of value.split(/\s+/).filter(Boolean)) {
			const resolved = resolver.resolve(token, context);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		matches.push({
			start,
			end: start + value.length + 2,
			sourceText: value,
			program: styleProgramFromRules(
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
						end: start + value.length + 2,
						adapter: CodemodAdapterId.UnoCSS,
					},
					residuals: unknown.map((token) => ({
						kind: "unknown-utility" as const,
						text: token,
						hint: "UnoCSS utility requires the project resolver/preset to be loaded",
					})),
				},
			),
		});
	}
	const standalone = standaloneClassLiteral(source);
	if (standalone !== undefined) {
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of standalone.value.split(/\s+/).filter(Boolean)) {
			const resolved = resolver.resolve(token, context);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		matches.push({
			start: standalone.start,
			end: standalone.end,
			sourceText: standalone.value,
			program: styleProgramFromRules(
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
						start: standalone.start,
						end: standalone.end,
						adapter: CodemodAdapterId.UnoCSS,
					},
					residuals: unknown.map((token) => ({
						kind: "unknown-utility" as const,
						text: token,
						hint: "UnoCSS utility requires the project resolver/preset to be loaded",
					})),
				},
			),
		});
	}
	const assignmentValueStarts = new Set(
		staticClassAssignments(source).map(
			(assignment) =>
				(assignment.index ?? 0) +
				assignment[0].lastIndexOf(`${assignment[2] ?? '"'}${assignment[3] ?? ""}`),
		),
	);
	for (const literal of classLiteralExpressions(source)) {
		const start = literal.index ?? 0;
		const value = literal[2];
		if (
			value === undefined ||
			assignmentValueStarts.has(start) ||
			standalone?.start === start ||
			!isExecutableClassLiteral(source, start)
		)
			continue;
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of value.split(/\s+/).filter(Boolean)) {
			const resolved = resolver.resolve(token, context);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		matches.push({
			start,
			end: start + value.length + 2,
			sourceText: value,
			program: styleProgramFromRules(
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
						end: start + value.length + 2,
						adapter: CodemodAdapterId.UnoCSS,
					},
					residuals: unknown.map((token) => ({
						kind: "unknown-utility" as const,
						text: token,
						hint: "UnoCSS utility requires the project resolver/preset to be loaded",
					})),
				},
			),
		});
	}
	for (const entry of namedClassMapEntries(source)) {
		const name = entry[2];
		const value = entry[4];
		const quote = entry[3];
		if (name === undefined || value === undefined || quote === undefined) continue;
		const entryStart = entry.index ?? 0;
		const start = entryStart + entry[0].lastIndexOf(`${quote}${value}`);
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of value.split(/\s+/).filter(Boolean)) {
			const resolved = resolver.resolve(token, context);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		matches.push({
			start,
			end: start + value.length + 2,
			sourceText: value,
			program: styleProgramFromRules(
				[
					{
						kind: "style",
						name,
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
						end: start + value.length + 2,
						adapter: CodemodAdapterId.UnoCSS,
					},
					residuals: unknown.map((token) => ({
						kind: "unknown-utility" as const,
						text: token,
						hint: "UnoCSS utility requires the project resolver/preset to be loaded",
					})),
				},
			),
		});
	}
	return { matches, residuals };
}

/** UnoCSS is class/compiler driven; project presets and shortcuts are resolved through this port. */
export function createUnoCssAdapter(options: UnoCssAdapterOptions = {}): StyleAdapter {
	const fallbackResolver = options.resolver ?? {
		resolve: (token: string) => defaultResolve(token),
	};
	const moduleLoader =
		options.moduleLoader === null
			? undefined
			: (options.moduleLoader ?? NODE_PROJECT_MODULE_LOADER);
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
				"named-rules": "exact",
				components: "unsupported",
				"framework-semantics": "exact",
				"named-conditions": "partial",
				"pseudo-conditions": "exact",
				"dynamic-values": "unsupported",
			},
		},
		detect: (context) => {
			const matched = detectStaticClassTarget(context.source).matched;
			return {
				matched,
				confidence: /@unocss\/|\bunocss\b|presetWind/.test(context.source) ? 1 : 0.55,
				evidence: matched ? ["literal-class-attribute"] : [],
			};
		},
		loadConfig: (context) => config(context),
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) => officialConfig(context, moduleLoader),
				}),
		parse: (source, context) =>
			parseUnoCss(
				source,
				context,
				(context.config.values.unoResolver as UnoCssTokenResolver | undefined) ?? fallbackResolver,
			),
		emit: (program) => {
			const namedRules = program.rules.some(
				(rule) => rule.kind === "style" && rule.name !== undefined,
			);
			return namedRules ? emitUnoNamedMap(program) : emitUnoClassTokens(program);
		},
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostRepresentation: StyleHostRepresentationKind.Class,
				standaloneHostRepresentation: StyleHostRepresentationKind.Class,
			},
		},
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
