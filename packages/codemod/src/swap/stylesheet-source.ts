import {
	SemanticConditionKindTag,
	StyleValueKindTag,
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	styleProgramFromRules,
	styleProgramToCanonicalCss,
	type StyleCondition,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
	type StyleRule,
} from "./semantic-ir.ts";
import { MigrationDiagnostics } from "./migration-diagnostics.ts";
import { MigrationOutput } from "./migration-output.ts";
import { inspectAdapterCapabilities } from "./capabilities.ts";
import type {
	AdapterFileMigrationContext,
	AdapterFileMigration,
	AdapterFileMigrationResult,
	AdapterValidationResult,
	AdapterParseContext,
	AdapterParseResult,
	AdapterEmitContext,
	AdapterProjectConfig,
	AdapterMatch,
	AdapterMigrationOutcome,
} from "./adapter-contract.ts";
import { STYLE_LOWERING_REGISTRY, type StyleLoweringPlan } from "./lowering.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";
import { CodemodAdapterId, StyleMigrationOutcome, StyleRepresentationKind } from "./identifiers.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../path-utils.ts";
import { SOURCE_SCANNER_SERVICE, SourceBindings } from "pandwind/source";

const enum StylesheetSourceNodeKindTag {
	Rule = "rule",
	AtRule = "at-rule",
	Statement = "statement",
}

export interface StylesheetSourceNode {
	readonly kind: `${StylesheetSourceNodeKindTag}`;
	readonly prelude: string;
	readonly start: number;
	readonly end: number;
	readonly body?: readonly StylesheetSourceNode[];
}

export interface StylesheetSourceDocument {
	readonly nodes: readonly StylesheetSourceNode[];
	readonly residuals: readonly StyleProgramResidual[];
}

/**
 * A local stylesheet class becomes a named-map entry in a generated module.
 * Move the class selector and enclosing at-rule conditions into the semantic
 * style value before capability negotiation; the target then evaluates the
 * same declaration shape it would receive from its documented object API.
 */
function stylesheetClassProgram(program: StyleProgram): StyleProgram {
	return {
		...program,
		rules: program.rules.map((rule) => {
			if (
				rule.kind !== StyleRuleKindTag.Style ||
				rule.name === undefined ||
				rule.children.length > 0
			)
				return rule;
			return {
				...rule,
				name: undefined,
				selector: undefined,
				conditions: [],
				declarations: rule.declarations.map((declaration) => ({
					...declaration,
					conditions: [...rule.conditions, ...declaration.conditions],
				})),
			};
		}),
	};
}

/** Stylesheet parsing is a port so preprocessors can provide an official compiler. */
export interface StylesheetSourcePort {
	parse(source: string): StylesheetSourceDocument;
}

export interface StylesheetCompilerResult {
	readonly css: string;
	readonly dependencies?: readonly string[];
	readonly sourceMap?: string;
}

/** Official Sass/Less compilers implement this port at the adapter boundary. */
export interface StylesheetCompilerPort {
	compile(
		source: string,
		context: { readonly file: string; readonly root?: string },
	): Promise<StylesheetCompilerResult>;
}

/**
 * Config key a stylesheet-family adapter sets in its own loaded project
 * config. Targets declare their family through adapter-owned evidence, so
 * migrations compose on the declared contract instead of adapter name checks.
 */
export const STYLESHEET_FAMILY_CONFIG_KEY = "sourceFamily";

/** A target whose declared config marks it as a stylesheet-family member. */
export const isStylesheetFamilyConfig = (config: AdapterProjectConfig): boolean =>
	typeof config.values[STYLESHEET_FAMILY_CONFIG_KEY] === "string";

/**
 * A stylesheet-family target produces a document in its own dialect, so the
 * migrated file carries the target family's extension. The evidence comes from
 * the target adapter's declared source family, never a hardcoded route table.
 */
export function stylesheetFamilyExtension(config: AdapterProjectConfig): string | undefined {
	const family = config.values[STYLESHEET_FAMILY_CONFIG_KEY];
	if (family === CodemodAdapterId.CssModules) return ".module.css";
	if (family === CodemodAdapterId.Sass) return ".scss";
	if (family === CodemodAdapterId.Less) return ".less";
	if (family === CodemodAdapterId.AuthoredCss) return ".css";
	return undefined;
}

function skipTrivia(
	source: string,
	start: number,
	end: number,
	residuals: StyleProgramResidual[],
): number {
	let index = start;
	while (index < end) {
		if (/\s/u.test(source[index] ?? "")) {
			index++;
			continue;
		}
		if (source[index] === "/" && source[index + 1] === "*") {
			const close = source.indexOf("*/", index + 2);
			if (close === -1) {
				// An unterminated comment is malformed source; residualizing it
				// keeps the text recoverable instead of silently consumed.
				residuals.push({
					kind: StyleProgramResidualKindTag.Parse,
					text: source.slice(index, end),
					hint: "stylesheet comment is never closed",
				});
				index = end;
			} else {
				index = close + 2;
			}
			continue;
		}
		break;
	}
	return index;
}

function delimiterAt(
	source: string,
	start: number,
	end: number,
): { index: number; kind: "{" | ";" | "}" } | undefined {
	let parens = 0;
	let brackets = 0;
	let quote: string | undefined;
	for (let index = start; index < end; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "$" && source[index + 1] === "{") {
			index = skipInterpolation(source, index, end) - 1;
			continue;
		}
		if (character === "(") parens++;
		else if (character === ")" && parens > 0) parens--;
		else if (character === "[") brackets++;
		else if (character === "]" && brackets > 0) brackets--;
		else if (character === "{" && (source[index - 1] === "#" || source[index - 1] === "@")) {
			let depth = 1;
			while (++index < end && depth > 0) {
				if (source[index] === "{") depth++;
				if (source[index] === "}") depth--;
			}
			continue;
		} else if (
			parens === 0 &&
			brackets === 0 &&
			(character === "{" || character === ";" || character === "}")
		)
			return { index, kind: character };
	}
	return undefined;
}

