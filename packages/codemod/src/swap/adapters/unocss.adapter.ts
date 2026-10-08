import {
	SemanticConditionKindTag,
	StyleProgramResidualKindTag,
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
	AdapterDependencyKindTag,
	type AdapterConfigContext,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type AdapterTokenCatalog,
	type StyleAdapter,
} from "../adapter-contract.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../capabilities.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleRepresentationKind,
	StyleProgramEmissionHint,
} from "../identifiers.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { isAbsoluteDocumentPath, joinDocumentPath } from "../../path-utils.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import {
	collectDynamicClassAttributes,
	detectStaticClassTarget,
} from "../class-target-detection.ts";
import { DynamicClassHost } from "./class-target-dynamic.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { TokenCatalog, resolvedStyleValue } from "../tokens.ts";
import {
	parseGeneratedCss,
	type GeneratedCssAtRule,
	type GeneratedCssNode,
} from "../generated-css-parser.ts";
import { GeneratedCssNodeKind } from "../generated-css-parser.ts";
import { dynamicVariableName } from "../lowering.ts";

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

function normalizeUnoGeneratedValue(value: string): string {
	const opaque = value.replace(/\s*\/\s*var\(--un-(?:bg|text)-opacity\)\s*/u, "");
	const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)$/u.exec(opaque);
	if (rgb?.[1] === undefined || rgb[2] === undefined || rgb[3] === undefined) return value;
	const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
	if (channels.some((channel) => channel < 0 || channel > 255)) return value;
	return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function generatedAtRuleCondition(rule: GeneratedCssAtRule): StyleCondition | undefined {
	const params = rule.params.trim();
	if (params === "") return undefined;
	if (rule.name === "media") return { kind: "media", name: params, value: params };
	if (rule.name === "supports") return { kind: "supports", name: params, value: params };
	if (rule.name === "container") return { kind: "container", name: params, value: params };
	return undefined;
}

const generatedSelectorList = (selector: string): readonly string[] => {
	const selectors: string[] = [];
	let start = 0;
	let depth = 0;
	let quote = "";
	for (let index = 0; index < selector.length; index++) {
		const character = selector[index];
		if (character === "\\") {
			index++;
			continue;
		}
		if (quote !== "") {
			if (character === quote) quote = "";
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "(" || character === "[") depth++;
		if (character === ")" || character === "]") depth--;
		if (character !== "," || depth !== 0) continue;
		selectors.push(selector.slice(start, index).trim());
		start = index + 1;
	}
	selectors.push(selector.slice(start).trim());
	return selectors;
};

