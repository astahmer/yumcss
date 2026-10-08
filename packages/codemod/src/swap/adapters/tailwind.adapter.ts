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
import { StyleProgramBuilder } from "../style-program-builder.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	AdapterDependencyKindTag,
	type AdapterConfigContext,
	type AdapterEmissionDecision,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type AdapterValidationResult,
	type StyleAdapter,
} from "../adapter-contract.ts";
import { ADAPTER_CAPABILITIES_SCHEMA } from "../capabilities.ts";
import {
	AdapterOfficialApiStatusTag,
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleRepresentationKind,
	StyleUtilityDecisionReason,
	StyleUtilityRepresentationKind,
} from "../identifiers.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { dirnameDocumentPath, joinDocumentPath } from "../../path-utils.ts";
import {
	collectDynamicClassAttributes,
	detectStaticClassTarget,
} from "../class-target-detection.ts";
import { DynamicClassHost } from "./class-target-dynamic.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	getHostComponentRewriter,
	preflightHostComponentDeclaration,
} from "../host-component-rewriter.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import { TokenCatalog, resolvedStyleValue } from "../tokens.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import {
	parseGeneratedCss,
	type GeneratedCssAtRule,
	type GeneratedCssNode,
} from "../generated-css-parser.ts";
import { GeneratedCssNodeKind } from "../generated-css-parser.ts";

export interface TailwindUtilityResolver {
	resolve(token: string): readonly StyleDeclaration[] | undefined;
}

export interface TailwindAdapterOptions {
	readonly resolver?: TailwindUtilityResolver;
	readonly moduleLoader?: ProjectModuleLoader | null;
}

/** Parse one candidate emitted by Tailwind's official design-system compiler. */
export function parseTailwindCandidateCss(
	css: string,
	token: string,
): readonly StyleDeclaration[] | undefined {
	return parseEngineCss(css, token);
}

const literal = (property: string, value: string | number): StyleDeclaration => ({
	conditions: [],
	property,
	value: { kind: "literal", value },
});

const importantSuffix = /\s*!important\s*$/iu;

const declarationValue = (
	value: string,
): { readonly important: boolean; readonly value: string } => ({
	important: importantSuffix.test(value),
	value: value.replace(importantSuffix, ""),
});

const cssProperty = (value: string): string =>
	value.startsWith("--")
		? value
		: value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

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

function arbitraryUtility(
	value: string,
	prefixes: readonly string[],
): readonly StyleDeclaration[] | undefined {
	const match = /^\[([^:]+):(.+)\]$/u.exec(value);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return [
		{
			...literal(
				cssProperty(match[1]),
				match[2].replace(/\\_|_/gu, (match) => (match === "_" ? " " : "_")),
			),
			conditions: prefixes.map(authoredVariantCondition),
		},
	];
}

function defaultResolve(token: string): readonly StyleDeclaration[] | undefined {
	const prefixes = splitUtilityToken(token);
	if (prefixes.length === 1) return arbitraryUtility(token, []);
	const utility = prefixes.pop();
	if (utility === undefined) return undefined;
	return arbitraryUtility(utility, prefixes);
}

/**
 * A generated YumCSS interop artifact is enough to parse a static Tailwind
 * class without booting Tailwind's compiler. The bridge carries the resolved
 * declaration for each base utility; generated variants supply the condition
 * names around it. This is the deterministic path used by corpus tooling,
 * while the official loader remains authoritative when no artifact exists.
 */
function resolverFromInteropMeta(
	meta: AdapterParseContext["meta"],
): TailwindUtilityResolver | undefined {
	if (meta?.bridgeInverse === undefined || meta.bridgeInverse.size === 0) return undefined;
	return {
		resolve(token) {
			const parts = splitUtilityToken(token);
			const utility = parts.pop();
			if (utility === undefined) return undefined;
			if (parts.some((variant) => !meta.variants.has(variant))) return undefined;
			const conditions = parts.map(authoredVariantCondition);
			const entry = meta.bridgeInverse.get(utility);
			if (entry !== undefined)
				return [
					{
						conditions,
						property: cssProperty(entry.property),
						value: { kind: StyleValueKindTag.Literal, value: entry.value },
					},
				];
			let prefix: string | undefined;
			let value = "";
			for (const candidate of meta.conflicts.keys()) {
				if (
					utility === candidate ||
					(utility.startsWith(`${candidate}-`) && candidate.length > (prefix?.length ?? 0))
				) {
					prefix = candidate;
					value = utility === candidate ? "" : utility.slice(candidate.length + 1);
				}
			}
			if (prefix === undefined || value === "") return undefined;
			const typedValue = meta.keysByBase
				.get(prefix)
				?.some((key) =>
					key.valueType === undefined
						? false
						: meta.valueLiterals.get(key.valueType)?.has(value) === true,
				);
			if (typedValue !== true) return undefined;
			const properties = meta.conflicts.get(prefix)?.[value] ?? meta.conflicts.get(prefix)?.["*"];
			if (properties === undefined) return undefined;
			return properties.map((property) => ({
				conditions,
				property: cssProperty(property),
				value: { kind: StyleValueKindTag.Literal, value },
			}));
		},
	};
}