function closingBrace(source: string, open: number, end: number): number | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < end; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "$" && source[index + 1] === "{") {
			index = skipInterpolation(source, index, end) - 1;
			continue;
		}
		if (character === "{" && (source[index - 1] === "#" || source[index - 1] === "@")) {
			while (++index < end && source[index] !== "}") continue;
			continue;
		}
		if (character === "{") depth++;
		if (character === "}" && --depth === 0) return index;
	}
	return undefined;
}

function parseNodes(
	source: string,
	start: number,
	end: number,
): { nodes: StylesheetSourceNode[]; residuals: StyleProgramResidual[] } {
	const nodes: StylesheetSourceNode[] = [];
	const residuals: StyleProgramResidual[] = [];
	let cursor = start;
	while (cursor < end) {
		const contentStart = skipTrivia(source, cursor, end, residuals);
		if (contentStart >= end) break;
		const delimiter = delimiterAt(source, contentStart, end);
		if (delimiter === undefined) {
			// CSS permits the final declaration of a block to omit the trailing
			// semicolon; the remaining content is one statement.
			const trailing = source.slice(contentStart, end).trim();
			if (trailing !== "")
				nodes.push({
					kind: StylesheetSourceNodeKindTag.Statement,
					prelude: trailing,
					start: contentStart,
					end,
				});
			break;
		}
		if (delimiter.kind === "}") {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(contentStart, delimiter.index + 1),
				hint: "unexpected stylesheet closing brace",
			});
			cursor = delimiter.index + 1;
			continue;
		}
		const prelude = source.slice(contentStart, delimiter.index).trim();
		if (prelude === "") {
			cursor = delimiter.index + 1;
			continue;
		}
		if (delimiter.kind === ";") {
			nodes.push({
				kind: StylesheetSourceNodeKindTag.Statement,
				prelude,
				start: contentStart,
				end: delimiter.index + 1,
			});
			cursor = delimiter.index + 1;
			continue;
		}
		const close = closingBrace(source, delimiter.index, end);
		if (close === undefined) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(contentStart, end),
				hint: "stylesheet block is unbalanced",
			});
			break;
		}
		const nested = parseNodes(source, delimiter.index + 1, close);
		nodes.push({
			kind: prelude.startsWith("@")
				? StylesheetSourceNodeKindTag.AtRule
				: StylesheetSourceNodeKindTag.Rule,
			prelude,
			start: contentStart,
			end: close + 1,
			body: nested.nodes,
		});
		residuals.push(...nested.residuals);
		cursor = close + 1;
	}
	return { nodes, residuals };
}

export class PlainStylesheetSource implements StylesheetSourcePort {
	parse(source: string): StylesheetSourceDocument {
		const result = parseNodes(source, 0, source.length);
		return { nodes: result.nodes, residuals: result.residuals };
	}
}

const propertyName = (value: string): string =>
	value.trim().replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());

function declarations(
	node: StylesheetSourceNode,
	_context: AdapterParseContext,
): { declarations: StyleDeclaration[]; residuals: StyleProgramResidual[] } {
	const values: StyleDeclaration[] = [];
	const residuals: StyleProgramResidual[] = [];
	for (const child of node.body ?? []) {
		if (child.kind !== StylesheetSourceNodeKindTag.Statement) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Nesting,
				text: child.prelude,
				hint: "nested stylesheet rules require selector-aware lowering",
			});
			continue;
		}
		const colon = child.prelude.indexOf(":");
		if (colon <= 0) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: child.prelude,
				hint: "stylesheet declaration requires a property and value",
			});
			continue;
		}
		const property = child.prelude.slice(0, colon).trim();
		const value = child.prelude.slice(colon + 1).trim();
		if (
			property === "composes" ||
			property === "@include" ||
			value.includes("#{") ||
			value.includes("@{")
		) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Composition,
				text: child.prelude,
				hint: "preprocessor or CSS Modules composition needs its source context",
			});
			continue;
		}
		const expressionStart = value.indexOf("${");
		if (expressionStart >= 0) {
			// A `${...}` value is a runtime expression; keep its exact source text
			// so host adapters can re-emit the authored interpolation.
			const close = value.indexOf("}", expressionStart + 1);
			const expression =
				close === -1 ? value.slice(expressionStart + 2) : value.slice(expressionStart + 2, close);
			values.push({
				conditions: [],
				property: propertyName(property),
				value: { kind: StyleValueKindTag.Dynamic, expression: expression.trim() },
			});
			continue;
		}
		values.push({
			conditions: [],
			property: propertyName(property),
			value: { kind: StyleValueKindTag.Literal, value },
		});
	}
	return { declarations: values, residuals };
}

function condition(prelude: string): StyleCondition | undefined {
	const match = /^@(media|supports|container)\s+(.+)$/u.exec(prelude);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	const kind =
		match[1] === "media"
			? SemanticConditionKindTag.Media
			: match[1] === "container"
				? SemanticConditionKindTag.Container
				: SemanticConditionKindTag.Supports;
	return { kind, name: match[2], value: match[2], raw: prelude };
}