function generatedSelectorConditions(selector: string, token: string): readonly StyleCondition[] {
	const normalized = selector.trim();
	const classMatch = [...normalized.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].find(
		(match) => unescapeUnoCssSelector(match[1] ?? "") === token,
	);
	if (classMatch === undefined || classMatch.index === undefined) return [];
	const classStart = classMatch.index;
	const classEnd = classStart + classMatch[0].length;
	const relative = `${normalized.slice(0, classStart)}&${normalized.slice(classEnd)}`;
	const targetMarker = relative.indexOf("&");
	if (targetMarker < 0) return [{ kind: "selector", name: relative, value: relative }];
	const parent = relative.slice(0, targetMarker + 1).trim();
	const targetSuffix = relative.slice(targetMarker + 1).trim();
	if (targetSuffix.includes("(")) return [{ kind: "selector", name: relative, value: relative }];
	const conditions: StyleCondition[] = [];
	for (const match of targetSuffix.matchAll(/(?<!\\):([a-z-]+)(?:\([^)]*\))?/giu)) {
		const name = match[1];
		if (name !== undefined) conditions.push(generatedPseudoCondition(name));
	}
	const recognizedTargetSuffix = targetSuffix.replace(/(?<!\\):([a-z-]+)(?:\([^)]*\))?/giu, "");
	if (recognizedTargetSuffix.trim() !== "") {
		const selectorWithSuffix = `${parent}${targetSuffix}`;
		return [{ kind: "selector", name: selectorWithSuffix, value: selectorWithSuffix }];
	}
	if (parent !== "&") conditions.unshift({ kind: "selector", name: parent, value: parent });
	return conditions;
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
		if (node.type === GeneratedCssNodeKind.Declaration) {
			if (!current.insideStyleRule) continue;
			if (node.prop.trim().startsWith("--")) continue;
			const name = cssPropertyToStyleProperty(node.prop.trim());
			const value = normalizeUnoGeneratedValue(node.value.trim());
			if (name === "" || value === "") continue;
			for (const entry of current.currentRules) {
				const existing = entries.get(entry.token) ?? [];
				const declaration = { ...literal(name, value), conditions: entry.conditions };
				if (!existing.some((candidate) => sameStyleDeclaration(candidate, declaration)))
					entries.set(entry.token, [...existing, declaration]);
			}
			continue;
		}
		const children = node.nodes ?? [];
		if (node.type === GeneratedCssNodeKind.AtRule) {
			const atRuleCondition = generatedAtRuleCondition(node);
			const conditions =
				atRuleCondition === undefined
					? current.conditions
					: [...current.conditions, atRuleCondition];
			for (let index = children.length - 1; index >= 0; index--)
				work.push({ ...current, node: children[index]!, conditions });
			continue;
		}

		const rules = generatedSelectorList(node.selector).flatMap((selector) =>
			[...selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].flatMap((match) => {
				const raw = match[1];
				if (raw === undefined) return [];
				const token = unescapeUnoCssSelector(raw);
				return [
					{
						token,
						conditions: [...current.conditions, ...generatedSelectorConditions(selector, token)],
					},
				];
			}),
		);
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

const literal = (property: string, value: string | number): StyleDeclaration => ({
	conditions: [],
	property,
	value: { kind: "literal", value },
});

const generatedPseudoCondition = (name: string): StyleCondition => ({
	kind: "pseudo",
	name,
});

const canonicalConditions = (conditions: readonly StyleCondition[]): string =>
	styleProgramToCanonicalCss(
		styleProgramFromRules([
			{
				kind: StyleRuleKindTag.Style,
				conditions: [],
				declarations: [{ ...literal("color", "red"), conditions }],
			},
		]),
	);

const sameConditions = (
	left: readonly StyleCondition[],
	right: readonly StyleCondition[],
): boolean => canonicalConditions(left) === canonicalConditions(right);

function sameStyleDeclaration(left: StyleDeclaration, right: StyleDeclaration): boolean {
	return (
		left.property === right.property &&
		JSON.stringify(left.value) === JSON.stringify(right.value) &&
		sameConditions(left.conditions, right.conditions)
	);
}

const UNO_TOKEN_NAME_POLICIES: readonly {
	readonly property: string;
	readonly group: string;
	readonly prefix: string;
}[] = [
	{ property: "color", group: "colors", prefix: "text" },
	{ property: "backgroundColor", group: "colors", prefix: "bg" },
	{ property: "borderColor", group: "colors", prefix: "border" },
	{ property: "borderRadius", group: "radii", prefix: "rounded" },
	{ property: "fontSize", group: "fontSizes", prefix: "text" },
	{ property: "fontWeight", group: "fontWeights", prefix: "font" },
	{ property: "lineHeight", group: "lineHeights", prefix: "leading" },
	{ property: "letterSpacing", group: "letterSpacings", prefix: "tracking" },
	{ property: "fontFamily", group: "fonts", prefix: "font" },
	{ property: "boxShadow", group: "shadows", prefix: "shadow" },
	{ property: "padding", group: "spacing", prefix: "p" },
	{ property: "paddingInline", group: "spacing", prefix: "px" },
	{ property: "paddingBlock", group: "spacing", prefix: "py" },
	{ property: "paddingInlineStart", group: "spacing", prefix: "ps" },
	{ property: "paddingInlineEnd", group: "spacing", prefix: "pe" },
	{ property: "margin", group: "spacing", prefix: "m" },
	{ property: "marginInline", group: "spacing", prefix: "mx" },
	{ property: "marginBlock", group: "spacing", prefix: "my" },
	{ property: "marginInlineStart", group: "spacing", prefix: "ms" },
	{ property: "marginInlineEnd", group: "spacing", prefix: "me" },
	{ property: "gap", group: "spacing", prefix: "gap" },
	{ property: "width", group: "width", prefix: "w" },
	{ property: "height", group: "height", prefix: "h" },
	{ property: "minWidth", group: "width", prefix: "min-w" },
	{ property: "maxWidth", group: "width", prefix: "max-w" },
	{ property: "minHeight", group: "height", prefix: "min-h" },
	{ property: "maxHeight", group: "height", prefix: "max-h" },
];