function openingTagForAttribute(
	source: string,
	attributeStart: number,
): { readonly start: number; readonly end: number; readonly text: string } | undefined {
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

function staticClassAttributes(source: string): readonly RegExpExecArray[] {
	return [
		...source.matchAll(
			/\b(className|class)\s*=\s*(?:(['"])([^'"]*)\2|\{\s*(['"])([^'"]*)\4\s*\})/g,
		),
	];
}

function classBindingAttributes(source: string): readonly RegExpExecArray[] {
	return [...source.matchAll(/\b(className|class)\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g)];
}

function staticClassAssignments(source: string): readonly RegExpExecArray[] {
	return [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'])([^"']*)\2/g)];
}

function standaloneClassLiteral(
	source: string,
	resolver: TailwindUtilityResolver,
): { value: string; start: number; end: number } | undefined {
	const match = /^\s*(["'])([^"']+)\1\s*;?\s*$/u.exec(source);
	if (match?.[2] === undefined) return undefined;
	if (!match[2].split(/\s+/u).some((token) => resolver.resolve(token) !== undefined))
		return undefined;
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

function staticClassValue(source: string, binding: string): string | undefined {
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*(["'])([^"']*)\\1`).exec(
		source,
	)?.[2];
}

function parseClassValue(
	value: string,
	context: AdapterParseContext,
	resolver: TailwindUtilityResolver,
	start: number,
	end: number,
	residuals: readonly StyleProgramResidual[] = [],
): AdapterParseResult["matches"][number] {
	const declarations: StyleDeclaration[] = [];
	const unknown: string[] = [];
	for (const token of value.split(/\s+/u).filter(Boolean)) {
		const resolved = resolver.resolve(token);
		if (resolved === undefined) unknown.push(token);
		else declarations.push(...resolved);
	}
	const tokenCatalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	return {
		start,
		end,
		program: StyleProgramBuilder.create({
			source: {
				file: context.file,
				start,
				end,
				adapter: CodemodAdapterId.Tailwind,
			},
			residuals: [
				...residuals,
				...unknown.map((token) => ({
					kind: "unknown-utility" as const,
					text: token,
					hint: "Tailwind utility requires the project engine or a custom preset",
				})),
			],
		})
			.style(materializeTailwindTokens(declarations, tokenCatalog))
			.build(),
		sourceText: value,
	};
}

const tailwindTokenNamespaces: Readonly<Record<string, string>> = {
	colors: "color",
	spacing: "spacing",
	radii: "radius",
	fontSizes: "font-size",
	fontWeights: "font-weight",
	lineHeights: "leading",
	letterSpacings: "tracking",
	fonts: "font",
	shadows: "shadow",
};

function materializeTailwindToken(
	declaration: StyleDeclaration,
	catalog: TokenCatalog | undefined,
): StyleDeclaration {
	if (catalog === undefined || declaration.value.kind !== StyleValueKindTag.Literal)
		return declaration;
	if (typeof declaration.value.value !== "string") return declaration;
	const variable = /^var\(--(.+)\)$/u.exec(declaration.value.value)?.[1];
	if (variable === undefined) return declaration;
	const namespace = Object.values(tailwindTokenNamespaces)
		.toSorted((left, right) => right.length - left.length)
		.find((candidate) => variable.startsWith(`${candidate}-`));
	const group = Object.entries(tailwindTokenNamespaces).find(
		([, value]) => value === namespace,
	)?.[0];
	const tokenKey = namespace === undefined ? undefined : variable.slice(namespace.length + 1);
	if (group === undefined || tokenKey === undefined || tokenKey === "") return declaration;
	const match = catalog.findByReference([group], tokenKey.replaceAll("-", "."));
	return match === undefined
		? declaration
		: {
				...declaration,
				value: {
					kind: StyleValueKindTag.Token,
					ref: match.ref,
					authored: match.authored,
					resolved: match.resolved,
				},
			};
}

function materializeTailwindTokens(
	declarations: readonly StyleDeclaration[],
	catalog: TokenCatalog | undefined,
): readonly StyleDeclaration[] {
	return declarations.map((declaration) => materializeTailwindToken(declaration, catalog));
}

function collectTailwindDynamicClassAttributes(source: string): readonly string[] {
	const attributes = collectDynamicClassAttributes(source);
	if (!/\bfrom\s*["']yumcss(?:["']|\/)/u.test(source)) return attributes;
	const yumcssStyleCarrier = /\b(?:tw|d?css)\s*(?:\(|\.(?:class|vars|props|group|input|raw)\s*\()/u;
	return attributes.filter((attribute) => !yumcssStyleCarrier.test(attribute));
}

function standaloneClassMap(
	source: string,
	resolver: TailwindUtilityResolver,
):
	| { readonly start: number; readonly end: number; readonly entries: readonly RegExpExecArray[] }
	| undefined {
	const outer = /^\s*\{([\s\S]*)\}\s*;?\s*$/u.exec(source);
	if (outer?.[1] === undefined) return undefined;
	const entries = [
		...outer[1].matchAll(/(["'])([A-Za-z_$][\w$-]*)\1\s*:\s*(["'])([^"']+)\3/g),
	].filter(
		(entry) =>
			entry[4] !== undefined &&
			entry[4].split(/\s+/u).some((token) => resolver.resolve(token) !== undefined),
	);
	if (entries.length === 0 || entries.some((entry) => entry[4] === undefined)) return undefined;
	const start = source.indexOf("{");
	return start < 0 ? undefined : { start, end: start + outer[0].trim().length, entries };
}

function assignedClassMap(
	source: string,
	resolver: TailwindUtilityResolver,
):
	| { readonly start: number; readonly end: number; readonly entries: readonly RegExpExecArray[] }
	| undefined {
	for (const match of source.matchAll(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\{/g)) {
		const open = source.indexOf("{", match.index ?? 0);
		if (open < 0) continue;
		const block = SourcePass.matchBlock(source, open);
		if (block === null) continue;
		const entries = [
			...block.body.matchAll(/(["'])([A-Za-z_$][\w$-]*)\1\s*:\s*(["'])([^"']+)\3/g),
		].filter(
			(entry) =>
				entry[4] !== undefined &&
				entry[4].split(/\s+/u).some((token) => resolver.resolve(token) !== undefined),
		);
		if (entries.length === 0 || entries.some((entry) => entry[4] === undefined)) continue;
		return { start: open, end: block.end, entries };
	}
	return undefined;
}

function parseTailwind(
	source: string,
	context: AdapterParseContext,
	resolver: TailwindUtilityResolver,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: StyleProgramResidual[] = [...(context.config.residuals ?? [])];
	const tokenCatalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	const excluded = context.document?.isExcluded ?? (() => false);
	const classMap = standaloneClassMap(source, resolver) ?? assignedClassMap(source, resolver);
	if (classMap !== undefined) {
		const parsedEntries = classMap.entries.map(
			(entry) =>
				parseClassValue(entry[4] ?? "", context, resolver, classMap.start, classMap.end).program,
		);
		const rules = parsedEntries.map((parsed, index) => {
			const entry = classMap.entries[index]!;
			const rule = parsed.rules[0];
			if (rule === undefined)
				return {
					kind: StyleRuleKindTag.Style,
					name: entry[2],
					conditions: [],
					declarations: [],
					children: [],
					order: index,
				};
			return { ...rule, name: entry[2], order: index };
		});
		residuals.push(...parsedEntries.flatMap((parsed) => parsed.residuals));
		const parsed = styleProgramFromRules(rules, {
			source: {
				file: context.file,
				start: classMap.start,
				end: classMap.end,
				adapter: CodemodAdapterId.Tailwind,
			},
		});
		return {
			matches: [
				{
					start: classMap.start,
					end: classMap.end,
					program: parsed,
					sourceText: source.slice(classMap.start, classMap.end),
				},
			],
			residuals,
		};
	}
	for (const attribute of staticClassAttributes(source)) {
		const attributeStart = attribute.index ?? 0;
		if (excluded(attributeStart)) continue;
		const name = attribute[1];
		const value = attribute[3] ?? attribute[5] ?? "";
		const openingTag = openingTagForAttribute(source, attributeStart);
		if (name === undefined || openingTag === undefined || value.trim() === "") continue;
		const declarations: StyleDeclaration[] = [];
		const unknown: string[] = [];
		for (const token of value.split(/\s+/u).filter(Boolean)) {
			const resolved = resolver.resolve(token);
			if (resolved === undefined) unknown.push(token);
			else declarations.push(...resolved);
		}
		const program = styleProgramFromRules(
			[
				{
					kind: StyleRuleKindTag.Style,
					conditions: [],
					declarations: materializeTailwindTokens(declarations, tokenCatalog),
					children: [],
					order: 0,
				},
			],
			{
				source: {
					file: context.file,
					start: openingTag.start,
					end: openingTag.end,
					adapter: CodemodAdapterId.Tailwind,
					framework: context.document?.framework,
					hostAttribute: name,
					hostOpenTag: openingTag.text,
					hostStyleAttributes: [attribute[0]!],
				},
				residuals: unknown.map((token) => ({
					kind: StyleProgramResidualKindTag.UnknownUtility,
					text: token,
					hint: "Tailwind utility requires the project engine or a custom preset",
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
	const boundNames = new Set(
		classBindingAttributes(source)
			.map((attribute) => attribute[2])
			.filter((binding): binding is string => binding !== undefined),
	);
	for (const attribute of classBindingAttributes(source)) {
		const attributeStart = attribute.index ?? 0;
		const binding = attribute[2];
		if (binding === undefined || excluded(attributeStart)) continue;
		const value = staticClassValue(source, binding);
		const openingTag = openingTagForAttribute(source, attributeStart);
		if (value === undefined || openingTag === undefined) continue;
		const match = parseClassValue(value, context, resolver, openingTag.start, openingTag.end);
		matches.push({
			...match,
			program: {
				...match.program,
				source: {
					...match.program.source,
					hostAttribute: attribute[0],
					hostOpenTag: openingTag.text,
					hostStyleAttributes: [attribute[0]!],
				},
			},
			sourceText: openingTag.text,
		});
	}
	for (const assignment of staticClassAssignments(source)) {
		const binding = assignment[1];
		const quote = assignment[2];
		const value = assignment[3];
		if (
			binding === undefined ||
			value === undefined ||
			boundNames.has(binding) ||
			(!value.includes("[") &&
				!value.split(/\s+/u).some((token) => resolver.resolve(token) !== undefined))
		)
			continue;
		const valueStart =
			(assignment.index ?? 0) + assignment[0].lastIndexOf(`${quote ?? '"'}${value}`);
		matches.push(
			parseClassValue(value, context, resolver, valueStart, valueStart + value.length + 2),
		);
	}
	const standalone = standaloneClassLiteral(source, resolver);
	if (standalone !== undefined)
		matches.push(
			parseClassValue(standalone.value, context, resolver, standalone.start, standalone.end),
		);
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
		matches.push(parseClassValue(value, context, resolver, start, start + value.length + 2));
	}
	for (const text of collectTailwindDynamicClassAttributes(source))
		residuals.push({
			kind: StyleProgramResidualKindTag.Dynamic,
			text,
			hint: "Tailwind dynamic class expressions require runtime-aware target lowering",
		});
	return { matches, residuals };
}

function utilityValue(value: string | number | boolean): string {
	return String(value)
		.replaceAll("_", "\\_")
		.replaceAll(" ", "_")
		.replaceAll("[", "\\[")
		.replaceAll("]", "\\]");
}

function utilityCondition(conditionValue: StyleCondition): string {
	if (conditionValue.kind === SemanticConditionKindTag.Pseudo) return `${conditionValue.name}:`;
	if (conditionValue.kind === SemanticConditionKindTag.Selector) {
		const selector = conditionValue.value ?? conditionValue.name;
		return `[&${selector.startsWith("&") ? selector.slice(1) : selector}]:`;
	}
	if (
		conditionValue.kind === SemanticConditionKindTag.Media &&
		conditionValue.value !== undefined
	) {
		if (conditionValue.name === "print" && conditionValue.value === "print") return "print:";
		const authored = conditionValue.value.startsWith("@media ")
			? conditionValue.value
			: `@media ${conditionValue.value}`;
		return `[${authored.replace(/\s+/gu, "_")}]:`;
	}
	return `${conditionValue.name}:`;
}

// Tailwind's official design-system path does not need this vocabulary. It is
// kept only for the resolve-only/browser fallback, where no project engine can
// enumerate the configured candidates.
const fallbackTailwindTokenGroups: Readonly<Record<string, string>> = {
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
	paddingInlineStart: "spacing",
	paddingInlineEnd: "spacing",
	margin: "spacing",
	marginInline: "spacing",
	marginBlock: "spacing",
	marginInlineStart: "spacing",
	marginInlineEnd: "spacing",
	gap: "spacing",
	width: "spacing",
	height: "spacing",
	minWidth: "spacing",
	maxWidth: "spacing",
	minHeight: "spacing",
	maxHeight: "spacing",
};

function tailwindTokenUtility(
	declaration: StyleDeclaration,
	catalog: TokenCatalog | undefined,
): string | undefined {
	const resolved = resolvedStyleValue(declaration.value);
	if (catalog === undefined || resolved === undefined) return undefined;
	const property = declaration.property;
	const group = fallbackTailwindTokenGroups[property];
	const match = group === undefined ? undefined : catalog.findUnique([group], String(resolved));
	if (match === undefined) return undefined;
	const key = match.ref.replaceAll(".", "-");
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
		paddingInlineStart: "ps",
		paddingInlineEnd: "pe",
		margin: "m",
		marginInline: "mx",
		marginBlock: "my",
		marginInlineStart: "ms",
		marginInlineEnd: "me",
		gap: "gap",
		width: "w",
		height: "h",
		minWidth: "min-w",
		maxWidth: "max-w",
		minHeight: "min-h",
		maxHeight: "max-h",
	};
	return `${prefixes[property]}-${key}`;
}

type TailwindOfficialUtilityResolver = TailwindUtilityResolver & {
	readonly candidates: () => readonly string[];
};

type TailwindImportantSyntax = "prefix" | "suffix";

/**
 * Tailwind owns the utility vocabulary. When its design system is loaded,
 * enumerate the candidates it actually registered and let its compiler verify
 * the declaration. The syntax fallback below remains for injected resolvers
 * that expose only `resolve` and therefore cannot enumerate candidates.
 */
function officialTailwindUtility(
	declaration: StyleDeclaration,
	prefix: string,
	resolver: TailwindUtilityResolver | undefined,
	catalog: TokenCatalog | undefined,
	importantSyntax: TailwindImportantSyntax,
): string | undefined {
	const official = resolver as TailwindOfficialUtilityResolver | undefined;
	const candidates = official?.candidates?.();
	if (official === undefined || candidates === undefined) return undefined;
	const matches = candidates
		.filter((candidate) => !candidate.includes(":"))
		.flatMap((candidate) => {
			const spellings = importantUtilitySpellings(
				candidate,
				declaration.important === true,
				importantSyntax,
			);
			return spellings.flatMap((spelling, priorityOrder) =>
				equivalentTailwindDeclaration(
					official.resolve(`${prefix}${spelling}`),
					declaration,
					catalog,
				)
					? [{ base: candidate, spelling, priorityOrder }]
					: [],
			);
		});
	return matches
		.toSorted(
			(left, right) =>
				Number(left.base.includes("[")) - Number(right.base.includes("[")) ||
				left.base.length - right.base.length ||
				left.base.localeCompare(right.base) ||
				left.priorityOrder - right.priorityOrder,
		)
		.at(0)?.spelling;
}

function equivalentTailwindDeclaration(
	candidate: readonly StyleDeclaration[] | undefined,
	declaration: StyleDeclaration,
	catalog: TokenCatalog | undefined,
): boolean {
	const materialized =
		candidate === undefined ? undefined : materializeTailwindTokens(candidate, catalog);
	if (materialized?.length !== 1) return false;
	const resolved = resolvedStyleValue(materialized[0]!.value);
	const expected = resolvedStyleValue(declaration.value);
	if (resolved === undefined || expected === undefined || String(resolved) !== String(expected))
		return false;
	const actual = materialized[0]!;
	return (
		actual.property === declaration.property &&
		(actual.important === true) === (declaration.important === true) &&
		JSON.stringify(actual.conditions) === JSON.stringify(declaration.conditions)
	);
}

const importantUtilitySpellings = (
	candidate: string,
	important: boolean,
	syntax: TailwindImportantSyntax,
): readonly string[] => {
	if (!important) return [candidate];
	return syntax === "prefix"
		? [`!${candidate}`, `${candidate}!`]
		: [`${candidate}!`, `!${candidate}`];
};

function tailwindPropertyAwareUtility(
	declaration: StyleDeclaration,
	catalog?: TokenCatalog,
): string | undefined {
	const resolved = resolvedStyleValue(declaration.value);
	if (resolved === undefined) return undefined;
	const backgroundToken =
		declaration.property === "background"
			? catalog?.findUnique(["colors"], String(resolved))
			: undefined;
	const value =
		backgroundToken === undefined
			? utilityValue(resolved)
			: `var(--color-${backgroundToken.ref.replaceAll(".", "-")})`;
	const candidates: Readonly<Record<string, string>> = {
		padding: `p-[${value}]`,
		paddingInline: `px-[${value}]`,
		paddingBlock: `py-[${value}]`,
		paddingInlineStart: `ps-[${value}]`,
		paddingInlineEnd: `pe-[${value}]`,
		paddingTop: `pt-[${value}]`,
		paddingRight: `pr-[${value}]`,
		paddingBottom: `pb-[${value}]`,
		paddingLeft: `pl-[${value}]`,
		margin: `m-[${value}]`,
		marginInline: `mx-[${value}]`,
		marginBlock: `my-[${value}]`,
		marginInlineStart: `ms-[${value}]`,
		marginInlineEnd: `me-[${value}]`,
		marginTop: `mt-[${value}]`,
		marginRight: `mr-[${value}]`,
		marginBottom: `mb-[${value}]`,
		marginLeft: `ml-[${value}]`,
		gap: `gap-[${value}]`,
		rowGap: `gap-y-[${value}]`,
		columnGap: `gap-x-[${value}]`,
		backgroundColor: `bg-[${value}]`,
		background: `[background:${value}]`,
		color: `text-[${value}]`,
		borderRadius: `rounded-[${value}]`,
		borderTopLeftRadius: `rounded-tl-[${value}]`,
		borderTopRightRadius: `rounded-tr-[${value}]`,
		borderBottomRightRadius: `rounded-br-[${value}]`,
		borderBottomLeftRadius: `rounded-bl-[${value}]`,
		borderStartStartRadius: `rounded-ss-[${value}]`,
		borderStartEndRadius: `rounded-se-[${value}]`,
		borderEndEndRadius: `rounded-ee-[${value}]`,
		borderEndStartRadius: `rounded-es-[${value}]`,
		width: `w-[${value}]`,
		height: `h-[${value}]`,
		minWidth: `min-w-[${value}]`,
		maxWidth: `max-w-[${value}]`,
		minHeight: `min-h-[${value}]`,
		maxHeight: `max-h-[${value}]`,
	};
	return candidates[declaration.property];
}

function emitTailwind(
	program: StyleProgram,
	catalog?: TokenCatalog,
	resolver?: TailwindUtilityResolver,
	importantSyntax: TailwindImportantSyntax = "suffix",
): {
	text: string;
	emissionDecisions: readonly AdapterEmissionDecision[];
	residuals: readonly StyleProgramResidual[];
} {
	const residuals: StyleProgramResidual[] = [];
	const emissionDecisions: AdapterEmissionDecision[] = [];
	for (const rule of StyleProgramAnalysis.rules(program)) {
		if (rule.kind !== StyleRuleKindTag.Style) {
			residuals.push({
				kind: "rule-level",
				text: rule.kind,
				hint: "Tailwind class output supports style declarations and nested conditions only",
			});
		}
	}
	const declarations = StyleProgramAnalysis.declarations(program);
	const tokens: string[] = [];
	for (const declaration of declarations) {
		const resolved = resolvedStyleValue(declaration.value);
		if (resolved === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Dynamic,
				text: declaration.property,
				hint: "Tailwind output requires a literal declaration or a host runtime carrier",
			});
			continue;
		}
		const prefix = declaration.conditions.map(utilityCondition).join("");
		const official = officialTailwindUtility(
			declaration,
			prefix,
			resolver,
			catalog,
			importantSyntax,
		);
		const namedBase = tailwindTokenUtility(declaration, catalog);
		const named =
			namedBase === undefined
				? undefined
				: importantUtilitySpellings(namedBase, declaration.important === true, importantSyntax)[0];
		const propertyAwareBase = tailwindPropertyAwareUtility(declaration, catalog);
		const propertyAware =
			propertyAwareBase === undefined
				? undefined
				: importantUtilitySpellings(
						propertyAwareBase,
						declaration.important === true,
						importantSyntax,
					)[0];
		let selected = false;
		for (const candidate of [official, named === official ? undefined : named, propertyAware]) {
			if (candidate === undefined) continue;
			if (resolver === undefined && candidate !== named) continue;
			const fullCandidate = `${prefix}${candidate}`;
			if (
				resolver === undefined ||
				equivalentTailwindDeclaration(resolver.resolve(fullCandidate), declaration, catalog)
			) {
				tokens.push(fullCandidate);
				emissionDecisions.push({
					representation:
						candidate === named || candidate === official
							? StyleUtilityRepresentationKind.Token
							: StyleUtilityRepresentationKind.PropertyAware,
					candidate: fullCandidate,
					property: declaration.property,
					value: resolved,
					verified: candidate === named || resolver !== undefined,
					reason:
						candidate === named || candidate === official
							? StyleUtilityDecisionReason.ExactToken
							: StyleUtilityDecisionReason.VerifiedPropertyAware,
				});
				selected = true;
				break;
			}
		}
		if (selected) continue;
		const fallbackUtility = `[${declaration.property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${utilityValue(resolved)}]`;
		const fallback = `${prefix}${
			importantUtilitySpellings(fallbackUtility, declaration.important === true, importantSyntax)[0]
		}`;
		tokens.push(fallback);
		emissionDecisions.push({
			representation: StyleUtilityRepresentationKind.ArbitraryProperty,
			candidate: fallback,
			property: declaration.property,
			value: resolved,
			verified: false,
			reason: declaration.property.startsWith("--")
				? StyleUtilityDecisionReason.CustomProperty
				: resolver === undefined
					? StyleUtilityDecisionReason.OfficialVerificationUnavailable
					: propertyAware === undefined
						? StyleUtilityDecisionReason.UnsupportedValue
						: StyleUtilityDecisionReason.CanonicalCssMismatch,
		});
	}
	return {
		text: JSON.stringify([...new Set(tokens)].join(" ")),
		emissionDecisions,
		residuals,
	};
}

function config(context: AdapterConfigContext): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Tailwind,
		root: context.root,
		files: [],
		values: {},
	};
}

type TailwindEnginePackage = {
	__unstable__loadDesignSystem?: unknown;
};

type TailwindLoadDesignSystem = (
	css: string,
	options: { readonly base: string },
) => Promise<unknown>;

type TailwindDesignSystem = {
	candidatesToCss(candidates: readonly string[]): readonly (string | null)[];
	getClassList?: () => readonly (readonly [string, unknown])[];
	theme?: {
		entries(): Iterable<readonly [string, { readonly value?: string }]>;
	};
};

const TAILWIND_OFFICIAL_API = {
	LoadDesignSystem: "@tailwindcss/node.__unstable__loadDesignSystem",
} as const;

const TAILWIND_OFFICIAL_API_STATUS = {
	Unavailable: "unavailable",
	Incompatible: "incompatible",
	Available: "available",
	Verified: "verified",
	Failed: "failed",
} as const;

type TailwindOfficialApiProbe = {
	readonly api: typeof TAILWIND_OFFICIAL_API.LoadDesignSystem;
	readonly status: (typeof TAILWIND_OFFICIAL_API_STATUS)[keyof typeof TAILWIND_OFFICIAL_API_STATUS];
	readonly detail?: string;
};

const tailwindApiProbe = (
	status: TailwindOfficialApiProbe["status"],
	detail?: string,
): TailwindOfficialApiProbe => ({
	api: TAILWIND_OFFICIAL_API.LoadDesignSystem,
	status,
	...(detail === undefined ? {} : { detail }),
});

function isTailwindLoadDesignSystem(value: unknown): value is TailwindLoadDesignSystem {
	return typeof value === "function";
}

function isTailwindDesignSystem(value: unknown): value is TailwindDesignSystem {
	if (typeof value !== "object" || value === null) return false;
	const system = value as Record<string, unknown>;
	if (typeof system.candidatesToCss !== "function") return false;
	if (system.getClassList !== undefined && typeof system.getClassList !== "function") return false;
	if (system.theme === undefined) return true;
	return (
		typeof system.theme === "object" &&
		system.theme !== null &&
		typeof (system.theme as { entries?: unknown }).entries === "function"
	);
}

type TailwindClassicConfig = Record<string, unknown>;

type TailwindClassicPlugin = (config?: TailwindClassicConfig) => unknown;

type TailwindClassicPostCss = (plugins?: readonly unknown[]) => {
	process(input: string, options: { readonly from: string }): Promise<{ readonly css: string }>;
};

type TailwindClassicResolveConfig = (config: TailwindClassicConfig) => Record<string, unknown>;

const TAILWIND_THEME_VARIABLE = /var\((--[A-Za-z0-9_-]+)(?:,\s*([^)]*))?\)/gu;
const TAILWIND_LENGTH = /^(-?(?:\d+|\d*\.\d+))(rem|em|px|%)$/u;
const TAILWIND_SPACING_CALC = /^calc\(\s*var\(--spacing\)\s*\*\s*(-?(?:\d+|\d*\.\d+))\s*\)$/u;

function tailwindThemeValues(system: TailwindDesignSystem): Map<string, string> {
	return new Map(
		[...(system.theme?.entries() ?? [])].flatMap(([variable, entry]) =>
			entry.value === undefined ? [] : [[variable, entry.value] as const],
		),
	);
}

function resolveTailwindThemeValue(value: string, theme: ReadonlyMap<string, string>): string {
	let current = value;
	for (let index = 0; index < 8; index++) {
		const next = current.replace(TAILWIND_THEME_VARIABLE, (match, name, fallback) => {
			const resolved = theme.get(name);
			return resolved ?? (fallback === undefined ? match : fallback.trim());
		});
		if (next === current) break;
		current = next;
	}
	const calc = current.match(/^calc\(\s*([^*]+?)\s*\*\s*([^)]*?)\s*\)$/u);
	if (calc?.[1] === undefined || calc[2] === undefined) return current;
	const left = calc[1].trim().match(TAILWIND_LENGTH);
	const right = Number(calc[2].trim());
	if (left === null || !Number.isFinite(right)) return current;
	return `${Number(left[1]) * right}${left[2]}`;
}

function resolveTailwindDeclarations(
	declarations: readonly StyleDeclaration[] | undefined,
	theme: ReadonlyMap<string, string>,
): readonly StyleDeclaration[] | undefined {
	if (declarations === undefined) return undefined;
	return declarations.map((declaration) => {
		if (declaration.value.kind !== StyleValueKindTag.Literal) return declaration;
		if (typeof declaration.value.value !== "string") return declaration;
		const value = resolveTailwindThemeValue(declaration.value.value, theme);
		return value === declaration.value.value
			? declaration
			: { ...declaration, value: { ...declaration.value, value } };
	});
}

function spacingTokenFromCssValue(
	value: string,
	theme: ReadonlyMap<string, string>,
): { readonly key: string; readonly value: string } | undefined {
	const match = value.match(TAILWIND_SPACING_CALC);
	if (match?.[1] === undefined) return undefined;
	const factor = Number(match[1]);
	if (!Number.isFinite(factor) || factor < 0) return undefined;
	const resolved = resolveTailwindThemeValue(value, theme);
	return resolved === value ? undefined : { key: String(factor), value: resolved };
}

function tailwindTokenCatalog(
	system: TailwindDesignSystem,
	candidates: readonly string[] = system.getClassList?.().map(([candidate]) => candidate) ?? [],
	compiled: readonly (string | null)[] = [],
	theme = tailwindThemeValues(system),
) {
	const groups: Record<string, Record<string, string>> = {};
	const groupNames: Readonly<Record<string, string>> = {
		color: "colors",
		spacing: "spacing",
		radius: "radii",
		"font-size": "fontSizes",
		"font-weight": "fontWeights",
		leading: "lineHeights",
		tracking: "letterSpacings",
		font: "fonts",
		shadow: "shadows",
	};
	for (const [variable, entry] of system.theme?.entries() ?? []) {
		const match =
			/^--(color|spacing|radius|font-size|font-weight|leading|tracking|font|shadow)-(.+)$/u.exec(
				variable,
			);
		const group = match?.[1] === undefined ? undefined : groupNames[match[1]];
		if (group === undefined || match?.[2] === undefined || entry.value === undefined) continue;
		(groups[group] ??= {})[match[2]] = entry.value;
	}
	for (let index = 0; index < candidates.length; index++) {
		const declarations = parseEngineCss(compiled[index] ?? "", candidates[index]!);
		for (const declaration of declarations ?? []) {
			if (declaration.value.kind !== StyleValueKindTag.Literal) continue;
			if (typeof declaration.value.value !== "string") continue;
			const spacing = spacingTokenFromCssValue(declaration.value.value, theme);
			if (spacing !== undefined) (groups.spacing ??= {})[spacing.key] ??= spacing.value;
		}
	}
	return TokenCatalog.fromGroups(groups);
}

function generatedAtRuleCondition(rule: GeneratedCssAtRule): StyleCondition | undefined {
	const params = rule.params.trim();
	if (params === "") return undefined;
	if (rule.name === "media") return { kind: "media", name: params, value: params };
	if (rule.name === "supports") return { kind: "supports", name: params, value: params };
	if (rule.name === "container") return { kind: "container", name: params, value: params };
	if (rule.name === "scope") return { kind: "selector", name: "scope", value: params };
	return undefined;
}

function escapeGeneratedClassName(value: string): string {
	let escaped = "";
	for (let index = 0; index < value.length; index++) {
		const character = value[index]!;
		if (index === 0 && /[0-9]/u.test(character)) {
			escaped += `\\${character.codePointAt(0)!.toString(16)} `;
		} else if (/[A-Za-z0-9_-]/u.test(character)) {
			escaped += character;
		} else {
			escaped += `\\${character}`;
		}
	}
	return escaped;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasDefaultExport = (value: unknown): value is { readonly default?: unknown } =>
	isRecord(value) && "default" in value;

function defaultExport<T>(value: unknown): T | undefined {
	if (hasDefaultExport(value)) {
		const defaultValue = value.default;
		return defaultValue === undefined ? undefined : (defaultValue as T);
	}
	return value as T;
}

function record(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function classicConfigFiles(context: AdapterConfigContext): readonly string[] {
	if (context.root === undefined) return [];
	const names = /(?:^|\/)tailwind\.config\.(?:c|m)?(?:j|t)s$/u;
	return (context.listFiles?.(context.root) ?? [])
		.map((file) => (file.startsWith("/") ? file : joinDocumentPath(context.root!, file)))
		.filter((file) => names.test(file))
		.toSorted();
}

function classicContentFiles(context: AdapterConfigContext): readonly string[] {
	if (context.root === undefined) return [];
	const extensions = /\.(?:astro|html|js|jsx|md|mdx|svelte|tsx?|vue)$/u;
	return (context.listFiles?.(context.root) ?? [])
		.map((file) => (file.startsWith("/") ? file : joinDocumentPath(context.root!, file)))
		.filter((file) => extensions.test(file))
		.filter((file) => !/(?:^|\/)tailwind\.config\.(?:c|m)?(?:j|t)s$/u.test(file))
		.toSorted();
}

function unescapeGeneratedClassName(value: string): string {
	return value
		.replace(/\\([0-9a-f]{1,6})(?:\s)?/giu, (_match, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/\\(.)/gu, "$1");
}

function generatedClassNames(selector: string): readonly string[] {
	const names = new Set<string>();
	for (const match of selector.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/gu)) {
		const encoded = match[1];
		if (encoded !== undefined) names.add(unescapeGeneratedClassName(encoded));
	}
	return [...names];
}

function parseClassicTailwindCss(css: string): TailwindOfficialUtilityResolver {
	const declarationsByCandidate = new Map<string, readonly StyleDeclaration[]>();
	const append = (candidate: string, declarations: readonly StyleDeclaration[]): void => {
		if (declarations.length === 0) return;
		const existing = declarationsByCandidate.get(candidate) ?? [];
		declarationsByCandidate.set(candidate, [...existing, ...declarations]);
	};
	const collect = (
		nodes: readonly GeneratedCssNode[],
		candidate: string,
		conditions: readonly StyleCondition[],
	): void => {
		const declarations: StyleDeclaration[] = [];
		for (const node of nodes) {
			if (node.type === GeneratedCssNodeKind.Declaration) {
				const property = node.prop.trim();
				const value = node.value.trim();
				const parsedValue = declarationValue(value);
				if (property !== "" && parsedValue.value !== "")
					declarations.push({
						...literal(cssProperty(property), parsedValue.value),
						conditions,
						...(parsedValue.important ? { important: true } : {}),
					});
				continue;
			}
			if (node.type === GeneratedCssNodeKind.AtRule) {
				const condition = generatedAtRuleCondition(node);
				collect(
					node.nodes,
					candidate,
					condition === undefined ? conditions : [...conditions, condition],
				);
				continue;
			}
			collect(node.nodes, candidate, [
				...conditions,
				...generatedSelectorConditions(node.selector, candidate),
			]);
		}
		append(candidate, declarations);
	};
	const visit = (
		nodes: readonly GeneratedCssNode[],
		conditions: readonly StyleCondition[],
	): void => {
		for (const node of nodes) {
			if (node.type === GeneratedCssNodeKind.AtRule) {
				const condition = generatedAtRuleCondition(node);
				visit(node.nodes, condition === undefined ? conditions : [...conditions, condition]);
				continue;
			}
			if (node.type !== GeneratedCssNodeKind.Rule) continue;
			for (const candidate of generatedClassNames(node.selector))
				collect(node.nodes, candidate, [
					...conditions,
					...generatedSelectorConditions(node.selector, candidate),
				]);
		}
	};
	visit(parseGeneratedCss(css), []);
	return {
		resolve: (token) => declarationsByCandidate.get(token),
		candidates: () => [...declarationsByCandidate.keys()],
	};
}

function classicTokenCatalog(
	config: TailwindClassicConfig,
	resolveConfig: TailwindClassicResolveConfig | undefined,
) {
	if (resolveConfig === undefined) return undefined;
	const resolved = resolveConfig({ ...config, content: [] });
	const theme = record(resolved.theme);
	return TokenCatalog.fromNested({
		colors: theme.colors,
		spacing: theme.spacing,
		radii: theme.borderRadius,
		fontSizes: theme.fontSize,
		fontWeights: theme.fontWeight,
		lineHeights: theme.lineHeight,
		letterSpacings: theme.letterSpacing,
		fonts: theme.fontFamily,
		shadows: theme.boxShadow,
	})?.contract;
}

function generatedSelectorConditions(selector: string, token: string): readonly StyleCondition[] {
	const normalized = selector.trim();
	const classMarker = `.${escapeGeneratedClassName(token)}`;
	const classStart = normalized.indexOf(classMarker);
	if (classStart >= 0) {
		const relative =
			normalized.slice(0, classStart) + "&" + normalized.slice(classStart + classMarker.length);
		if (relative === "&") return [];
		return [{ kind: "selector", name: relative, value: relative }];
	}
	if (normalized.includes("&")) return [{ kind: "selector", name: normalized, value: normalized }];
	const conditions: StyleCondition[] = [];
	for (const match of selector.matchAll(/(?<!\\):([a-z-]+)(?:\([^)]*\))?/giu)) {
		const name = match[1];
		if (name !== undefined) conditions.push(generatedPseudoCondition(name));
	}
	if (
		conditions.length === 0 &&
		(normalized.includes("[") ||
			normalized.includes("]") ||
			/[>&+~\s]/u.test(normalized) ||
			!/^\.?[\\A-Za-z0-9_-]+$/u.test(normalized))
	) {
		const utility = splitUtilityToken(token).at(-1) ?? token;
		const escapedUtility = utility.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const relative = normalized.replace(
			new RegExp(`\\.${escapedUtility}(?=[\\s:#.\\[>,+~]|$)`, "u"),
			"&",
		);
		conditions.push({ kind: "selector", name: relative, value: relative });
	}
	return conditions;
}

function parseEngineCss(css: string, token: string): readonly StyleDeclaration[] | undefined {
	if (css.trim() === "") return undefined;
	const root = parseGeneratedCss(css);
	const declarations: StyleDeclaration[] = [];
	const work: Array<{
		node: GeneratedCssNode;
		conditions: readonly StyleCondition[];
		insideStyleRule: boolean;
	}> = root.toReversed().map((node) => ({ node, conditions: [], insideStyleRule: false }));
	while (work.length > 0) {
		const current = work.pop()!;
		const node = current.node;
		if (node.type === GeneratedCssNodeKind.Declaration) {
			const property = node.prop.trim();
			const value = node.value.trim();
			const parsedValue = declarationValue(value);
			if (current.insideStyleRule && property !== "" && parsedValue.value !== "")
				declarations.push({
					...literal(cssProperty(property), parsedValue.value),
					conditions: current.conditions,
					...(parsedValue.important ? { important: true } : {}),
				});
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
				work.push({ node: children[index]!, conditions, insideStyleRule: current.insideStyleRule });
			continue;
		}
		const conditions = [
			...current.conditions,
			...generatedSelectorConditions(node.selector, token),
		];
		for (let index = children.length - 1; index >= 0; index--)
			work.push({
				node: children[index]!,
				conditions,
				insideStyleRule: current.insideStyleRule || node.selector.includes("."),
			});
	}
	return declarations.length === 0 ? undefined : declarations;
}

function tailwindCssFiles(
	context: AdapterConfigContext,
): readonly { file: string; text: string }[] {
	if (context.root === undefined || context.readFile === undefined) return [];
	const discovered = context.listFiles?.(context.root) ?? [];
	// v4 configuration is discovered from CSS entrypoints because that is the
	// official engine's design-system source. A classic JavaScript config is
	// loaded separately when the project exposes one, while v4's `@config`
	// directive is resolved from its referencing CSS entry. Restricting this
	// scan to .css also keeps documentation prose that quotes "@import" from
	// becoming a false configuration entry.
	const candidates = discovered
		.filter((file) => file.endsWith(".css"))
		.map((file) => ({
			file,
			text: context.readFile?.(
				file.startsWith(context.root!) ? file : joinDocumentPath(context.root!, file),
			),
		}))
		.filter(
			(candidate): candidate is { file: string; text: string } => candidate.text !== undefined,
		)
		.filter(({ text }) =>
			/@(?:import|tailwind|theme|utility|plugin|config|custom-variant|source|reference)\b/u.test(
				text,
			),
		)
		.toSorted((left, right) => {
			const score = (text: string): number =>
				/@(?:import|tailwind)\s+(?:["']tailwindcss|base|components|utilities)/u.test(text) ? 0 : 1;
			return score(left.text) - score(right.text) || left.file.localeCompare(right.file);
		});
	return candidates;
}

async function classicConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
	fallback: AdapterProjectConfig,
): Promise<AdapterProjectConfig | undefined> {
	const configFile = classicConfigFiles(context)[0];
	if (configFile === undefined || context.root === undefined || context.readFile === undefined)
		return undefined;
	try {
		const loadedConfig = await loader.importFile<unknown>(configFile);
		const loaded = defaultExport<TailwindClassicConfig>(loadedConfig);
		if (loaded === undefined || Array.isArray(loaded))
			return AdapterEvidence.configurationFailure(
				fallback,
				"Tailwind project configuration",
				`official Tailwind config is not an object: ${configFile}`,
			);
		const [tailwindModule, postcssModule, resolveConfigModule] = await Promise.all([
			loader.importPackage<unknown>("tailwindcss", context.root),
			loader.importPackage<unknown>("postcss", context.root),
			loader.importPackage<unknown>("tailwindcss/resolveConfig", context.root),
		]);
		const tailwind = defaultExport<TailwindClassicPlugin>(tailwindModule);
		const postcss = defaultExport<TailwindClassicPostCss>(postcssModule);
		if (tailwind === undefined || postcss === undefined) {
			return AdapterEvidence.configurationFailure(
				fallback,
				"Tailwind project configuration",
				"the official Tailwind 3 compiler requires the tailwindcss and postcss packages",
			);
		}
		const content = classicContentFiles(context).flatMap((file) => {
			const raw = context.readFile?.(file);
			if (raw === undefined) return [];
			const extension = file.slice(file.lastIndexOf(".") + 1);
			return [{ raw, extension }];
		});
		const compiled = await postcss([tailwind({ ...loaded, content })]).process(
			"@tailwind utilities;",
			{ from: configFile },
		);
		const resolver = parseClassicTailwindCss(compiled.css);
		const resolveConfig = defaultExport<TailwindClassicResolveConfig>(resolveConfigModule);
		const cssFiles = tailwindCssFiles(context);
		return {
			...fallback,
			files: [configFile, ...cssFiles.map(({ file }) => file)],
			tokenCatalog: classicTokenCatalog(loaded, resolveConfig),
			values: {
				...fallback.values,
				tailwindImportantSyntax: "prefix",
				tailwindResolver: resolver,
				officialConfigPackages: [
					"tailwindcss",
					"postcss",
					...(resolveConfig === undefined ? [] : ["tailwindcss/resolveConfig"]),
				],
			},
		};
	} catch (error) {
		return AdapterEvidence.configurationFailure(
			fallback,
			"Tailwind project configuration",
			`official Tailwind 3 config loading failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function officialConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = config(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	const cssFiles = tailwindCssFiles(context);
	const classic = await classicConfig(context, loader, fallback);
	const module = await loader.importPackage<TailwindEnginePackage>(
		"@tailwindcss/node",
		context.root,
	);
	const officialProbe =
		module === undefined
			? tailwindApiProbe(
					TAILWIND_OFFICIAL_API_STATUS.Unavailable,
					"the official @tailwindcss/node loader is unavailable for a discovered Tailwind CSS graph",
				)
			: isTailwindLoadDesignSystem(module.__unstable__loadDesignSystem)
				? tailwindApiProbe(TAILWIND_OFFICIAL_API_STATUS.Available)
				: tailwindApiProbe(
						TAILWIND_OFFICIAL_API_STATUS.Incompatible,
						"the installed @tailwindcss/node package does not expose the expected loader function",
					);
	const withOfficialProbe = (
		base: AdapterProjectConfig,
		probe: TailwindOfficialApiProbe = officialProbe,
	): AdapterProjectConfig => ({
		...base,
		values: { ...base.values, tailwindOfficialApi: probe },
	});
	if (officialProbe.status !== TAILWIND_OFFICIAL_API_STATUS.Available) {
		if (classic !== undefined) return classic;
		const hasTailwindConfiguration = cssFiles.some(({ text }) =>
			/@(?:import|tailwind|theme|utility|plugin|config|custom-variant|source|reference)\b/u.test(
				text,
			),
		);
		return hasTailwindConfiguration
			? AdapterEvidence.configurationFailure(
					withOfficialProbe(fallback),
					"Tailwind project configuration",
					officialProbe.detail ??
						"the official @tailwindcss/node loader is unavailable for a discovered Tailwind CSS graph",
				)
			: withOfficialProbe(fallback);
	}
	const cssFile = cssFiles[0];
	if (cssFile === undefined) {
		if (classic !== undefined) return classic;
		// An async official loader without the filesystem discovery port cannot
		// establish which CSS graph defines the project. Preserve source and make
		// that missing evidence visible instead of pretending the fallback is the
		// project's Tailwind configuration.
		if (context.listFiles === undefined)
			return {
				...withOfficialProbe(fallback),
				residuals: [
					{
						kind: StyleProgramResidualKindTag.Configuration,
						text: "Tailwind project CSS graph",
						hint: "project file discovery is required to load the official Tailwind engine",
					},
				],
			};
		return withOfficialProbe(fallback);
	}
	try {
		// The official engine resolves @import graph files relative to the CSS
		// file's directory, not the project root.
		const loadDesignSystem = module?.__unstable__loadDesignSystem;
		if (!isTailwindLoadDesignSystem(loadDesignSystem))
			throw new Error(officialProbe.detail ?? "Tailwind loader API is incompatible");
		const loadedSystem = await loadDesignSystem(cssFile.text, {
			base: dirnameDocumentPath(cssFile.file),
		});
		if (!isTailwindDesignSystem(loadedSystem))
			throw new Error(
				"@tailwindcss/node.__unstable__loadDesignSystem returned an incompatible design-system shape",
			);
		const system = loadedSystem;
		const theme = tailwindThemeValues(system);
		let candidates: string[] | undefined;
		const allCandidates = (): readonly string[] =>
			(candidates ??= (system.getClassList?.() ?? []).map(([candidate]) => candidate));
		const catalogCandidates = allCandidates();
		const catalogCss = system.candidatesToCss(catalogCandidates);
		const cache = new Map<string, readonly StyleDeclaration[] | undefined>();
		const resolver: TailwindOfficialUtilityResolver = {
			resolve(token) {
				if (cache.has(token)) return cache.get(token);
				const generatedCss = system.candidatesToCss([token])[0] ?? "";
				const resolved = resolveTailwindDeclarations(parseEngineCss(generatedCss, token), theme);
				cache.set(token, resolved);
				return resolved;
			},
			candidates() {
				return allCandidates();
			},
		};
		return {
			...withOfficialProbe(fallback, tailwindApiProbe(TAILWIND_OFFICIAL_API_STATUS.Verified)),
			files: cssFiles.map(({ file }) =>
				file.startsWith(context.root!) ? file : joinDocumentPath(context.root!, file),
			),
			tokenCatalog: tailwindTokenCatalog(system, catalogCandidates, catalogCss, theme)?.contract,
			values: {
				...fallback.values,
				tailwindImportantSyntax: "suffix",
				tailwindOfficialApi: tailwindApiProbe(TAILWIND_OFFICIAL_API_STATUS.Verified),
				tailwindResolver: resolver,
				officialConfigPackages: ["@tailwindcss/node"],
			},
		};
	} catch (error) {
		if (classic !== undefined) return classic;
		return {
			...withOfficialProbe(
				fallback,
				tailwindApiProbe(
					TAILWIND_OFFICIAL_API_STATUS.Failed,
					`official loader invocation failed: ${error instanceof Error ? error.message : String(error)}`,
				),
			),
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Configuration,
					text: "Tailwind project configuration",
					hint: `official Tailwind config loading failed: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
		};
	}
}

export function createTailwindAdapter(options: TailwindAdapterOptions = {}): StyleAdapter {
	const fallbackResolver = options.resolver ?? { resolve: defaultResolve };
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	const officialConfigCache = new Map<string, Promise<AdapterProjectConfig>>();
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: CodemodAdapterId.Tailwind,
		version: "2",
		officialApi: AdapterEvidence.manifest({
			apis: [
				{ name: "utility-candidates", status: AdapterOfficialApiStatusTag.Supported },
				{ name: "@utility", status: AdapterOfficialApiStatusTag.Supported },
				{ name: "@plugin", status: AdapterOfficialApiStatusTag.Supported },
				{ name: "@custom-variant", status: AdapterOfficialApiStatusTag.Supported },
			],
			configEntrypoints: ["@theme", "@source", "@reference", "@import"],
			pluginSystems: ["@plugin"],
			compilerIntegrations: ["@tailwindcss/node"],
		}),
		sourceModules: ["tailwindcss", "@tailwindcss/node"],
		dependencies: {
			packages: [{ name: "tailwindcss", kind: AdapterDependencyKindTag.Development }],
		},
		capabilities: {
			schema: ADAPTER_CAPABILITIES_SCHEMA,
			adapter: CodemodAdapterId.Tailwind,
			version: "1",
			capabilities: {
				declarations: "exact",
				"important-priority": "exact",
				"named-rules": "exact",
				"token-values": "partial",
				"rule-level": "partial",
				selectors: "exact",
				nesting: "exact",
				ordering: "partial",
				"pseudo-conditions": "exact",
				"media-conditions": "exact",
				"container-conditions": "exact",
				"supports-conditions": "exact",
				"dynamic-values": "unsupported",
				"custom-properties": "exact",
				"function-values": "unsupported",
				"framework-semantics": "exact",
				components: "unsupported",
				"global-rules": "unsupported",
				keyframes: "unsupported",
				"font-face": "unsupported",
				layers: "unsupported",
				"supports-rules": "unsupported",
				"property-rules": "unsupported",
			},
		},
		detect: (context) => {
			const dynamicAttributes = collectTailwindDynamicClassAttributes(context.source);
			const matched =
				detectStaticClassTarget(context.source).matched || dynamicAttributes.length > 0;
			const configured = /(?:tailwindcss|@tailwindcss\/)/u.test(context.source);
			return {
				matched,
				confidence: matched ? (configured ? 1 : 0.6) : 0,
				evidence: matched
					? [
							configured
								? "tailwind-package"
								: dynamicAttributes.length > 0
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
					loadConfigAsync: (context: AdapterConfigContext) => {
						if (context.root === undefined)
							return officialConfig(context, moduleLoader).then((value) =>
								AdapterEvidence.normalizeConfig(value),
							);
						let loaded = officialConfigCache.get(context.root);
						if (loaded === undefined) {
							loaded = officialConfig(context, moduleLoader).then((value) =>
								AdapterEvidence.normalizeConfig(value),
							);
							officialConfigCache.set(context.root, loaded);
						}
						return loaded;
					},
				}),
		parse: (source, context) =>
			parseTailwind(
				source,
				context,
				options.resolver ??
					(context.config.values.tailwindResolver as TailwindUtilityResolver | undefined) ??
					resolverFromInteropMeta(context.meta) ??
					fallbackResolver,
			),
		emit: (program, context) => {
			const tokenCatalog = TokenCatalog.fromContract(context.config.tokenCatalog);
			const resolver = context.config.values.tailwindResolver as
				| TailwindUtilityResolver
				| undefined;
			const importantSyntax: TailwindImportantSyntax =
				context.config.values.tailwindImportantSyntax === "prefix" ? "prefix" : "suffix";
			const namedRules = program.rules.filter(
				(rule) => rule.kind === StyleRuleKindTag.Style && rule.name !== undefined,
			);
			if (namedRules.length > 0) {
				const residuals: StyleProgramResidual[] = [];
				const emissionDecisions: AdapterEmissionDecision[] = [];
				const entries = namedRules.map((rule) => {
					const emitted = emitTailwind(
						{
							...program,
							rules: [{ ...rule, name: undefined }],
							declarations: rule.declarations,
						},
						tokenCatalog,
						resolver,
						importantSyntax,
					);
					residuals.push(...emitted.residuals);
					emissionDecisions.push(...emitted.emissionDecisions);
					return `${JSON.stringify(rule.name)}: ${emitted.text}`;
				});
				return {
					text: `{ ${entries.join(", ")} }`,
					semantic: program,
					emissionDecisions,
					residuals,
				};
			}
			return {
				...emitTailwind(program, tokenCatalog, resolver, importantSyntax),
				semantic: program,
			};
		},
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				dynamicClassCarrier: true,
				handlesFrameworkSemantics: true,
				hostRepresentation: StyleHostRepresentationKind.Class,
				standaloneHostRepresentation: StyleHostRepresentationKind.Class,
				resolveHostRepresentation: () => StyleHostRepresentationKind.Class,
				rewriteComponent: ({
					phase,
					program,
					code,
					file,
					binding,
					tag,
					framework,
					emittedExpression,
					representation,
					attrsExpression,
				}) => {
					if (
						representation !== StyleHostRepresentationKind.Component &&
						representation !== StyleHostRepresentationKind.Class
					)
						return { code, residuals: [] };
					const rewriteDeclaration = getHostComponentRewriter(framework)?.rewriteDeclaration;
					if (rewriteDeclaration === undefined)
						return {
							code,
							residuals: [
								{
									kind: StyleProgramResidualKindTag.HostFramework,
									text: binding,
									hint: "Tailwind polymorphic component projection requires a JSX host rewriter",
								},
							],
						};
					if (phase === "preflight") {
						const preview = preflightHostComponentDeclaration({
							file: file ?? "component.tsx",
							binding,
							tag,
							framework,
							...(attrsExpression === undefined ? {} : { attrsExpression }),
							...(program.source?.hostPropFilter?.prefixes === undefined
								? {}
								: { filteredPropPrefixes: program.source.hostPropFilter.prefixes }),
						});
						return { code, residuals: preview.residuals };
					}
					const rewritten = rewriteDeclaration({
						source: code,
						file: file ?? "component.tsx",
						binding,
						tag,
						framework,
						classExpression: emittedExpression,
						...(attrsExpression === undefined ? {} : { attrsExpression }),
						...(program.source?.hostPropFilter?.prefixes === undefined
							? {}
							: { filteredPropPrefixes: program.source.hostPropFilter.prefixes }),
					});
					return {
						code: rewritten.code,
						...(rewritten.imports === undefined ? {} : { imports: rewritten.imports }),
						...(rewritten.needsCx
							? {
									imports: ['import { createCx } from "yumcss/cx";', "const cx = createCx();"],
								}
							: {}),
						residuals: rewritten.residuals,
					};
				},
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
					DynamicClassHost.rewrite("Tailwind", code, {
						binding,
						framework,
						representationKind,
						residuals,
					}),
			},
		},
		validate: (source, target, residuals = []): AdapterValidationResult => {
			const canonicalSource = styleProgramToCanonicalCss(source);
			const canonicalTarget = styleProgramToCanonicalCss(target);
			const differences =
				canonicalSource === canonicalTarget && residuals.length === 0
					? []
					: ["canonical CSS differs or has residuals"];
			return {
				valid: differences.length === 0,
				lossiness:
					canonicalSource !== canonicalTarget
						? "unsupported"
						: residuals.length > 0
							? "lossy"
							: "lossless",
				canonicalSource,
				canonicalTarget,
				differences,
				residuals,
			};
		},
	};
}