function styleRule(
	node: StylesheetSourceNode,
	context: AdapterParseContext,
	inherited: readonly StyleCondition[] = [],
): { rule?: StyleProgram["rules"][number]; residuals: StyleProgramResidual[] } {
	const parsed = declarations(node, context);
	const children: StyleProgram["rules"][number][] = [];
	const residuals = [...parsed.residuals];
	for (const child of node.body ?? []) {
		if (child.kind === StylesheetSourceNodeKindTag.Rule) {
			if (
				/\([^()]*\)$/u.test(child.prelude) &&
				(context.config.adapter === CodemodAdapterId.Sass ||
					context.config.adapter === CodemodAdapterId.Less)
			) {
				residuals.push({
					kind: StyleProgramResidualKindTag.Composition,
					text: child.prelude,
					hint: "preprocessor mixins require the official compiler context",
				});
				continue;
			}
			const nested = styleRule(child, context, inherited);
			if (nested.rule !== undefined) children.push(nested.rule);
			residuals.push(...nested.residuals);
			continue;
		}
		if (child.kind === StylesheetSourceNodeKindTag.AtRule) {
			const nestedCondition = condition(child.prelude);
			if (nestedCondition !== undefined) {
				for (const nestedChild of child.body ?? []) {
					if (nestedChild.kind !== StylesheetSourceNodeKindTag.Rule) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Capability,
							text: nestedChild.prelude,
							hint: "nested conditional statements require a selector-aware lowering",
						});
						continue;
					}
					const nested = styleRule(nestedChild, context, [...inherited, nestedCondition]);
					if (nested.rule !== undefined) children.push(nested.rule);
					residuals.push(...nested.residuals);
				}
				continue;
			}
			residuals.push({
				kind: StyleProgramResidualKindTag.Capability,
				text: child.prelude,
				hint: "nested stylesheet at-rules require selector-aware lowering",
			});
		}
	}
	const selector = node.prelude;
	const simpleLocalClass = /^\.[A-Za-z_$][\w$-]*$/u.test(selector);
	const classLikeSelector =
		simpleLocalClass || selector.startsWith(".") || selector.startsWith("&");
	return {
		rule: {
			kind: classLikeSelector ? StyleRuleKindTag.Style : StyleRuleKindTag.Global,
			selector,
			name: /^\.([A-Za-z_$][\w$-]*)$/u.exec(selector)?.[1],
			conditions: inherited,
			declarations: parsed.declarations,
			children,
			order: node.start,
			source: {
				file: context.file,
				start: node.start,
				end: node.end,
				adapter: context.config.adapter,
			},
		},
		residuals,
	};
}

function nodePrograms(
	node: StylesheetSourceNode,
	context: AdapterParseContext,
	inherited: readonly StyleCondition[] = [],
): { programs: StyleProgram[]; residuals: StyleProgramResidual[] } {
	const residuals: StyleProgramResidual[] = [];
	if (node.kind === StylesheetSourceNodeKindTag.Rule) {
		const result = styleRule(node, context, inherited);
		return result.rule === undefined
			? { programs: [], residuals: result.residuals }
			: {
					programs: [
						styleProgramFromRules([result.rule], {
							source: result.rule.source,
							residuals: result.residuals,
						}),
					],
					residuals: [],
				};
	}
	if (node.kind === StylesheetSourceNodeKindTag.Statement) {
		if (!node.prelude.startsWith("@import") && !node.prelude.startsWith("@charset"))
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: node.prelude,
				hint: "stylesheet statement is preserved outside the style program",
			});
		return { programs: [], residuals };
	}
	const lower = node.prelude.toLowerCase();
	if (lower.startsWith("@font-face")) {
		const parsed = declarations(node, context);
		return {
			programs: [
				styleProgramFromRules(
					[
						{
							kind: StyleRuleKindTag.FontFace,
							declarations: parsed.declarations,
							conditions: inherited,
							children: [],
							order: node.start,
							source: {
								file: context.file,
								start: node.start,
								end: node.end,
								adapter: context.config.adapter,
							},
						},
					],
					{ residuals: parsed.residuals },
				),
			],
			residuals: [],
		};
	}
	if (lower.startsWith("@keyframes") || lower.startsWith("@-webkit-keyframes")) {
		const name = node.prelude.trim().split(/\s+/u)[1];
		const keyframeResiduals: StyleProgramResidual[] = [];
		const children = (node.body ?? [])
			.filter((child) => child.kind === StylesheetSourceNodeKindTag.Rule)
			.map((child, order) => {
				const parsed = declarations(child, context);
				keyframeResiduals.push(...parsed.residuals);
				return {
					kind: StyleRuleKindTag.Style as const,
					selector: child.prelude,
					conditions: [],
					declarations: parsed.declarations,
					children: [],
					order,
				};
			});
		return {
			programs: [
				styleProgramFromRules(
					[
						{
							kind: StyleRuleKindTag.Keyframes,
							name,
							conditions: inherited,
							declarations: [],
							children,
							order: node.start,
						},
					],
					{
						source: {
							file: context.file,
							start: node.start,
							end: node.end,
							adapter: context.config.adapter,
						},
						residuals: keyframeResiduals,
					},
				),
			],
			residuals: [],
		};
	}
	if (lower.startsWith("@layer")) {
		const layer = node.prelude.slice("@layer".length).trim();
		const childRules: StyleProgram["rules"][number][] = [];
		for (const child of node.body ?? []) {
			const result = nodePrograms(child, context, inherited);
			residuals.push(...result.residuals);
			for (const program of result.programs) childRules.push(...program.rules);
		}
		return {
			programs: [
				styleProgramFromRules(
					[
						{
							kind: StyleRuleKindTag.Layer,
							name: layer || undefined,
							layer: layer || undefined,
							conditions: inherited,
							declarations: [],
							children: childRules,
							order: node.start,
						},
					],
					{ residuals },
				),
			],
			residuals: [],
		};
	}
	if (lower.startsWith("@supports")) {
		const support = node.prelude.slice("@supports".length).trim();
		const childRules: StyleProgram["rules"][number][] = [];
		for (const child of node.body ?? []) {
			const result = nodePrograms(child, context, inherited);
			residuals.push(...result.residuals);
			for (const program of result.programs) childRules.push(...program.rules);
		}
		return {
			programs: [
				styleProgramFromRules(
					[
						{
							kind: StyleRuleKindTag.Supports,
							name: support,
							conditions: inherited,
							declarations: [],
							children: childRules,
							order: node.start,
						},
					],
					{ residuals },
				),
			],
			residuals: [],
		};
	}
	const atCondition = condition(node.prelude);
	if (atCondition !== undefined) {
		const next = [...inherited, atCondition];
		const programs: StyleProgram[] = [];
		for (const child of node.body ?? []) {
			const result = nodePrograms(child, context, next);
			residuals.push(...result.residuals);
			programs.push(...result.programs);
		}
		return { programs, residuals };
	}
	if (lower.startsWith("@property")) {
		const parsed = declarations(node, context);
		return {
			programs: [
				styleProgramFromRules(
					[
						{
							kind: StyleRuleKindTag.Property,
							name: node.prelude.slice("@property".length).trim(),
							conditions: inherited,
							declarations: parsed.declarations,
							children: [],
							order: node.start,
						},
					],
					{
						source: {
							file: context.file,
							start: node.start,
							end: node.end,
							adapter: context.config.adapter,
						},
						residuals: parsed.residuals,
					},
				),
			],
			residuals: [],
		};
	}
	residuals.push({
		kind: StyleProgramResidualKindTag.Capability,
		text: node.prelude,
		hint: "stylesheet at-rule is not safely representable by the selected style target",
	});
	return { programs: [], residuals };
}

