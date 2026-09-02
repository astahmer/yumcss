import {
	SemanticConditionKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	styleProgramFromRules,
	styleProgramToCanonicalCss,
	type StyleCondition,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
} from "../semantic-ir.ts";
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
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleRepresentationKind,
} from "../identifiers.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { isAbsoluteDocumentPath, joinDocumentPath } from "../../path-utils.ts";
import { detectStaticClassTarget } from "../class-target-detection.ts";
import { DynamicClassHost } from "./class-target-dynamic.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { TokenCatalog } from "../tokens.ts";
import {
	parseGeneratedCss,
	type GeneratedCssAtRule,
	type GeneratedCssNode,
} from "../generated-css-parser.ts";

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

function generatedAtRuleCondition(rule: GeneratedCssAtRule): StyleCondition | undefined {
	const params = rule.params.trim();
	if (params === "") return undefined;
	if (rule.name === "media") return { kind: "media", name: params, value: params };
	if (rule.name === "supports") return { kind: "supports", name: params, value: params };
	if (rule.name === "container") return { kind: "container", name: params, value: params };
	return undefined;
}

function generatedSelectorConditions(selector: string, token: string): readonly StyleCondition[] {
	const conditions: StyleCondition[] = [];
	for (const match of selector.matchAll(/(?<!\\):([a-z-]+)(?:\([^)]*\))?/giu)) {
		const name = match[1];
		if (name !== undefined) conditions.push(generatedPseudoCondition(name));
	}
	if (conditions.length > 0) return conditions;
	const normalized = selector.trim();
	if (
		!normalized.includes("[") &&
		!normalized.includes("]") &&
		!/[>&+~\s]/u.test(normalized) &&
		/^\.?[\\A-Za-z0-9_-]+$/u.test(normalized)
	)
		return [];
	const utility = splitUtilityToken(token).at(-1) ?? token;
	const escapedUtility = utility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const relative = normalized.replace(
		new RegExp(`\\.${escapedUtility}(?=[\\s:#.\\[>,+~]|$)`, "u"),
		"&",
	);
	return [{ kind: "selector", name: relative, value: relative }];
}

/** Build a resolver from CSS emitted by the real UnoCSS generator. */
export function createUnoCssResolverFromCss(css: string): UnoCssTokenResolver {
	const entries = new Map<string, readonly StyleDeclaration[]>();
	const root = parseGeneratedCss(css);
	const work: Array<{
		node: GeneratedCssNode;
		conditions: readonly StyleCondition[];
		insideStyleRule: boolean;
		currentRules: readonly { token: string; conditions: readonly StyleCondition[] }[];
	}> = root.toReversed().map((node) => ({
		node,
		conditions: [],
		insideStyleRule: false,
		currentRules: [],
	}));
	while (work.length > 0) {
		const current = work.pop()!;
		const node = current.node;
		if (node.type === "decl") {
			if (!current.insideStyleRule) continue;
			const name = cssPropertyToStyleProperty(node.prop.trim());
			const value = node.value.trim();
			if (name === "" || value === "") continue;
			for (const entry of current.currentRules) {
				const existing = entries.get(entry.token) ?? [];
				entries.set(entry.token, [
					...existing,
					{ ...literal(name, value), conditions: entry.conditions },
				]);
			}
			continue;
		}
		const children = node.nodes ?? [];
		if (node.type === "atrule") {
			if (node.name === "theme") {
				for (const child of children) {
					if (child.type !== "decl") continue;
					const value = child.value.trim();
					const match = /^--color-(.+)$/u.exec(child.prop);
					if (match?.[1] === undefined || value === "") continue;
					entries.set(`bg-${match[1]}`, [literal("backgroundColor", value)]);
					entries.set(`text-${match[1]}`, [literal("color", value)]);
				}
				continue;
			}
			const atRuleCondition = generatedAtRuleCondition(node);
			const conditions =
				atRuleCondition === undefined
					? current.conditions
					: [...current.conditions, atRuleCondition];
			for (let index = children.length - 1; index >= 0; index--)
				work.push({ ...current, node: children[index]!, conditions });
			continue;
		}

		const rules = [...node.selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].flatMap((match) => {
			const raw = match[1];
			if (raw === undefined) return [];
			const token = unescapeUnoCssSelector(raw);
			return [
				{
					token,
					conditions: [...current.conditions, ...generatedSelectorConditions(node.selector, token)],
				},
			];
		});
		for (let index = children.length - 1; index >= 0; index--)
			work.push({
				node: children[index]!,
				conditions: current.conditions,
				insideStyleRule: true,
				currentRules: rules,
			});
	}
	return { resolve: (token) => entries.get(token) };
}