function unoTokenCandidates(catalog: AdapterTokenCatalog | undefined): readonly string[] {
	if (catalog === undefined) return [];
	const candidates = new Set<string>();
	for (const policy of UNO_TOKEN_NAME_POLICIES) {
		for (const key of Object.keys(catalog.groups[policy.group] ?? {}))
			candidates.add(`${policy.prefix}-${key.replaceAll(".", "-")}`);
	}
	return [...candidates];
}

function hasUnoUtilitySources(config: unknown, generatedCss: unknown): boolean {
	if (typeof generatedCss === "string" && generatedCss.trim() !== "") return true;
	if (typeof config !== "object" || config === null) return false;
	const values = config as Record<string, unknown>;
	const hasPresets = Array.isArray(values.presets) && values.presets.length > 0;
	const hasRules = Array.isArray(values.rules) && values.rules.length > 0;
	const shortcuts = values.shortcuts;
	const hasShortcuts =
		(Array.isArray(shortcuts) && shortcuts.length > 0) ||
		(typeof shortcuts === "object" && shortcuts !== null && Object.keys(shortcuts).length > 0);
	return hasPresets || hasRules || hasShortcuts;
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
	const value = resolvedStyleValue(declaration.value);
	if (value === undefined) return undefined;
	const property = `[${unoProperty(declaration.property)}:${unoValue(value)}]`;
	return `${declaration.conditions.map(unoCondition).join("")}${property}`;
}

function unoNamedToken(
	declaration: StyleDeclaration,
	catalog: TokenCatalog | undefined,
): string | undefined {
	const value = resolvedStyleValue(declaration.value);
	if (catalog === undefined || value === undefined) return undefined;
	const policy = UNO_TOKEN_NAME_POLICIES.find(
		(candidate) => candidate.property === declaration.property,
	);
	const match =
		policy === undefined ? undefined : catalog.findUnique([policy.group], String(value));
	if (policy === undefined || match === undefined) return undefined;
	return `${policy.prefix}-${match.ref.replaceAll(".", "-")}`;
}