export function parseStylesheetPrograms(
	source: string,
	context: AdapterParseContext,
	port: StylesheetSourcePort = new PlainStylesheetSource(),
): AdapterParseResult {
	const document = port.parse(source);
	const matches: AdapterParseResult["matches"][number][] = [];
	const residuals = [...document.residuals];
	for (const node of document.nodes) {
		const result = nodePrograms(node, context);
		residuals.push(...result.residuals);
		for (const program of result.programs)
			matches.push({
				start: node.start,
				end: node.end,
				program,
				sourceText: source.slice(node.start, node.end),
			});
	}
	return { matches, residuals };
}

/** Convert a complete stylesheet into a generated Pandwind module atomically. */
export function createStylesheetFileMigration(
	port: StylesheetSourcePort = new PlainStylesheetSource(),
): AdapterFileMigration {
	return {
		run(context): AdapterFileMigrationResult {
			if (context.target.id === CodemodAdapterId.AuthoredCss) {
				// The conservative skip is still a lowering decision per parsed
				// rule; the matrix/contract gates consume the same evidence the
				// converted path emits.
				const skipParse = parseStylesheetPrograms(context.source, {
					file: context.file,
					source: context.source,
					root: context.root,
					config: context.sourceConfig,
					...(context.readFile === undefined ? {} : { readFile: context.readFile }),
				});
				const skipLoweringPlans: StyleLoweringPlan[] = skipParse.matches.map((match) => ({
					...STYLE_LOWERING_REGISTRY.plan({
						program: match.program,
						target: context.target.capabilities,
						mode: "safe",
					}),
				}));
				const skipOutcomes: AdapterMigrationOutcome[] = skipParse.matches.map((match) => ({
					sourceStart: match.start,
					sourceText: match.sourceText,
					outcome: StyleMigrationOutcome.Residual,
					representation: StyleRepresentationKind.Residual,
					detail: "stylesheet rules are preserved by the conservative authored-css path",
				}));
				// Without the compiler the preprocessor features cannot be
				// inlined, so this outcome is an explicit skip: preserved
				// source, visible marker, and a capability residual.
				const capabilityResiduals: readonly StyleProgramResidual[] =
					context.sourceConfig.adapter === CodemodAdapterId.CssModules
						? [
								{
									kind: StyleProgramResidualKindTag.Capability,
									text: context.file,
									hint: "CSS Modules local class scoping does not survive the authored-css target",
								},
							]
						: context.sourceConfig.adapter === CodemodAdapterId.Sass ||
							  context.sourceConfig.adapter === CodemodAdapterId.Less
							? [
									{
										kind: StyleProgramResidualKindTag.Capability,
										text: context.file,
										hint: "preprocessor features require the official compiler to inline before authored-css output",
									},
								]
							: [];
				const code =
					capabilityResiduals.length === 0
						? context.source
						: MigrationDiagnostics.skipMarker({
								marker: "pandwind:migrate-skip",
								loweringResiduals: capabilityResiduals,
							}) +
							"\n" +
							context.source;
				return {
					code,
					outputExtension:
						context.sourceConfig.adapter === CodemodAdapterId.Sass ||
						context.sourceConfig.adapter === CodemodAdapterId.Less
							? ".css"
							: undefined,
					changed:
						context.sourceConfig.adapter === CodemodAdapterId.Sass ||
						context.sourceConfig.adapter === CodemodAdapterId.Less,
					converted: 0,
					skipped: capabilityResiduals.length === 0 ? 0 : 1,
					generatedFiles: [],
					loweringPlans: skipLoweringPlans,
					outcomes: skipOutcomes,
					residuals: capabilityResiduals,
					dependencies: [],
				};
			}
			const residuals: StyleProgramResidual[] = [];
			const matches: AdapterParseResult["matches"][number][] = [];
			const visited = new Set<string>();
			const importedFile = (file: string, specifier: string): string | undefined => {
				const raw = specifier
					.replace(/^url\((.*)\)$/u, "$1")
					.trim()
					.replace(/^['"]|['"]$/gu, "");
				if (raw.length === 0) return undefined;
				if (!raw.startsWith(".") && !raw.startsWith("/")) return undefined;
				const base = isAbsoluteDocumentPath(raw)
					? raw
					: joinDocumentPath(dirnameDocumentPath(file), raw);
				return [
					base,
					`${base}.css`,
					`${base}.scss`,
					`${base}.sass`,
					`${base}.less`,
					`${base}/index.css`,
				].find((candidate) => context.readFile?.(candidate) !== undefined);
			};
			const visit = (file: string, source: string): void => {
				const normalizedFile = joinDocumentPath(file);
				if (visited.has(normalizedFile)) return;
				visited.add(normalizedFile);
				const parseContext: AdapterParseContext = {
					file: normalizedFile,
					source,
					root: context.root,
					config: context.sourceConfig,
					readFile: context.readFile,
				};
				const parsed = parseStylesheetPrograms(source, parseContext, port);
				residuals.push(...parsed.residuals);
				for (const match of parsed.matches) matches.push(match);
				const document = port.parse(source);
				for (const node of document.nodes) {
					if (
						node.kind !== StylesheetSourceNodeKindTag.Statement ||
						!node.prelude.startsWith("@import")
					)
						continue;
					const importMatch = /^@import\s+((?:url\([^)]*\)|["'][^"']+["']))/u.exec(node.prelude);
					const specifier = importMatch?.[1]?.trim();
					const imported =
						specifier === undefined ? undefined : importedFile(normalizedFile, specifier);
					if (imported === undefined) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Configuration,
							text: node.prelude,
							hint: "unresolved stylesheet imports require the project's stylesheet resolver",
						});
						continue;
					}
					const importedSource = context.readFile?.(imported);
					if (importedSource === undefined) {
						residuals.push({
							kind: StyleProgramResidualKindTag.Configuration,
							text: node.prelude,
							hint: "stylesheet import could not be read from the project workspace",
						});
						continue;
					}
					visit(imported, importedSource);
				}
			};
			visit(context.file, context.source);
			const imports = new Set<string>();
			const entries: string[] = [];
			const emittedTexts: string[] = [];
			const emittedSemantics: Array<StyleProgram | undefined> = [];
			const emissionResiduals: Array<readonly StyleProgramResidual[]> = [];
			const generatedStatements = new Set<string>();
			const emittedPreambles: string[] = [];
			const names = new Set<string>();
			const loweringPlans: StyleLoweringPlan[] = [];
			const sourcePrograms: StyleProgram[] = [];
			for (const [index, match] of matches.entries()) {
				const sourceProgram = stylesheetClassProgram(match.program);
				sourcePrograms.push(sourceProgram);
				const lowering = STYLE_LOWERING_REGISTRY.plan({
					program: sourceProgram,
					target: context.target.capabilities,
					mode: "safe",
					hostFramework:
						context.target.migration?.targetPolicy?.handlesFrameworkSemantics === true,
				});
				loweringPlans.push(lowering);
				const rule = match.program.rules[0];
				const name = rule?.name;
				if (rule === undefined || name === undefined || !/^[A-Za-z_$][\w$-]*$/u.test(name)) {
					residuals.push({
						kind: StyleProgramResidualKindTag.Capability,
						text: rule?.selector ?? match.sourceText,
						hint: "stylesheet migration requires a single local class selector",
					});
					continue;
				}
				if (names.has(name)) {
					residuals.push({
						kind: StyleProgramResidualKindTag.Capability,
						text: name,
						hint: "imported stylesheet classes must have unique exported names",
					});
					continue;
				}
				names.add(name);
				const capabilityReport = inspectAdapterCapabilities(
					context.target.capabilities,
					lowering.program,
					"safe",
				);
				const resolvedCapabilities = new Set(lowering.resolvedCapabilities ?? []);
				const effectiveCapabilityReport =
					resolvedCapabilities.size === 0
						? capabilityReport
						: {
								...capabilityReport,
								blockers: capabilityReport.blockers.filter(
									(issue) => !resolvedCapabilities.has(issue.capability),
								),
								convertible: capabilityReport.blockers.every(
									(issue) => resolvedCapabilities.has(issue.capability),
								),
							};
				const semanticResiduals = [
					...lowering.program.residuals,
					...lowering.residuals,
				].filter((residual) => residual.preserved !== true);
				if (!effectiveCapabilityReport.convertible || semanticResiduals.length > 0) {
					residuals.push(
						...lowering.program.residuals,
						...lowering.residuals,
						...(effectiveCapabilityReport.blockers.length === 0
							? []
							: [
									{
										kind: StyleProgramResidualKindTag.Capability,
										text: match.sourceText,
										hint: effectiveCapabilityReport.blockers
											.map((issue) => `${issue.capability}: ${issue.detail}`)
											.join("; "),
									},
								]),
					);
					continue;
				}
				const program = lowering.program;
				const emitContext: AdapterEmitContext = {
					file: context.file,
					config: context.targetConfig,
					mode: "safe",
					capability: effectiveCapabilityReport,
					index,
				};
				const emission = context.target.emit(
					context.target.tokenPolicy?.preserve(program, emitContext) ?? program,
					emitContext,
				);
				emittedSemantics[index] = emission.semantic;
				emissionResiduals[index] = emission.residuals;
				for (const statement of emission.imports ?? []) imports.add(statement);
				for (const statement of emission.generatedStatements ?? []) generatedStatements.add(statement);
				emittedPreambles[index] = [
					...MigrationOutput.consolidateImports(emission.imports ?? []),
					...(emission.generatedStatements ?? []),
				]
					.join("\n");
				residuals.push(...emission.residuals);
				if (emission.generatedFiles !== undefined)
					residuals.push({
						kind: "generated-file",
						text: name,
						hint: "nested generated artifacts require project-level file ownership",
					});
				entries.push(`${JSON.stringify(name)}: ${emission.text}`);
				emittedTexts.push(emission.text);
			}
			if (residuals.length > 0 || entries.length !== matches.length || entries.length === 0) {
				const skipResiduals: StyleProgramResidual[] =
					residuals.length > 0
						? residuals
						: [
								{
									kind: StyleProgramResidualKindTag.Capability,
									text: context.file,
									hint: "stylesheet rules could not be lowered to the target without loss",
								},
							];
				// The matrix/contract gates consume the same lowering evidence the
				// per-match runner emits; a conservative skip without a plan would
				// hide the decision the route actually made. Each skipped match
				// stays visible as an explicit residual outcome.
				const skipLoweringPlans: StyleLoweringPlan[] = matches.map((match, index) => ({
					...STYLE_LOWERING_REGISTRY.plan({
						program: sourcePrograms[index] ?? stylesheetClassProgram(match.program),
						target: context.target.capabilities,
						mode: "safe",
						hostFramework:
							context.target.migration?.targetPolicy?.handlesFrameworkSemantics === true,
					}),
				}));
				const skipOutcomes: AdapterMigrationOutcome[] = matches.map((match) => ({
					sourceStart: match.start,
					sourceText: match.sourceText,
					outcome: StyleMigrationOutcome.Residual,
					representation: StyleRepresentationKind.Residual,
					detail: "stylesheet migration preserved the source with residuals",
				}));
				const code =
					MigrationDiagnostics.skipMarker({
						marker: "pandwind:migrate-skip",
						loweringResiduals: skipResiduals,
					}) +
					"\n" +
					context.source;
				return {
					code,
					changed: false,
					converted: 0,
					skipped: Math.max(1, skipResiduals.length),
					generatedFiles: [],
					loweringPlans: skipLoweringPlans,
					fileChanges: [],
					residuals: skipResiduals,
					outcomes: skipOutcomes,
					dependencies: [],
				};
			}
			const outcomes = matches.map((match, index) => {
				const plan = loweringPlans[index];
				const representation = plan?.representation ?? StyleRepresentationKind.Static;
				const hasDynamic =
					StyleProgramAnalysis.hasDynamic(match.program) ||
					StyleProgramAnalysis.hasDynamic(plan?.program ?? match.program);
				if ((plan?.residuals.length ?? 0) > 0 || (plan?.program.residuals.length ?? 0) > 0) {
					return {
						sourceStart: match.start,
						sourceText: match.sourceText,
						outcome: StyleMigrationOutcome.Residual,
						representation,
						detail: "semantic residual remains after lowering",
					};
				}
				if (representation === StyleRepresentationKind.PortableArtifact || hasDynamic) {
					return {
						sourceStart: match.start,
						sourceText: match.sourceText,
						outcome: StyleMigrationOutcome.HostRuntime,
						representation,
					};
				}
				return {
					sourceStart: match.start,
					sourceText: match.sourceText,
					outcome:
						representation === StyleRepresentationKind.Static
							? StyleMigrationOutcome.Static
							: StyleMigrationOutcome.TargetNative,
					representation,
				};
			});
			if (isStylesheetFamilyConfig(context.targetConfig))
				return stylesheetFamilyArtifact(context, matches, loweringPlans, outcomes);
			const code = [
				MigrationOutput.consolidateImports(imports).join("\n"),
				[...generatedStatements].join("\n"),
				`export const styles = { ${entries.join(", ")} };`,
				"export default styles;",
			]
				.filter((line) => line.length > 0)
				.join("\n");
			// The migration owns canonical parity evidence for stylesheet files:
			// reparse every emitted entry through the target adapter and validate
			// the semantic round trip exactly like the call-site path does.
			const validations: AdapterValidationResult[] = matches.map((match, index) => {
				// The stylesheet class identity moves into the exported class-map
				// binding, so the source rule compares at the same selector-less
				// shape the emitted css.class expression reparses to.
				const sourceProgram = sourcePrograms[index] ?? stylesheetClassProgram(match.program);
				const validationExpression = MigrationOutput.validationSource(
					emittedTexts[index] ?? "",
					sourceProgram,
				);
				const validationSource = [emittedPreambles[index] ?? "", validationExpression]
					.filter((line) => line.length > 0)
					.join("\n");
				const reparsed = context.target.parse(validationSource, {
					file: context.file,
					source: validationSource,
					root: context.sourceConfig.root,
					config: context.targetConfig,
					...(context.readFile === undefined ? {} : { readFile: context.readFile }),
				});
				const parseResiduals =
					reparsed.matches.length === 0
						? [
								...reparsed.residuals,
								{
									kind: StyleProgramResidualKindTag.Parse,
									text: emittedTexts[index] ?? "",
									hint: "target emission could not be parsed by its adapter",
								},
							]
						: reparsed.residuals;
				const targetProgram =
					emittedSemantics[index] ??
					styleProgramFromRules(
						reparsed.matches.flatMap((candidate) => candidate.program.rules),
						{
							source: sourceProgram.source,
							residuals: parseResiduals,
							canonicalization: sourceProgram.canonicalization,
						},
					);
				return context.target.validate(sourceProgram, targetProgram, [
					...parseResiduals,
					...(emissionResiduals[index] ?? []),
				]);
			});
			const invalidValidations = validations.filter((validation) => !validation.valid);
			if (invalidValidations.length > 0) {
				const validationResiduals: StyleProgramResidual[] = invalidValidations.map((validation) => ({
					kind: StyleProgramResidualKindTag.Capability,
					text: validation.canonicalTarget,
					hint: `target emission failed canonical validation: ${validation.differences.join(", ")}`,
				}));
				const code =
					MigrationDiagnostics.skipMarker({
						marker: "pandwind:migrate-skip",
						loweringResiduals: validationResiduals,
					}) +
					"\n" +
					context.source;
				return {
					code,
					changed: false,
					converted: 0,
					skipped: Math.max(1, validationResiduals.length),
					generatedFiles: [],
					fileChanges: [],
					residuals: validationResiduals,
					dependencies: [],
					validations,
					loweringPlans,
					outcomes: matches.map((match, index) => ({
						sourceStart: match.start,
						sourceText: match.sourceText,
						outcome: StyleMigrationOutcome.Residual,
						representation:
							loweringPlans[index]?.representation ?? StyleRepresentationKind.Residual,
					})),
				};
			}
			return {
				code,
				outputExtension: ".ts",
				changed: code !== context.source,
				converted: entries.length,
				skipped: 0,
				generatedFiles: [],
				fileChanges:
					context.sourceConfig.adapter === CodemodAdapterId.CssModules
						? cssModuleConsumerChanges(context, `${context.file.replace(/\.[^.]+$/u, "")}.ts`)
						: [],
				residuals: [],
				dependencies: [context.target.dependencies],
				validations,
				loweringPlans,
				outcomes,
			};
		},
	};
}