function projectThemeCss(context: AdapterConfigContext): string {
	if (context.root === undefined || context.readFile === undefined) return "";
	const readFile = context.readFile;
	const files = context.listFiles?.(context.root) ?? [];
	return files
		.map((file) =>
			readFile(file.startsWith(context.root!) ? file : joinDocumentPath(context.root!, file)),
		)
		.filter((source): source is string => source !== undefined)
		.filter((source) => /@(?:theme|unocss|apply|shortcut)\b/u.test(source))
		.join("\n");
}

const literal = (property: string, value: string | number): StyleDeclaration => ({
	conditions: [],
	property,
	value: { kind: "literal", value },
});

const authoredVariantCondition = (name: string): StyleCondition => ({
	kind: "named",
	name,
});

const generatedPseudoCondition = (name: string): StyleCondition => ({
	kind: "pseudo",
	name,
});

function splitUtilityToken(token: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let brackets = 0;
	for (let index = 0; index < token.length; index++) {
		const character = token[index]!;
		if (character === "[") brackets++;
		else if (character === "]" && brackets > 0) brackets--;
		else if (character === ":" && brackets === 0) {
			parts.push(token.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(token.slice(start));
	return parts;
}

function defaultResolve(token: string): readonly StyleDeclaration[] | undefined {
	const arbitrary = /^\[([\w-]+):(.+)\]$/.exec(token);
	if (arbitrary?.[1] !== undefined && arbitrary[2] !== undefined)
		return [
			literal(
				arbitrary[1].replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
				arbitrary[2],
			),
		];
	const parts = splitUtilityToken(token);
	const utility = parts.pop();
	if (utility === undefined) return undefined;
	const arbitraryUtilityMatch = /^\[([\w-]+):(.+)\]$/.exec(utility);
	if (arbitraryUtilityMatch?.[1] === undefined || arbitraryUtilityMatch[2] === undefined)
		return undefined;
	return [
		{
			...literal(
				arbitraryUtilityMatch[1]!.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
				arbitraryUtilityMatch[2],
			),
			conditions: parts.map(authoredVariantCondition),
		},
	];
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
	if (condition.kind === SemanticConditionKindTag.Pseudo) return `${condition.name}:`;
	if (condition.kind === SemanticConditionKindTag.Selector) {
		const selector = condition.value ?? condition.name;
		return `[&${selector.startsWith("&") ? selector.slice(1) : selector}]:`;
	}
	return `${condition.name}:`;
}

function unoToken(declaration: StyleDeclaration): string | undefined {
	if (declaration.value.kind !== StyleValueKindTag.Literal) return undefined;
	const property = `[${unoProperty(declaration.property)}:${unoValue(declaration.value.value)}]`;
	return `${declaration.conditions.map(unoCondition).join("")}${property}`;
}

function unoNamedToken(
	declaration: StyleDeclaration,
	catalog: TokenCatalog | undefined,
): string | undefined {
	if (catalog === undefined || declaration.value.kind !== StyleValueKindTag.Literal)
		return undefined;
	const groups: Readonly<Record<string, string>> = {
		color: "colors",
		backgroundColor: "colors",
		borderColor: "colors",
		borderRadius: "radii",
		fontSize: "fontSizes",
		fontWeight: "fontWeights",
		lineHeight: "lineHeights",
		letterSpacing: "letterSpacings",
		fontFamily: "fonts",
		boxShadow: "shadows",
		padding: "spacing",
		paddingInline: "spacing",
		paddingBlock: "spacing",
		margin: "spacing",
		marginInline: "spacing",
		marginBlock: "spacing",
		gap: "spacing",
		width: "width",
		height: "height",
		minWidth: "width",
		maxWidth: "width",
		minHeight: "height",
		maxHeight: "height",
	};
	const group = groups[declaration.property];
	const match =
		group === undefined ? undefined : catalog.findUnique([group], String(declaration.value.value));
	if (match === undefined) return undefined;
	const prefixes: Readonly<Record<string, string>> = {
		color: "text",
		backgroundColor: "bg",
		borderColor: "border",
		borderRadius: "rounded",
		fontSize: "text",
		fontWeight: "font",
		lineHeight: "leading",
		letterSpacing: "tracking",
		fontFamily: "font",
		boxShadow: "shadow",
		padding: "p",
		paddingInline: "px",
		paddingBlock: "py",
		margin: "m",
		marginInline: "mx",
		marginBlock: "my",
		gap: "gap",
		width: "w",
		height: "h",
		minWidth: "min-w",
		maxWidth: "max-w",
		minHeight: "min-h",
		maxHeight: "max-h",
	};
	return `${prefixes[declaration.property]}-${match.ref.replaceAll(".", "-")}`;
}

function emitUnoClassTokens(
	program: StyleProgram,
	catalog?: TokenCatalog,
): {
	readonly text: string;
	readonly residuals: readonly StyleProgramResidual[];
} {
	const residuals: StyleProgramResidual[] = [];
	const rules = program.rules.filter((rule) => rule.kind === StyleRuleKindTag.Style);
	const declarations =
		rules.length > 0 ? rules.flatMap((rule) => rule.declarations) : program.declarations;
	const tokens: string[] = [];
	for (const declaration of declarations) {
		const named = unoNamedToken(declaration, catalog);
		if (named !== undefined) {
			tokens.push(`${declaration.conditions.map(unoCondition).join("")}${named}`);
			continue;
		}
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

function emitUnoNamedMap(
	program: StyleProgram,
	catalog?: TokenCatalog,
): {
	readonly text: string;
	readonly residuals: readonly StyleProgramResidual[];
} {
	const entries: string[] = [];
	const residuals: StyleProgramResidual[] = [];
	for (const rule of program.rules.filter(
		(candidate) => candidate.kind === StyleRuleKindTag.Style,
	)) {
		if (rule.name === undefined) continue;
		const emitted = emitUnoClassTokens(
			{
				...program,
				rules: [rule],
				declarations: rule.declarations,
			},
			catalog,
		);
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
	const tokens = new Set<string>();
	const add = (value: string | undefined): void => {
		for (const token of value?.split(/\s+/).filter(Boolean) ?? []) tokens.add(token);
	};
	for (const match of source.matchAll(
		/\b(?:className|class)\s*=\s*(?:(["'])([^"']*)\1|\{\s*(["'])([^"']*)\3\s*\})/g,
	))
		add(match[2] ?? match[4]);
	for (const match of staticClassAssignments(source)) add(match[3] ?? match[5]);
	for (const match of namedClassMapEntries(source)) add(match[4]);
	for (const match of classLiteralExpressions(source)) add(match[2]);
	return [...tokens];
}

function staticClassAssignments(source: string): readonly RegExpExecArray[] {
	return [
		...source.matchAll(
			/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:("|')([^"']*)\2|\{\s*("|')([^"']*)\4\s*\})/g,
		),
	];
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
			tokenCatalog: TokenCatalog.fromNested(
				(loaded.config as Record<string, unknown> | undefined)?.theme as
					| Record<string, unknown>
					| undefined,
			)?.contract,
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
	const attribute = /\b(className|class)\s*=\s*(?:("|')([^"']*)\2|\{\s*("|')([^"']*)\4\s*\})/g;
	for (const match of source.matchAll(attribute)) {
		const attributeStart = match.index ?? 0;
		if (excluded(attributeStart)) continue;
		const attributeName = match[1];
		const value = match[3] ?? match[5] ?? "";
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
		const quote = assignment[2] ?? assignment[4];
		const value = assignment[3] ?? assignment[5];
		if (binding === undefined || value === undefined) continue;
		const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const isUsedAsClass = new RegExp(
			`\\b(?:className|class)\\s*=\\s*\\{\\s*${escapedBinding}\\s*\\}`,
		).test(source.slice((assignment.index ?? 0) + assignment[0].length));
		if (!value.includes("[") && !isUsedAsClass) continue;
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
				assignment[0].lastIndexOf(
					`${assignment[2] ?? assignment[4] ?? '"'}${assignment[3] ?? assignment[5] ?? ""}`,
				),
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
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: CodemodAdapterId.UnoCSS,
		version: "2",
		officialApi: AdapterEvidence.manifest({
			apis: [
				{ name: "rules", status: AdapterOfficialApiStatusTag.Supported },
				{ name: "shortcuts", status: AdapterOfficialApiStatusTag.Supported },
				{ name: "themes", status: AdapterOfficialApiStatusTag.Supported },
				{ name: "variants", status: AdapterOfficialApiStatusTag.Supported },
			],
			configEntrypoints: ["uno.config.ts", "uno.config.js"],
			pluginSystems: ["presets", "transformers", "extractors"],
			compilerIntegrations: ["@unocss/config", "@unocss/core"],
		}),
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
				"custom-properties": "exact",
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
		loadConfig: (context) => AdapterEvidence.normalizeConfig(config(context)),
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: async (context: AdapterConfigContext) =>
						AdapterEvidence.normalizeConfig(await officialConfig(context, moduleLoader)),
				}),
		parse: (source, context) =>
			parseUnoCss(
				source,
				context,
				(context.config.values.unoResolver as UnoCssTokenResolver | undefined) ?? fallbackResolver,
			),
		emit: (program, context) => {
			const tokenCatalog = TokenCatalog.fromContract(context.config.tokenCatalog);
			const namedRules = program.rules.some(
				(rule) => rule.kind === StyleRuleKindTag.Style && rule.name !== undefined,
			);
			return namedRules
				? emitUnoNamedMap(program, tokenCatalog)
				: emitUnoClassTokens(program, tokenCatalog);
		},
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				dynamicClassCarrier: true,
				handlesFrameworkSemantics: true,
				hostRepresentation: StyleHostRepresentationKind.Class,
				standaloneHostRepresentation: StyleHostRepresentationKind.Class,
				resolveRepresentation: ({ program, hasHostContext, binding, framework, source }) => {
					const sourceHostAttributes =
						program.source?.hostOpenTag !== undefined &&
						(program.source.hostStyleAttributes?.length ?? 0) > 0;
					return DynamicClassHost.hasCarrier(program) &&
						hasHostContext &&
						(binding !== undefined || sourceHostAttributes) &&
						(framework === undefined ||
							[BuiltinHostFramework.React, BuiltinHostFramework.Preact].includes(
								framework as BuiltinHostFramework,
							)) &&
						(sourceHostAttributes || DynamicClassHost.canRewrite(source ?? "", binding))
						? StyleRepresentationKind.CustomProperty
						: undefined;
				},
				capabilitiesForRepresentation: ({ representation }) =>
					representation === StyleRepresentationKind.CustomProperty ? ["custom-properties"] : [],
				preservesResidualKindsForRepresentation: ({ representation }) =>
					representation === StyleRepresentationKind.CustomProperty
						? ["dynamic-custom-property"]
						: [],
				rewriteHost: ({ code, binding, framework, representationKind, residuals }) =>
					DynamicClassHost.rewrite("UnoCSS", code, {
						binding,
						framework,
						representationKind,
						residuals,
					}),
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
