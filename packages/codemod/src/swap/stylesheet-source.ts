import {
	SemanticConditionKindTag,
	StyleRuleKindTag,
	styleProgramFromRules,
	type StyleCondition,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramResidual,
} from "./semantic-ir.ts";
import type {
	AdapterFileMigration,
	AdapterFileMigrationResult,
	AdapterParseContext,
	AdapterParseResult,
	AdapterEmitContext,
} from "./adapter-contract.ts";
import { CodemodAdapterId } from "./identifiers.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../path-utils.ts";

export interface StylesheetSourceNode {
	readonly kind: "rule" | "at-rule" | "statement";
	readonly prelude: string;
	readonly start: number;
	readonly end: number;
	readonly body?: readonly StylesheetSourceNode[];
}

export interface StylesheetSourceDocument {
	readonly nodes: readonly StylesheetSourceNode[];
	readonly residuals: readonly StyleProgramResidual[];
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

function skipTrivia(source: string, start: number, end: number): number {
	let index = start;
	while (index < end) {
		if (/\s/u.test(source[index] ?? "")) {
			index++;
			continue;
		}
		if (source[index] === "/" && source[index + 1] === "*") {
			const close = source.indexOf("*/", index + 2);
			index = close === -1 ? end : close + 2;
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
		const contentStart = skipTrivia(source, cursor, end);
		if (contentStart >= end) break;
		const delimiter = delimiterAt(source, contentStart, end);
		if (delimiter === undefined) {
			residuals.push({
				kind: "parse",
				text: source.slice(contentStart, end),
				hint: "stylesheet statement has no terminator",
			});
			break;
		}
		if (delimiter.kind === "}") {
			residuals.push({
				kind: "parse",
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
			nodes.push({ kind: "statement", prelude, start: contentStart, end: delimiter.index + 1 });
			cursor = delimiter.index + 1;
			continue;
		}
		const close = closingBrace(source, delimiter.index, end);
		if (close === undefined) {
			residuals.push({
				kind: "parse",
				text: source.slice(contentStart, end),
				hint: "stylesheet block is unbalanced",
			});
			break;
		}
		const nested = parseNodes(source, delimiter.index + 1, close);
		nodes.push({
			kind: prelude.startsWith("@") ? "at-rule" : "rule",
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
	context: AdapterParseContext,
): { declarations: StyleDeclaration[]; residuals: StyleProgramResidual[] } {
	const values: StyleDeclaration[] = [];
	const residuals: StyleProgramResidual[] = [];
	for (const child of node.body ?? []) {
		if (child.kind !== "statement") {
			residuals.push({
				kind: "nesting",
				text: child.prelude,
				hint: "nested stylesheet rules require selector-aware lowering",
			});
			continue;
		}
		const colon = child.prelude.indexOf(":");
		if (colon <= 0) {
			residuals.push({
				kind: "parse",
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
				kind: "composition",
				text: child.prelude,
				hint: "preprocessor or CSS Modules composition needs its source context",
			});
			continue;
		}
		values.push({
			conditions: [],
			property: propertyName(property),
			value: { kind: "literal", value },
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
		if (child.kind === "rule") {
			if (
				/\([^()]*\)$/u.test(child.prelude) &&
				(context.config.adapter === CodemodAdapterId.Sass ||
					context.config.adapter === CodemodAdapterId.Less)
			) {
				residuals.push({
					kind: "composition",
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
		if (child.kind === "at-rule") {
			const nestedCondition = condition(child.prelude);
			if (nestedCondition !== undefined) {
				for (const nestedChild of child.body ?? []) {
					if (nestedChild.kind !== "rule") {
						residuals.push({
							kind: "capability",
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
				kind: "capability",
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
	if (node.kind === "rule") {
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
	if (node.kind === "statement") {
		if (!node.prelude.startsWith("@import") && !node.prelude.startsWith("@charset"))
			residuals.push({
				kind: "parse",
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
			.filter((child) => child.kind === "rule")
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
		kind: "capability",
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
			if (context.target.id === CodemodAdapterId.AuthoredCss)
				return {
					code: context.source,
					changed: false,
					converted: 0,
					skipped: 0,
					generatedFiles: [],
					residuals: [],
					dependencies: [],
				};
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
					if (node.kind !== "statement" || !node.prelude.startsWith("@import")) continue;
					const importMatch = /^@import\s+((?:url\([^)]*\)|["'][^"']+["']))/u.exec(node.prelude);
					const specifier = importMatch?.[1]?.trim();
					const imported =
						specifier === undefined ? undefined : importedFile(normalizedFile, specifier);
					if (imported === undefined) {
						residuals.push({
							kind: "configuration",
							text: node.prelude,
							hint: "unresolved stylesheet imports require the project's stylesheet resolver",
						});
						continue;
					}
					const importedSource = context.readFile?.(imported);
					if (importedSource === undefined) {
						residuals.push({
							kind: "configuration",
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
			const names = new Set<string>();
			for (const [index, match] of matches.entries()) {
				const rule = match.program.rules[0];
				const name = rule?.name;
				if (rule === undefined || name === undefined || !/^[A-Za-z_$][\w$]*$/u.test(name)) {
					residuals.push({
						kind: "capability",
						text: rule?.selector ?? match.sourceText,
						hint: "stylesheet migration requires a single local class selector",
					});
					continue;
				}
				if (names.has(name)) {
					residuals.push({
						kind: "capability",
						text: name,
						hint: "imported stylesheet classes must have unique exported names",
					});
					continue;
				}
				names.add(name);
				const program = {
					...match.program,
					rules: match.program.rules.map((item) => ({ ...item, name: undefined })),
				};
				const emission = context.target.emit(program, {
					file: context.file,
					config: context.targetConfig,
					mode: "safe",
					index,
				} as AdapterEmitContext);
				for (const statement of emission.imports ?? []) imports.add(statement);
				residuals.push(...emission.residuals);
				if (emission.generatedFiles !== undefined)
					residuals.push({
						kind: "generated-file",
						text: name,
						hint: "nested generated artifacts require project-level file ownership",
					});
				entries.push(`${JSON.stringify(name)}: ${emission.text}`);
			}
			if (residuals.length > 0 || entries.length !== matches.length || entries.length === 0)
				return {
					code: context.source,
					changed: false,
					converted: 0,
					skipped: Math.max(1, residuals.length),
					generatedFiles: [],
					fileChanges: [],
					residuals,
					dependencies: [],
				};
			const code = [
				[...imports].join("\n"),
				`export const styles = { ${entries.join(", ")} };`,
				"export default styles;",
			]
				.filter((line) => line.length > 0)
				.join("\n");
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
			};
		},
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
				return {
					code: context.source,
					changed: false,
					converted: 0,
					skipped: 1,
					generatedFiles: [],
					fileChanges: [],
					residuals: [
						{
							kind: "configuration",
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
				return {
					code: context.source,
					changed: false,
					converted: 0,
					skipped: 1,
					generatedFiles: [],
					fileChanges: [],
					residuals: [
						{
							kind: "configuration",
							text: context.file,
							hint: `official preprocessor compilation failed: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					dependencies: [],
				};
			}
			const result = base.run({ ...context, source: compiled.css });
			return {
				...result,
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