function emitUnoClassTokens(
	program: StyleProgram,
	catalog?: TokenCatalog,
	resolver?: UnoCssTokenResolver,
	parseContext?: AdapterParseContext,
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
		if (resolvedStyleValue(declaration.value) === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Dynamic,
				text: declaration.property,
				hint: "UnoCSS output requires a resolved literal or token value",
			});
			continue;
		}
		const named = unoNamedToken(declaration, catalog);
		const verifiedNamed =
			named !== undefined &&
			declaration.conditions.length === 0 &&
			resolver !== undefined &&
			parseContext !== undefined
				? resolver
						.resolve(named, parseContext)
						?.some(
							(candidate) =>
								candidate.property === declaration.property &&
								resolvedStyleValue(candidate.value) === resolvedStyleValue(declaration.value) &&
								sameConditions(candidate.conditions, declaration.conditions),
						) === true
				: false;
		if (named !== undefined && verifiedNamed) {
			tokens.push(`${declaration.conditions.map(unoCondition).join("")}${named}`);
			continue;
		}
		const token = unoToken(declaration);
		if (token === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Dynamic,
				text: declaration.property,
				hint: "UnoCSS arbitrary utility projection requires a literal declaration",
			});
			continue;
		}
		const verifiedArbitrary =
			resolver !== undefined &&
			parseContext !== undefined &&
			resolver
				.resolve(token, parseContext)
				?.some(
					(candidate) =>
						candidate.property === declaration.property &&
						resolvedStyleValue(candidate.value) === resolvedStyleValue(declaration.value) &&
						sameConditions(candidate.conditions, declaration.conditions),
				) === true;
		if (!verifiedArbitrary) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Configuration,
				text: token,
				hint: "the official UnoCSS generator did not prove this emitted utility",
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
	resolver?: UnoCssTokenResolver,
	parseContext?: AdapterParseContext,
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
			resolver,
			parseContext,
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

function staticUnoPropertyCandidates(source: string): readonly string[] {
	const candidates = new Set<string>();
	for (const match of source.matchAll(
		/([A-Za-z_$-][\w$-]*)\s*:\s*(?:"([^"\n]+)"|'([^'\n]+)'|(-?(?:\d+(?:\.\d+)?)(?:[a-z%]+)?))/giu,
	)) {
		const property = match[1];
		const value = match[2] ?? match[3] ?? match[4];
		if (property === undefined || value === undefined) continue;
		const candidate = unoToken({
			property: cssPropertyToStyleProperty(property),
			value: { kind: "literal", value },
			conditions: [],
		});
		if (candidate !== undefined) candidates.add(candidate);
	}
	return [...candidates];
}

const styleProgramUnoCandidates = (
	programs: readonly StyleProgram[],
	tokenCatalog: TokenCatalog | undefined,
): readonly string[] => {
	const candidates = new Set<string>();
	for (const program of programs) {
		const styleRules = program.rules.filter((rule) => rule.kind === StyleRuleKindTag.Style);
		const declarations =
			styleRules.length > 0
				? styleRules.flatMap((rule) => rule.declarations)
				: program.declarations;
		for (const declaration of declarations) {
			const arbitrary = unoToken(declaration);
			if (arbitrary !== undefined) candidates.add(arbitrary);
			const named = unoNamedToken(declaration, tokenCatalog);
			if (named !== undefined) candidates.add(named);
			if (declaration.value.kind === StyleValueKindTag.Dynamic) {
				const dynamicExpression = declaration.value.expression;
				const dynamic = unoToken({
					...declaration,
					value: {
						kind: StyleValueKindTag.Literal,
						value: `var(${dynamicVariableName(dynamicExpression)})`,
					},
				});
				if (dynamic !== undefined) candidates.add(dynamic);
				const resolvedTheme = program.themes?.find(
					(binding) =>
						dynamicExpression === binding.authored || dynamicExpression === `theme.${binding.path}`,
				);
				if (resolvedTheme?.resolved !== undefined) {
					const resolved = unoToken({
						...declaration,
						value: { kind: StyleValueKindTag.Literal, value: resolvedTheme.resolved },
					});
					if (resolved !== undefined) candidates.add(resolved);
				}
			}
		}
	}
	return [...candidates];
};

function hasResolvedUnoToken(
	value: string,
	resolver: UnoCssTokenResolver,
	context: AdapterParseContext,
): boolean {
	return value.split(/\s+/u).some((token) => resolver.resolve(token, context) !== undefined);
}

