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

const cssProperty = (value: string): string =>
	value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

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
			...literal(cssProperty(match[1]), match[2].replaceAll("_", " ")),
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
	if (!match[2].split(/\s+/u).some((token) => resolver.resolve(token) !== undefined)) return undefined;
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
	const variable = /^var\(--([a-z-]+)-([^),\s]+)\)$/u.exec(declaration.value.value);
	const namespace = variable?.[1];
	const group = Object.entries(tailwindTokenNamespaces).find(
		([, value]) => value === namespace,
	)?.[0];
	const tokenKey = variable?.[2];
	if (group === undefined || tokenKey === undefined) return declaration;
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

function standaloneClassMap(
	source: string,
	resolver: TailwindUtilityResolver,
):
	| { readonly start: number; readonly end: number; readonly entries: readonly RegExpExecArray[] }
	| undefined {
	const outer = /^\s*\{([\s\S]*)\}\s*;?\s*$/u.exec(source);
	if (outer?.[1] === undefined) return undefined;
	const entries = [...outer[1].matchAll(/(["'])([A-Za-z_$][\w$-]*)\1\s*:\s*(["'])([^"']+)\3/g)].filter(
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
		const entries = [...block.body.matchAll(/(["'])([A-Za-z_$][\w$-]*)\1\s*:\s*(["'])([^"']+)\3/g)].filter(
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
					kind: "unknown-utility",
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
			!value.includes("[") &&
			!value.split(/\s+/u).some((token) => resolver.resolve(token) !== undefined)
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
	for (const text of collectDynamicClassAttributes(source))
		residuals.push({
			kind: StyleProgramResidualKindTag.Dynamic,
			text,
			hint: "Tailwind dynamic class expressions require runtime-aware target lowering",
		});
	return { matches, residuals };
}

function utilityValue(value: string | number | boolean): string {
	return String(value).replaceAll(" ", "_").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function utilityCondition(conditionValue: StyleCondition): string {
	if (conditionValue.kind === SemanticConditionKindTag.Pseudo) return `${conditionValue.name}:`;
	if (conditionValue.kind === SemanticConditionKindTag.Selector) {
		const selector = conditionValue.value ?? conditionValue.name;
		return `[&${selector.startsWith("&") ? selector.slice(1) : selector}]:`;
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

/**
 * Tailwind owns the utility vocabulary. When its design system is loaded,
 * enumerate the candidates it actually registered and let its compiler verify
 * the declaration. The syntax fallback below remains only for injected
 * resolvers that expose the older `resolve`-only contract.
 */
function officialTailwindUtility(
	declaration: StyleDeclaration,
	prefix: string,
	resolver: TailwindUtilityResolver | undefined,
	catalog: TokenCatalog | undefined,
): string | undefined {
	const official = resolver as TailwindOfficialUtilityResolver | undefined;
	const candidates = official?.candidates?.();
	if (candidates === undefined) return undefined;
	const matches = candidates
		.filter((candidate) => !candidate.includes(":"))
		.filter((candidate) =>
			equivalentTailwindDeclaration(
				resolver?.resolve(`${prefix}${candidate}`),
				declaration,
				catalog,
			),
		);
	return matches
		.toSorted(
			(left, right) =>
				Number(left.includes("[")) - Number(right.includes("[")) ||
				left.length - right.length ||
				left.localeCompare(right),
		)
		.at(0);
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
		JSON.stringify(actual.conditions) === JSON.stringify(declaration.conditions)
	);
}

function tailwindPropertyAwareUtility(declaration: StyleDeclaration): string | undefined {
	const resolved = resolvedStyleValue(declaration.value);
	if (resolved === undefined) return undefined;
	const value = utilityValue(resolved);
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
		const official = officialTailwindUtility(declaration, prefix, resolver, catalog);
		const named =
			official === undefined
				? tailwindTokenUtility(declaration, catalog)
				: official.slice(prefix.length);
		const propertyAware = tailwindPropertyAwareUtility(declaration);
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
		const fallback = `${prefix}[${declaration.property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${utilityValue(resolved)}]`;
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
	__unstable__loadDesignSystem?: (
		css: string,
		options: { readonly base: string },
	) => Promise<{
		candidatesToCss(candidates: readonly string[]): readonly (string | null)[];
		getClassList?: () => readonly (readonly [string, unknown])[];
		theme?: {
			entries(): Iterable<readonly [string, { readonly value?: string }]>;
		};
	}>;
};

function tailwindTokenCatalog(
	system: Awaited<ReturnType<NonNullable<TailwindEnginePackage["__unstable__loadDesignSystem"]>>>,
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

function generatedSelectorConditions(selector: string, token: string): readonly StyleCondition[] {
	const conditions: StyleCondition[] = [];
	for (const match of selector.matchAll(/(?<!\\):([a-z-]+)(?:\([^)]*\))?/giu)) {
		const name = match[1];
		if (name !== undefined) conditions.push(generatedPseudoCondition(name));
	}
	const normalized = selector.trim();
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
			if (current.insideStyleRule && property !== "" && value !== "")
				declarations.push({
					...literal(cssProperty(property), value),
					conditions: current.conditions,
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
	// Discovery targets the v4 CSS entry (the official engine's design-system
	// source). Legacy tailwind.config.js is still supported by v4, but only
	// through an explicit `@config "./tailwind.config.js";` at-rule inside a
	// CSS file, which the engine resolves from here; a standalone JS config
	// without a referencing CSS entry is not loadable design-system evidence.
	// Restricting discovery to .css also keeps documentation prose that quotes
	// "@import" from becoming a false configuration entry.
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

async function officialConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<AdapterProjectConfig> {
	const fallback = config(context);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	const cssFiles = tailwindCssFiles(context);
	const module = await loader.importPackage<TailwindEnginePackage>(
		"@tailwindcss/node",
		context.root,
	);
	if (module?.__unstable__loadDesignSystem === undefined) {
		const hasTailwindConfiguration = cssFiles.some(({ text }) =>
			/@(?:import|tailwind|theme|utility|plugin|config|custom-variant|source|reference)\b/u.test(
				text,
			),
		);
		return hasTailwindConfiguration
			? AdapterEvidence.configurationFailure(
					fallback,
					"Tailwind project configuration",
					"the official @tailwindcss/node loader is unavailable for a discovered Tailwind CSS graph",
				)
			: fallback;
	}
	const cssFile = cssFiles[0];
	if (cssFile === undefined) {
		// An async official loader without the filesystem discovery port cannot
		// establish which CSS graph defines the project. Preserve source and make
		// that missing evidence visible instead of pretending the fallback is the
		// project's Tailwind configuration.
		if (context.listFiles === undefined)
			return {
				...fallback,
				residuals: [
					{
						kind: StyleProgramResidualKindTag.Configuration,
						text: "Tailwind project CSS graph",
						hint: "project file discovery is required to load the official Tailwind engine",
					},
				],
			};
		return fallback;
	}
	try {
		// The official engine resolves @import graph files relative to the CSS
		// file's directory, not the project root.
		const system = await module.__unstable__loadDesignSystem(cssFile.text, {
			base: dirnameDocumentPath(cssFile.file),
		});
		const candidates = (system.getClassList?.() ?? []).map(([candidate]) => candidate);
		const compiled = system.candidatesToCss(candidates);
		const cache = new Map<string, readonly StyleDeclaration[] | undefined>();
		for (let index = 0; index < candidates.length; index++) {
			const candidate = candidates[index]!;
			cache.set(candidate, parseEngineCss(compiled[index] ?? "", candidate));
		}
		const resolver: TailwindOfficialUtilityResolver = {
			resolve(token) {
				if (cache.has(token)) return cache.get(token);
				const resolved = parseEngineCss(system.candidatesToCss([token])[0] ?? "", token);
				cache.set(token, resolved);
				return resolved;
			},
			candidates() {
				return candidates;
			},
		};
		return {
			...fallback,
			files: cssFiles.map(({ file }) =>
				file.startsWith(context.root!) ? file : joinDocumentPath(context.root!, file),
			),
			tokenCatalog: tailwindTokenCatalog(system)?.contract,
			values: {
				...fallback.values,
				tailwindResolver: resolver,
				officialConfigPackages: ["@tailwindcss/node"],
			},
		};
	} catch (error) {
		return {
			...fallback,
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
			const matched =
				detectStaticClassTarget(context.source).matched ||
				collectDynamicClassAttributes(context.source).length > 0;
			const configured = /(?:tailwindcss|@tailwindcss\/)/u.test(context.source);
			return {
				matched,
				confidence: matched ? (configured ? 1 : 0.6) : 0,
				evidence: matched
					? [
							configured
								? "tailwind-package"
								: collectDynamicClassAttributes(context.source).length > 0
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
		parse: (source, context) =>
			parseTailwind(
				source,
				context,
				(context.config.values.tailwindResolver as TailwindUtilityResolver | undefined) ??
					fallbackResolver,
			),
		emit: (program, context) => {
			const tokenCatalog = TokenCatalog.fromContract(context.config.tokenCatalog);
			const resolver = context.config.values.tailwindResolver as
				| TailwindUtilityResolver
				| undefined;
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
				...emitTailwind(program, tokenCatalog, resolver),
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