/**
 * A stylesheet-family target stays in the authored document dialect: the
 * artifact is authored CSS with the original selector preserved, not a TS
 * class-map, which is not valid source for that family.
 */
function stylesheetFamilyArtifact(
	context: AdapterFileMigrationContext,
	matches: readonly AdapterMatch[],
	loweringPlans: readonly StyleLoweringPlan[],
	outcomes: readonly AdapterMigrationOutcome[],
): AdapterFileMigrationResult {
	const dashCase = (property: string): string =>
		property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
	// The artifact is authored CSS for a stylesheet-family target: property
	// names must be hyphenated even though the style IR stores the camelCase
	// object-key spelling. The parser applied the exact reverse transform, so
	// this is a lossless re-render, and the validation reparse camelCases the
	// artifact back to the identical canonical shape.
	const authoredRule = (rule: StyleRule): StyleRule => ({
		...rule,
		declarations: rule.declarations.map((declaration) => ({
			...declaration,
			property: dashCase(declaration.property),
		})),
		children: rule.children.map(authoredRule),
	});
	const authoredProgram = (match: AdapterMatch): StyleProgram => ({
		...match.program,
		rules: match.program.rules.map(authoredRule),
	});
	const code = matches
		.map((match) => styleProgramToCanonicalCss(authoredProgram(match)))
		.join("\n\n");
	const validations: AdapterValidationResult[] = matches.map((match) => {
		// Each match is emitted as its own canonical slice of the artifact, so
		// the semantic round trip compares that slice, not the whole document:
		// the full-document reparse would fold sibling rules into every
		// per-rule validation and mark correct conversions invalid.
		const matchCode = styleProgramToCanonicalCss(authoredProgram(match));
		const reparsed = context.target.parse(matchCode, {
			file: context.file,
			source: matchCode,
			root: context.sourceConfig.root,
			config: context.targetConfig,
			...(context.readFile === undefined ? {} : { readFile: context.readFile }),
		});
		const targetProgram =
			reparsed.matches.length === 0
				? match.program
				: styleProgramFromRules(
						reparsed.matches.flatMap((candidate) => candidate.program.rules),
						{
							source: match.program.source,
							residuals: reparsed.residuals,
							canonicalization: match.program.canonicalization,
						},
					);
		return context.target.validate(match.program, targetProgram, reparsed.residuals);
	});
	return {
		code,
		outputExtension: stylesheetFamilyExtension(context.targetConfig),
		changed: code !== context.source,
		converted: matches.length,
		skipped: 0,
		generatedFiles: [],
		fileChanges: [],
		residuals: [],
		dependencies: [context.target.dependencies],
		validations,
		loweringPlans,
		outcomes,
	};
}
export function createPreprocessorFileMigration(
	base: AdapterFileMigration,
	compiler: StylesheetCompilerPort | undefined,
): AdapterFileMigration {
	return {
		run: base.run,
		runAsync: async (context) => {
			if (compiler === undefined) {
				const code =
					MigrationDiagnostics.skipMarker({
						marker: "pandwind:migrate-skip",
						configurationResiduals: [
							{
								kind: StyleProgramResidualKindTag.Configuration,
								text: context.file,
								hint: "the official preprocessor package is not installed in the project",
							},
						],
					}) +
					"\n" +
					context.source;
				return {
					code,
					changed: false,
					converted: 0,
					skipped: 1,
					generatedFiles: [],
					loweringPlans: [],
					fileChanges: [],
					residuals: [
						{
							kind: StyleProgramResidualKindTag.Configuration,
							text: context.file,
							hint: "the official preprocessor package is not installed in the project",
						},
					],
					dependencies: [],
				};
			}
			let compiled: StylesheetCompilerResult;
			try {
				compiled = await compiler.compile(context.source, {
					file: context.file,
					root: context.root,
				});
			} catch (error) {
				const code =
					MigrationDiagnostics.skipMarker({
						marker: "pandwind:migrate-skip",
						configurationResiduals: [
							{
								kind: StyleProgramResidualKindTag.Configuration,
								text: context.file,
								hint: `official preprocessor compilation failed: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					}) +
					"\n" +
					context.source;
				return {
					code,
					changed: false,
					converted: 0,
					skipped: 1,
					generatedFiles: [],
					fileChanges: [],
					residuals: [
						{
							kind: StyleProgramResidualKindTag.Configuration,
							text: context.file,
							hint: `official preprocessor compilation failed: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					loweringPlans: [],
					dependencies: [],
				};
			}
			const result = base.run({ ...context, source: compiled.css });
			if (context.target.id === CodemodAdapterId.AuthoredCss) {
				// Compilation inlined the preprocessor features, so the authored
				// target receives plain CSS. Reparse the compiled document through
				// the target contract so the result records real converted rules and
				// canonical validation rather than looking like a silent no-op.
				const parsed = parseStylesheetPrograms(compiled.css, {
					file: context.file,
					source: compiled.css,
					root: context.root,
					config: context.targetConfig,
					...(context.readFile === undefined ? {} : { readFile: context.readFile }),
				});
				const plans = parsed.matches.map((match) =>
					STYLE_LOWERING_REGISTRY.plan({
						program: match.program,
						target: context.target.capabilities,
						mode: "safe",
					}),
				);
				const validations = parsed.matches.map((match) => {
					const reparsed = context.target.parse(match.sourceText, {
						file: context.file,
						source: match.sourceText,
						root: context.root,
						config: context.targetConfig,
						...(context.readFile === undefined ? {} : { readFile: context.readFile }),
					});
					const targetProgram = styleProgramFromRules(
						reparsed.matches.flatMap((candidate) => candidate.program.rules),
						{
							source: match.program.source,
							residuals: reparsed.residuals,
							canonicalization: match.program.canonicalization,
						},
					);
					return context.target.validate(match.program, targetProgram, reparsed.residuals);
				});
				const residuals = [...parsed.residuals];
				const converted = residuals.length === 0 ? parsed.matches.length : 0;
				const skipped = residuals.length === 0 ? 0 : 1;
				const code =
					residuals.length === 0
						? compiled.css
						: MigrationDiagnostics.skipMarker({
								marker: "pandwind:migrate-skip",
								loweringResiduals: residuals,
							}) +
							"\n" +
							compiled.css;
				return {
					code,
					outputExtension: ".css",
					changed: compiled.css !== context.source,
					converted,
					skipped,
					generatedFiles: [],
					loweringPlans: plans,
					fileChanges: [],
					residuals,
					validations,
					outcomes: parsed.matches.map((match, index) => ({
						sourceStart: match.start,
						sourceText: match.sourceText,
						outcome:
							residuals.length === 0
								? StyleMigrationOutcome.Static
								: StyleMigrationOutcome.Residual,
						representation:
								plans[index]?.representation ?? StyleRepresentationKind.Residual,
					})),
					dependencies:
						compiled.dependencies === undefined
							? []
							: [{ packages: [], files: compiled.dependencies }],
					...(compiled.sourceMap === undefined ? {} : { sourceMaps: [compiled.sourceMap] }),
				};
			}
			return {
				...result,
				// Compilation already resolved the preprocessor features; only
				// residuals produced by the compiled source itself are relevant.
				residuals: result.residuals.filter(
					(residual) =>
						!(
							residual.kind === StyleProgramResidualKindTag.Capability &&
							residual.hint?.includes("official compiler") === true
						),
				),
				...(compiled.sourceMap === undefined
					? {}
					: { sourceMaps: [...(result.sourceMaps ?? []), compiled.sourceMap] }),
				dependencies: [
					...result.dependencies,
					...(compiled.dependencies === undefined
						? []
						: [{ packages: [], files: compiled.dependencies }]),
				],
			};
		},
	};
}

function cssModuleConsumerChanges(
	context: Parameters<AdapterFileMigration["run"]>[0],
	outputFile: string,
): readonly import("./adapter-contract.ts").AdapterFileChange[] {
	if (context.root === undefined || context.listFiles === undefined) return [];
	const sourceFile = isAbsoluteDocumentPath(context.file)
		? joinDocumentPath(context.file)
		: joinDocumentPath(context.root, context.file);
	const changes: import("./adapter-contract.ts").AdapterFileChange[] = [];
	for (const listedFile of context.listFiles(context.root)) {
		const consumerFile = isAbsoluteDocumentPath(listedFile)
			? joinDocumentPath(listedFile)
			: joinDocumentPath(context.root, listedFile);
		if (consumerFile === sourceFile || /\.(?:css|scss|sass|less)$/iu.test(consumerFile)) continue;
		const source = context.readFile?.(listedFile);
		if (source === undefined) continue;
		const targetFile = isAbsoluteDocumentPath(outputFile)
			? joinDocumentPath(outputFile)
			: joinDocumentPath(context.root, outputFile);
		const oldSpecifier = relativeDocumentPath(dirnameDocumentPath(consumerFile), sourceFile);
		const newSpecifier = relativeDocumentPath(dirnameDocumentPath(consumerFile), targetFile);
		const normalizedOld = oldSpecifier.replace(/^\.\//u, "");
		let hasStaticImport = false;
		try {
			const scanned = SOURCE_SCANNER_SERVICE.scan({
				file: consumerFile,
				source,
			});
			const bindings = SourceBindings.fromDocument(scanned.document);
			hasStaticImport = bindings.fromModule(oldSpecifier).length > 0;
		} catch {
			// A malformed consumer is not safe to rewrite from a text match.
		}
		if (!hasStaticImport) continue;
		let changed = false;
		const code = source.replace(
			/(\bfrom\s*|\bimport\s*\(|\brequire\s*\()(["'])([^"']+)(["'])/gu,
			(full, prefix: string, quote: string, specifier: string, close: string) => {
				if (specifier.replace(/^\.\//u, "") !== normalizedOld) return full;
				changed = true;
				const relativePrefix = specifier.startsWith("./") ? "./" : "";
				return `${prefix}${quote}${relativePrefix}${newSpecifier}${close}`;
			},
		);
		if (changed) {
			const path = isAbsoluteDocumentPath(listedFile)
				? relativeDocumentPath(context.root, listedFile)
				: joinDocumentPath(listedFile);
			changes.push({ path, content: code, expectedContent: source });
		}
	}
	return changes;
}
export interface StylesheetSourcePort {
	parse(source: string): StylesheetSourceDocument;
}

/**
 * Delimiter scanning must treat a ${` + q(`...`) + `} interpolation as an opaque unit:
 * its braces and semicolons belong to the embedded expression, never to the
 * surrounding CSS grammar.
 */
const skipInterpolation = (source: string, start: number, end: number): number => {
	if (source[start] !== "$" || source[start + 1] !== "{") return start;
	let depth = 1;
	let index = start + 2;
	while (index < end && depth > 0) {
		const character = source[index]!;
		if (character === "'") {
			const close = source.indexOf('"', index + 1);
			index = close === -1 ? end : close;
		} else if (character === '"') {
			const close = source.indexOf('"', index + 1);
			index = close === -1 ? end : close;
		} else if (character === "{") depth++;
		else if (character === "}") depth--;
		index++;
	}
	return depth === 0 ? index : end + 1;
};