function staticUnoClassMaps(
	source: string,
	resolver: UnoCssTokenResolver,
	context: AdapterParseContext,
): readonly {
	readonly start: number;
	readonly end: number;
	readonly entries: readonly RegExpExecArray[];
}[] {
	const maps: Array<{
		readonly start: number;
		readonly end: number;
		readonly entries: readonly RegExpExecArray[];
	}> = [];
	for (const declaration of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g)) {
		const open = source.indexOf("{", declaration.index ?? 0);
		if (open < 0) continue;
		const block = SourcePass.matchBlock(source, open);
		if (block === null) continue;
		const entries = [
			...block.body.matchAll(
				/(?:(?:(["'])([A-Za-z_$][\w$-]*)\1)|([A-Za-z_$][\w$-]*))\s*:\s*(["'])([^"']+)\4/g,
			),
		];
		const binding = declaration[1];
		const hasClassMapBinding =
			binding !== undefined && /^(?:classes|classNames|classMap|classNameMap)$/u.test(binding);
		const hasResolvedUtility = entries.some(
			(entry) => entry[5] !== undefined && hasResolvedUnoToken(entry[5], resolver, context),
		);
		if (entries.length > 0 && (hasClassMapBinding || hasResolvedUtility))
			maps.push({ start: open, end: block.end, entries });
	}
	return maps;
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
	resolver: UnoCssTokenResolver,
	context: AdapterParseContext,
): { value: string; start: number; end: number } | undefined {
	const match = /^\s*(["'])([^"']+)\1\s*;?\s*$/u.exec(source);
	if (match?.[2] === undefined) return undefined;
	if (!hasResolvedUnoToken(match[2], resolver, context)) return undefined;
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
	const configFiles =
		context
			.listFiles?.(context.root)
			.filter((candidate) =>
				/(?:^|[\\/])(?:uno|unocss)\.config\.(?:[cm]?js|[cm]?ts)$/u.test(candidate),
			) ?? [];
	if (configFiles.length === 0)
		return {
			...fallback,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Configuration,
					text: "UnoCSS project configuration",
					hint: "no uno.config or unocss.config file was found, so the project's utility rules cannot be verified",
				},
			],
		};
	const [configPackage, corePackage] = await Promise.all([
		loader.importPackage<UnoConfigPackage>("@unocss/config", context.root),
		loader.importPackage<UnoCorePackage>("@unocss/core", context.root),
	]);
	if (configPackage?.loadConfig === undefined || corePackage?.createGenerator === undefined)
		return configFiles.length > 0
			? AdapterEvidence.configurationFailure(
					fallback,
					"UnoCSS project configuration",
					"the official UnoCSS config and generator packages are unavailable for a discovered config",
				)
			: fallback;
	try {
		const loaded = await configPackage.loadConfig(context.root, context.root);
		const generator = await corePackage.createGenerator(loaded.config);
		const theme = (loaded.config as Record<string, unknown> | undefined)?.theme as
			| Record<string, unknown>
			| undefined;
		const tokenCatalog = TokenCatalog.fromNested(theme)?.contract;
		const runtimeTokenCatalog = TokenCatalog.fromContract(tokenCatalog);
		const candidates = [
			...new Set([
				...staticUnoTokens(context.source),
				...staticUnoPropertyCandidates(context.source),
				...unoTokenCandidates(tokenCatalog),
				...styleProgramUnoCandidates(context.stylePrograms ?? [], runtimeTokenCatalog),
			]),
		];
		const generated = await generator.generate(candidates, {
			preflights: false,
			minify: true,
		});
		const officialResolver = createUnoCssResolverFromCss(generated.css);
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
				// Only generator output proves that a source utility exists in the
				// project's effective presets, rules, shortcuts, and variants.
				unoResolver: officialResolver,
				unoGeneratedCss: generated.css,
				officialConfigPackages: ["@unocss/config", "@unocss/core"],
			},
			tokenCatalog,
		};
	} catch (error) {
		return {
			...fallback,
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Configuration,
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
	const classMaps = staticUnoClassMaps(source, resolver, context);
	const insideClassMap = (start: number): boolean =>
		classMaps.some((classMap) => start >= classMap.start && start < classMap.end);
	for (const classMap of classMaps) {
		const unknown: StyleProgramResidual[] = [];
		const rules = classMap.entries.map((entry, index) => {
			const declarations: StyleDeclaration[] = [];
			const unknownTokens: string[] = [];
			for (const token of (entry[5] ?? "").split(/\s+/u).filter(Boolean)) {
				const resolved = resolver.resolve(token, context);
				if (resolved === undefined) unknownTokens.push(token);
				else declarations.push(...resolved);
			}
			unknown.push(
				...unknownTokens.map((token) => ({
					kind: StyleProgramResidualKindTag.UnknownUtility,
					text: token,
					hint: "UnoCSS utility requires the project resolver or a custom preset",
				})),
			);
			return {
				kind: StyleRuleKindTag.Style,
				name: entry[2] ?? entry[3],
				conditions: [],
				declarations,
				children: [],
				order: index,
			};
		});
		matches.push({
			start: classMap.start,
			end: classMap.end,
			program: styleProgramFromRules(rules, {
				source: {
					file: context.file,
					start: classMap.start,
					end: classMap.end,
					adapter: CodemodAdapterId.UnoCSS,
				},
				emissionHints: [StyleProgramEmissionHint.NamedClassMap],
				residuals: unknown,
			}),
			sourceText: source.slice(classMap.start, classMap.end),
		});
	}
	const attribute = /\b(className|class)\s*=\s*(?:("|')([^"']*)\2|\{\s*("|')([^"']*)\4\s*\})/g;
	for (const match of source.matchAll(attribute)) {
		const attributeStart = match.index ?? 0;
		if (excluded(attributeStart) || insideClassMap(attributeStart)) continue;
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
					kind: StyleRuleKindTag.Style,
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
				emissionHints: [StyleProgramEmissionHint.ClassString],
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
		if (insideClassMap(assignment.index ?? 0)) continue;
		const binding = assignment[1];
		const quote = assignment[2] ?? assignment[4];
		const value = assignment[3] ?? assignment[5];
		if (binding === undefined || value === undefined) continue;
		const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const isUsedAsClass = new RegExp(
			`\\b(?:className|class)\\s*=\\s*\\{\\s*${escapedBinding}\\s*\\}`,
		).test(source.slice((assignment.index ?? 0) + assignment[0].length));
		const lineStart = source.lastIndexOf("\n", assignment.index ?? 0) + 1;
		const isExported = /\bexport\s*$/u.test(source.slice(lineStart, assignment.index ?? 0));
		if (!value.includes("[") && !isUsedAsClass && !isExported) continue;
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
						kind: StyleRuleKindTag.Style,
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
					emissionHints: [StyleProgramEmissionHint.ClassString],
					residuals: unknown.map((token) => ({
						kind: "unknown-utility" as const,
						text: token,
						hint: "UnoCSS utility requires the project resolver/preset to be loaded",
					})),
				},
			),
		});
	}
	const standalone = standaloneClassLiteral(source, resolver, context);
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
						kind: StyleRuleKindTag.Style,
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
					emissionHints: [StyleProgramEmissionHint.ClassString],
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
			insideClassMap(start) ||
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
						kind: StyleRuleKindTag.Style,
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
					emissionHints: [StyleProgramEmissionHint.ClassString],
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
		if (insideClassMap(entry.index ?? 0)) continue;
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
						kind: StyleRuleKindTag.Style,
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
					emissionHints: [StyleProgramEmissionHint.ClassString],
					residuals: unknown.map((token) => ({
						kind: "unknown-utility" as const,
						text: token,
						hint: "UnoCSS utility requires the project resolver/preset to be loaded",
					})),
				},
			),
		});
	}
	for (const text of collectDynamicClassAttributes(source))
		residuals.push({
			kind: StyleProgramResidualKindTag.Dynamic,
			text,
			hint: "UnoCSS dynamic class expressions require runtime-aware target lowering",
		});
	return { matches, residuals };
}

/** UnoCSS is class/compiler driven; project presets and shortcuts are resolved through this port. */
export function createUnoCssAdapter(options: UnoCssAdapterOptions = {}): StyleAdapter {
	const fallbackResolver = options.resolver ?? { resolve: () => undefined };
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: CodemodAdapterId.UnoCSS,
		version: "2",
		configRequiresSourcePrograms: true,
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
		sourceModulesSideEffectFree: ["unocss", "@unocss/core", "@unocss/preset-wind"],
		dependencies: {
			packages: [{ name: "unocss", kind: AdapterDependencyKindTag.Development }],
		},
		capabilities: {
			schema: ADAPTER_CAPABILITIES_SCHEMA,
			adapter: CodemodAdapterId.UnoCSS,
			version: "1",
			capabilities: {
				declarations: "exact",
				"important-priority": "unsupported",
				"token-values": "partial",
				"named-rules": "exact",
				components: "unsupported",
				"framework-semantics": "exact",
				"named-conditions": "partial",
				"pseudo-conditions": "exact",
				"selector-conditions": "exact",
				"dynamic-values": "unsupported",
				"custom-properties": "exact",
			},
		},
		detect: (context) => {
			const parseContext: AdapterParseContext = {
				file: context.file,
				source: context.source,
				config: config(context),
			};
			const matched =
				detectStaticClassTarget(context.source).matched ||
				collectDynamicClassAttributes(context.source).length > 0 ||
				staticUnoClassMaps(context.source, fallbackResolver, parseContext).length > 0;
			return {
				matched,
				confidence: /@unocss\/|\bunocss\b|presetWind/.test(context.source) ? 1 : 0.55,
				evidence: matched
					? [
							collectDynamicClassAttributes(context.source).length > 0
								? "dynamic-class-attribute"
								: "literal-class-attribute",
						]
					: [],
			};
		},
		loadConfig: (context) => AdapterEvidence.normalizeConfig(config(context)),
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: async (context: AdapterConfigContext) =>
						AdapterEvidence.normalizeConfig(await officialConfig(context, moduleLoader)),
				}),
		parse: (source, context) => {
			const configuredResolver = context.config.values.unoResolver as
				| UnoCssTokenResolver
				| undefined;
			const resolver = configuredResolver ?? fallbackResolver;
			return parseUnoCss(source, context, resolver);
		},
		emit: (program, context) => {
			const tokenCatalog = TokenCatalog.fromContract(context.config.tokenCatalog);
			const resolver =
				(context.config.values.unoResolver as UnoCssTokenResolver | undefined) ?? fallbackResolver;
			const parseContext: AdapterParseContext = {
				file: context.file,
				source: "",
				config: context.config,
			};
			const namedRules = program.rules.some(
				(rule) => rule.kind === StyleRuleKindTag.Style && rule.name !== undefined,
			);
			const output = namedRules
				? emitUnoNamedMap(program, tokenCatalog, resolver, parseContext)
				: emitUnoClassTokens(program, tokenCatalog, resolver, parseContext);
			const unoConfig = context.config.values.unoConfig;
			if (unoConfig === undefined)
				return {
					...output,
					residuals: [
						...output.residuals,
						{
							kind: StyleProgramResidualKindTag.Configuration,
							text: context.file,
							hint: "UnoCSS output requires the target project's official config and generator",
						},
					],
				};
			if (!hasUnoUtilitySources(unoConfig, context.config.values.unoGeneratedCss))
				return {
					...output,
					residuals: [
						...output.residuals,
						{
							kind: StyleProgramResidualKindTag.Configuration,
							text: context.file,
							hint: "UnoCSS configuration has no presets, rules, or shortcuts to compile emitted classes",
						},
					],
				};
			return output;
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
