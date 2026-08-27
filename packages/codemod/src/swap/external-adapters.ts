import { join } from "node:path";
import { readFileSync } from "node:fs";
import { applyEdits } from "../migrate.ts";
import { matchBlock } from "../sources.ts";
import { computeExcludedRanges } from "pandwind/source";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterConfigContext,
	type AdapterDependencies,
	type AdapterDetectionContext,
	type AdapterEmitContext,
	type AdapterEmitResult,
	type AdapterMigrationHooks,
	type AdapterLossiness,
	type AdapterMatch,
	type AdapterParseContext,
	type AdapterParseResult,
	type AdapterProjectConfig,
	type AdapterValidationResult,
	type StyleAdapter,
} from "./adapter-contract.ts";
import {
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramToCanonicalCss,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
	type StyleProgramSource,
} from "./semantic-ir.ts";
import { findTemplateLiteralEnd } from "./adapter-template-parser.ts";

/** Adapter ids are registry-defined so adding an adapter does not require a central union edit. */
export type ExternalAdapterId = string;

type CallPattern = {
	readonly name: string;
	readonly regex: RegExp;
	readonly form?: "object" | "template" | "reference";
	readonly kind?: "style" | "styled" | "keyframes" | "global" | "font-face";
	readonly objectKind?: StyleProgramOptions["nestedObjectKind"];
};

export type AdapterSourceObjectOptions = Pick<
	StyleProgramOptions,
	| "nestedObjectKind"
	| "unwrapNestedObjectKeys"
	| "variantContainerKeys"
	| "computedKeys"
	| "dynamicReferences"
>;
export type AdapterSourceObjectOptionsProvider =
	| AdapterSourceObjectOptions
	| ((source: string) => AdapterSourceObjectOptions);

export interface AdapterRenderers {
	readonly firstKind: (program: StyleProgram) => StyleProgram["rules"][number]["kind"];
	readonly programObject: (program: StyleProgram) => string;
	readonly declarationsObject: (
		declarations: readonly StyleProgram["declarations"][number][],
	) => string;
	readonly templateCss: (program: StyleProgram) => string;
}

export interface CodemodAdapterSpec {
	readonly id: ExternalAdapterId;
	readonly patterns: readonly CallPattern[];
	readonly packages: AdapterDependencies;
	readonly capabilities: AdapterCapabilities;
	readonly detectPatterns: readonly RegExp[];
	readonly sourceModules: readonly string[];
	readonly configFiles?: readonly string[];
	readonly sourceObjectOptions?: AdapterSourceObjectOptionsProvider;
	readonly migration?: AdapterMigrationHooks;
	emit(
		program: StyleProgram,
		renderers: AdapterRenderers,
		context?: AdapterEmitContext,
	): Pick<AdapterEmitResult, "text" | "imports">;
}

export function dependency(
	name: string,
	kind: AdapterDependencies["packages"][number]["kind"],
): AdapterDependencies {
	return { packages: [{ name, kind }] };
}

export function allRuleCapabilities(
	adapterId: string,
	dynamic: "exact" | "partial" | "unsupported",
	capabilities: Partial<AdapterCapabilities["capabilities"]> = {},
): AdapterCapabilities {
	return {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: adapterId,
		capabilities: {
			declarations: "exact",
			"rule-level": "exact",
			"global-rules": "exact",
			keyframes: "exact",
			"font-face": "exact",
			layers: "exact",
			"supports-rules": "exact",
			"property-rules": "exact",
			selectors: "exact",
			nesting: "exact",
			ordering: "exact",
			"token-values": "exact",
			"dynamic-values": dynamic,
			"pseudo-conditions": "exact",
			"selector-conditions": "exact",
			"media-conditions": "exact",
			"container-conditions": "exact",
			"supports-conditions": "exact",
			...capabilities,
		},
	};
}

function configFor(
	id: string,
	configFiles: readonly string[],
	context: AdapterConfigContext,
): AdapterProjectConfig {
	const files: string[] = [];
	const values: Record<string, unknown> = {};
	const readFile =
		context.readFile ??
		((file: string) => {
			try {
				return readFileSync(file, "utf8");
			} catch {
				return undefined;
			}
		});
	const packageText =
		context.packageJson === undefined && context.root !== undefined && readFile !== undefined
			? readFile(join(context.root, "package.json"))
			: undefined;
	let packageJson = context.packageJson;
	if (packageJson === undefined && packageText !== undefined) {
		try {
			packageJson = JSON.parse(packageText) as Readonly<Record<string, unknown>>;
		} catch {
			values.packageJsonError = "package.json could not be parsed";
		}
	}
	if (packageJson !== undefined) values.packageJson = packageJson;
	for (const relative of configFiles) {
		if (context.root === undefined || readFile === undefined) continue;
		const file = join(context.root, relative);
		const text = readFile(file);
		if (text === undefined) continue;
		files.push(file);
		if (relative.endsWith(".json")) {
			try {
				values[relative] = JSON.parse(text);
			} catch {
				values[`${relative}:error`] = "configuration JSON could not be parsed";
			}
		} else {
			values[relative] = text;
		}
	}
	return { adapter: id, root: context.root, files, values };
}

function detectBy(
	patterns: readonly RegExp[],
	context: AdapterDetectionContext,
): { matched: boolean; confidence: number; evidence: string[] } {
	const evidence = patterns.flatMap((pattern) => {
		pattern.lastIndex = 0;
		const matched = pattern.test(context.source);
		pattern.lastIndex = 0;
		return matched ? [pattern.source] : [];
	});
	return {
		matched: evidence.length > 0,
		confidence: evidence.length === 0 ? 0 : Math.min(1, 0.5 + evidence.length * 0.2),
		evidence,
	};
}

function sourceName(source: string, start: number, fallback: string): string {
	const prefix = source.slice(Math.max(0, start - 160), start);
	return prefix.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*$/)?.[1] ?? fallback;
}

function adapterSource(
	context: AdapterParseContext,
	start: number,
	extra: Partial<StyleProgramSource> = {},
): StyleProgramSource {
	return {
		file: context.file,
		start,
		adapter: context.config.adapter,
		...(context.document?.framework ? { framework: context.document.framework } : {}),
		...extra,
	};
}

function styledSubject(source: string, start: number): Partial<StyleProgramSource> {
	const match = source.slice(start).match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))/);
	if (match?.[1] === undefined) return {};
	const subject = `styled${match[1].replace(/\s+/g, " ").replace(/\.\s+/g, ".")}`;
	return { subject, subjectKind: match[1].trim().startsWith(".") ? "member" : "call" };
}

function conditionKey(condition: StyleProgram["rules"][number]["conditions"][number]): string {
	if (condition.raw !== undefined) return condition.raw;
	if (condition.kind === "pseudo")
		return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
	if (condition.kind === "media")
		return condition.value === undefined ? condition.name : `@media ${condition.value}`;
	if (condition.kind === "container")
		return condition.value === undefined ? condition.name : `@container ${condition.value}`;
	if (condition.kind === "supports")
		return condition.value === undefined ? condition.name : `@supports ${condition.value}`;
	return condition.name;
}

type ObjectNode = { entries: Array<[string, string]>; children: Array<[string, ObjectNode]> };

function objectNode(): ObjectNode {
	return { entries: [], children: [] };
}

function renderValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function renderKey(key: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderObjectNode(node: ObjectNode): string {
	const entries = node.entries.map(([key, value]) => `${renderKey(key)}: ${value}`);
	const children = node.children.map(
		([key, child]) => `${renderKey(key)}: ${renderObjectNode(child)}`,
	);
	return `{ ${[...entries, ...children].join(", ")} }`;
}

function addDeclaration(
	node: ObjectNode,
	declaration: StyleDeclaration,
	conditions: readonly string[],
): void {
	if (conditions.length === 0) {
		node.entries.push([declaration.property, renderValue(declaration.value)]);
		return;
	}
	const key = conditions[0]!;
	let child = node.children.find(([candidate]) => candidate === key)?.[1];
	if (child === undefined) {
		child = objectNode();
		node.children.push([key, child]);
	}
	addDeclaration(child, declaration, conditions.slice(1));
}

function declarationsObject(declarations: readonly StyleDeclaration[]): string {
	const root = objectNode();
	for (const declaration of declarations) {
		addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
	}
	return renderObjectNode(root);
}

function ruleObject(rule: StyleProgram["rules"][number]): string {
	if (rule.kind === "style" || rule.kind === "font-face" || rule.kind === "property") {
		return declarationsObject(rule.declarations);
	}
	if (rule.kind === "global") {
		return `{ ${JSON.stringify(rule.selector ?? "*")}: ${declarationsObject(rule.declarations)} }`;
	}
	if (rule.kind === "keyframes") {
		return `{ ${rule.children
			.map(
				(child) =>
					`${JSON.stringify(child.selector ?? "from")}: ${declarationsObject(child.declarations)}`,
			)
			.join(", ")} }`;
	}
	const body = declarationsObject(rule.declarations);
	const prefix =
		rule.kind === "layer"
			? `@layer ${rule.layer ?? rule.name ?? ""}`
			: `@supports ${rule.name ?? ""}`;
	return `{ ${JSON.stringify(prefix)}: ${body} }`;
}

function programObject(program: StyleProgram): string {
	if (program.rules.length === 1) return ruleObject(program.rules[0]!);
	if (program.rules.every((rule) => rule.kind === "global")) {
		const root = objectNode();
		for (const rule of program.rules) {
			root.entries.push([rule.selector ?? "*", declarationsObject(rule.declarations)]);
		}
		return renderObjectNode(root);
	}
	const root = objectNode();
	for (const rule of program.rules) {
		if (rule.kind === "style") {
			for (const declaration of rule.declarations) {
				addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
			}
		} else {
			root.entries.push([rule.selector ?? rule.name ?? rule.kind, ruleObject(rule)]);
		}
	}
	return renderObjectNode(root);
}

function firstKind(program: StyleProgram): StyleProgram["rules"][number]["kind"] {
	return program.rules[0]?.kind ?? "style";
}

function parseKeyframeProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	name: string,
	sourceObjectOptions: AdapterSourceObjectOptions = {},
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		...sourceObjectOptions,
		nestedObjectKind: "selector",
		source: adapterSource(context, start),
		conditionKinds: { from: "selector", to: "selector" },
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "from";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: [] });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[
			{
				kind: "keyframes",
				name,
				conditions: [],
				declarations: [],
				children: [...groups].map(([selector, declarations], order) => ({
					kind: "style" as const,
					selector,
					conditions: [],
					declarations,
					children: [],
					order,
				})),
				order: 0,
			},
		],
		{
			source: adapterSource(context, start),
			residuals: base.residuals,
		},
	);
}

function parseGlobalProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		source: adapterSource(context, start),
		nestedObjectKind: "selector",
		sourceOffset: start + 1,
	});
	const groups = new Map<string, StyleDeclaration[]>();
	for (const declaration of base.declarations) {
		const selector = declaration.conditions[0]?.name ?? "*";
		const list = groups.get(selector) ?? [];
		list.push({ ...declaration, conditions: declaration.conditions.slice(1) });
		groups.set(selector, list);
	}
	return styleProgramFromRules(
		[...groups].map(([selector, declarations], order) => ({
			kind: "global" as const,
			selector,
			conditions: [],
			declarations,
			children: [],
			order,
		})),
		{
			source: adapterSource(context, start),
			residuals: base.residuals,
		},
	);
}

function camelProperty(property: string): string {
	return property
		.trim()
		.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function templateDynamicExpression(rawValue: string): string {
	const interpolation = /^\$\{([\s\S]+)\}$/.exec(rawValue.trim());
	if (interpolation?.[1] !== undefined) return interpolation[1].trim();
	return `\`${rawValue.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``;
}

function parseTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	const parseBlock = (
		input: string,
	): {
		declarations: StyleDeclaration[];
		children: StyleProgram["rules"][number][];
		residuals: StyleProgramResidual[];
	} => {
		const declarations: StyleDeclaration[] = [];
		const children: StyleProgram["rules"][number][] = [];
		const residuals: StyleProgramResidual[] = [];
		let cursor = 0;
		let order = 0;
		const addTemplateDeclaration = (statement: string): void => {
			const trimmed = statement.replace(/\/\*.*?\*\//gs, "").trim();
			if (trimmed === "") return;
			const colon = trimmed.indexOf(":");
			if (colon <= 0) {
				residuals.push({
					kind: "parse",
					text: statement,
					hint: "nested template CSS requires a rule parser",
				});
				return;
			}
			const rawValue = trimmed.slice(colon + 1).trim();
			const interpolation = /\$\{([\s\S]+)\}/.exec(rawValue);
			let value: StyleDeclaration["value"];
			if (interpolation?.[1] !== undefined) {
				const expression = templateDynamicExpression(rawValue);
				value = { kind: "dynamic", expression, lowering: "residual" };
				residuals.push({
					kind: "dynamic",
					text: rawValue,
					hint: interpolation[1]?.includes("=>")
						? "function interpolation requires a framework prop wrapper"
						: "template interpolation requires a runtime-aware lowering",
				});
			} else {
				value = { kind: "literal", value: rawValue };
			}
			declarations.push({
				conditions: [],
				property: camelProperty(trimmed.slice(0, colon)),
				value,
			});
		};
		while (cursor < input.length) {
			while (/\s/.test(input[cursor] ?? "")) cursor++;
			if (cursor >= input.length) break;
			let index = cursor;
			let parens = 0;
			let quote: string | undefined;
			let delimiter: ";" | "{" | undefined;
			for (; index < input.length; index++) {
				const character = input[index]!;
				if (quote !== undefined) {
					if (character === quote && input[index - 1] !== "\\\\") quote = undefined;
					continue;
				}
				if (character === "'" || character === '"') {
					quote = character;
					continue;
				}
				if (character === "(") parens++;
				if (character === ")") parens--;
				if (character === "$" && input[index + 1] === "{") {
					const interpolation = matchBlock(input, index + 1);
					if (interpolation !== null) {
						index = interpolation.end - 1;
						continue;
					}
				}
				if (parens === 0 && (character === ";" || character === "{")) {
					delimiter = character;
					break;
				}
			}
			if (delimiter === "{") {
				const selector = input.slice(cursor, index).trim();
				const block = matchBlock(input, index);
				if (block === null || selector === "") {
					residuals.push({
						kind: "parse",
						text: input.slice(cursor),
						hint: "unbalanced template CSS",
					});
					break;
				}
				const nested = parseBlock(block.body);
				children.push({
					kind: "style",
					selector,
					conditions: [],
					declarations: nested.declarations,
					children: nested.children,
					order: order++,
				});
				residuals.push(...nested.residuals);
				cursor = block.end;
				continue;
			}
			if (delimiter === ";") {
				addTemplateDeclaration(input.slice(cursor, index));
				cursor = index + 1;
				continue;
			}
			addTemplateDeclaration(input.slice(cursor));
			break;
		}
		return { declarations, children, residuals };
	};
	const parsed = parseBlock(body);
	return styleProgramFromRules(
		[
			{
				kind: "style",
				conditions: [],
				declarations: parsed.declarations,
				children: parsed.children,
				order: 0,
			},
		],
		{ source: adapterSource(context, start), residuals: parsed.residuals },
	);
}

function kebabProperty(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Emit the static subset as authored CSS for template-based adapters. */
const templateValue = (value: StyleProgram["declarations"][number]["value"]): string => {
	if (value.kind === "dynamic") return value.expression;
	if (value.kind === "token") return value.authored;
	return String(value.value);
};

function templateCss(program: StyleProgram): string {
	const renderRule = (rule: StyleProgram["rules"][number]): string => {
		const declarations = rule.declarations
			.filter((declaration) => declaration.conditions.length === 0)
			.map(
				(declaration) =>
					`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)};`,
			)
			.join(" ");
		const nested = rule.children.map(renderRule).join(" ");
		if (rule.kind !== "style") return `${declarations}${nested}`;
		const base = declarations === "" ? nested : `${declarations}${nested}`;
		return base;
	};
	return program.rules.map(renderRule).join(" ");
}

function parseCalls(
	source: string,
	context: AdapterParseContext,
	patterns: readonly CallPattern[],
	sourceObjectOptions: AdapterSourceObjectOptionsProvider | undefined = {},
): AdapterParseResult {
	const matches: AdapterMatch[] = [];
	const residuals: StyleProgramResidual[] = [];
	const resolvedObjectOptions =
		typeof sourceObjectOptions === "function"
			? sourceObjectOptions(context.source)
			: sourceObjectOptions;
	let mask: ReturnType<typeof computeExcludedRanges> | undefined;
	try {
		mask = computeExcludedRanges(source, context.file);
	} catch {
		// Source parsers are allowed to operate on snippets that are not complete
		// modules; the adapter remains conservative through its balanced matcher.
	}
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern.regex)) {
			const start = match.index ?? 0;
			if (mask?.isExcluded(start)) continue;
			if (pattern.form === "reference") {
				const reference = match[1];
				if (reference === undefined) continue;
				const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const binding = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*\\{`, "g").exec(
					source,
				);
				if (binding === null) {
					residuals.push({
						kind: "parse",
						text: match[0],
						hint: `JSS style binding '${reference}' was not found`,
					});
					continue;
				}
				const open = binding.index + binding[0].lastIndexOf("{");
				const block = matchBlock(source, open);
				if (block === null) {
					residuals.push({
						kind: "parse",
						text: match[0],
						hint: `JSS style binding '${reference}' is unbalanced`,
					});
					continue;
				}
				const program = styleProgramFromSourceObject(block.body, {
					source: {
						file: context.file,
						start,
						end: start + match[0].length,
						adapter: context.config.adapter,
					},
					sourceOffset: open + 1,
					nestedObjectKind: "named",
				});
				matches.push({
					start,
					end: start + match[0].length,
					program,
					sourceText: match[0],
				});
				continue;
			}
			if (pattern.form === "template") {
				const firstTick = source.indexOf("`", start);
				const lastTick = findTemplateLiteralEnd(source, firstTick);
				if (firstTick === -1 || lastTick === undefined || lastTick <= firstTick) continue;
				if (source.slice(start, firstTick).includes("=>")) {
					residuals.push({
						kind: "capability",
						text: source.slice(start, lastTick + 1),
						hint: `${pattern.name} function-valued styles require a host-specific lowering`,
					});
					continue;
				}
				const template = source.slice(start, lastTick + 1);
				let program = parseTemplateProgram(source.slice(firstTick + 1, lastTick), context, start);
				if (pattern.kind === "styled")
					program = { ...program, source: { ...program.source, ...styledSubject(source, start) } };
				matches.push({ start, end: start + template.length, program, sourceText: template });
				continue;
			}
			const open = source.indexOf("{", start);
			if (open === -1) continue;
			const block = matchBlock(source, open);
			if (block === null) {
				residuals.push({
					kind: "parse",
					text: source.slice(start),
					hint: "unbalanced style object",
				});
				continue;
			}
			const end = source[block.end] === ")" ? block.end + 1 : block.end;
			const fallbackName = `${pattern.name}Style${matches.length + 1}`;
			let program: StyleProgram;
			if (pattern.kind === "keyframes") {
				program = parseKeyframeProgram(
					block.body,
					context,
					start,
					sourceName(source, start, fallbackName),
					resolvedObjectOptions,
				);
			} else if (pattern.kind === "global") {
				program = parseGlobalProgram(block.body, context, start);
			} else {
				const base = styleProgramFromSourceObject(block.body, {
					source: {
						file: context.file,
						start,
						end,
						adapter: context.config.adapter,
						...(context.document?.framework ? { framework: context.document.framework } : {}),
						...(pattern.name === "styled" ? styledSubject(source, start) : {}),
						...context.semantic?.source,
					},
					sourceOffset: open + 1,
					...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
					...(context.semantic?.compositions
						? { compositions: context.semantic.compositions }
						: {}),
					...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
					...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
					...resolvedObjectOptions,
					...(pattern.objectKind === undefined ? {} : { nestedObjectKind: pattern.objectKind }),
				});
				if (pattern.kind === "font-face") {
					program = styleProgramFromRules(
						[
							{
								kind: "font-face",
								conditions: [],
								declarations: base.declarations,
								children: [],
								order: 0,
							},
						],
						{ source: base.source, residuals: base.residuals },
					);
				} else {
					program = base;
				}
			}
			matches.push({ start, end, program, sourceText: source.slice(start, end) });
		}
	}
	matches.sort((a, b) => a.start - b.start);
	return { matches, residuals };
}

function validatePrograms(
	source: StyleProgram,
	target: StyleProgram,
	residuals: readonly StyleProgramResidual[] = [],
): AdapterValidationResult {
	const canonicalSource = styleProgramToCanonicalCss(source);
	const canonicalTarget = styleProgramToCanonicalCss(target);
	const differences: string[] = [];
	if (canonicalSource !== canonicalTarget) differences.push("canonical CSS differs");
	if (residuals.length > 0) differences.push(`${residuals.length} residual conversion(s)`);
	const lossiness: AdapterLossiness =
		canonicalSource !== canonicalTarget
			? "unsupported"
			: residuals.length > 0
				? "lossy"
				: "lossless";
	return {
		valid: differences.length === 0,
		lossiness,
		canonicalSource,
		canonicalTarget,
		differences,
		residuals,
	};
}

export function defineCodemodAdapter(spec: CodemodAdapterSpec): StyleAdapter {
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: spec.id,
		version: "2",
		sourceModules: spec.sourceModules,
		capabilities: spec.capabilities,
		dependencies: spec.packages,
		migration: spec.migration,
		detect: (context) => detectBy(spec.detectPatterns, context),
		loadConfig: (context) => configFor(spec.id, spec.configFiles ?? [], context),
		parse: (source, context) =>
			parseCalls(source, context, spec.patterns, spec.sourceObjectOptions),
		emit: (program, context) => {
			const renderers: AdapterRenderers = {
				firstKind,
				programObject,
				declarationsObject,
				templateCss,
			};
			const rendered = spec.emit(program, renderers, context);
			return { ...rendered, dependencies: spec.packages, residuals: [...program.residuals] };
		},
		validate: validatePrograms,
	};
}

function removeExcludedMatches(source: string, pattern: RegExp): string {
	let mask: ReturnType<typeof computeExcludedRanges> | undefined;
	try {
		mask = computeExcludedRanges(source, "pandwind-adapter.ts");
	} catch {
		// Keep cleanup best-effort for incomplete source snippets.
	}
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (mask?.isExcluded(start)) continue;
		edits.push({ start, end: start + match[0].length, text: "" });
	}
	return applyEdits(source, edits);
}

export function removeSourceImports(code: string, modules: readonly string[]): string {
	let result = code;
	for (const module of modules) {
		const quoted = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		result = removeExcludedMatches(
			result,
			new RegExp(`\\bimport\\s+(?:[^;]*?\\s+from\\s+)?["']${quoted}["']\\s*;?`, "g"),
		);
	}
	return result;
}

export function consolidateImports(statements: Iterable<string>): string[] {
	const grouped = new Map<string, { defaultImport?: string; named: Set<string> }>();
	const other: string[] = [];
	for (const statement of statements) {
		const match = /^import\s+(.+?)\s+from\s+["']([^"']+)["'];?$/.exec(statement.trim());
		if (match?.[1] === undefined || match[2] === undefined) {
			other.push(statement);
			continue;
		}
		const group = grouped.get(match[2]) ?? { named: new Set<string>() };
		const specifier = match[1].trim();
		if (specifier.startsWith("{")) {
			for (const name of specifier.slice(1, -1).split(",")) {
				const trimmed = name.trim();
				if (trimmed) group.named.add(trimmed);
			}
		} else {
			const [defaultPart, namedPart] = specifier.split(/\s*,\s*\{/);
			if (defaultPart !== undefined && defaultPart !== "") group.defaultImport = defaultPart.trim();
			if (namedPart !== undefined) {
				for (const name of namedPart.replace(/}\s*$/, "").split(",")) {
					const trimmed = name.trim();
					if (trimmed) group.named.add(trimmed);
				}
			}
		}
		grouped.set(match[2], group);
	}
	return [
		...[...grouped].map(([module, group]) => {
			const named = group.named.size > 0 ? `{ ${[...group.named].toSorted().join(", ")} }` : "";
			const specifier = [group.defaultImport, named].filter(Boolean).join(", ");
			return `import ${specifier} from "${module}";`;
		}),
		...other,
	];
}

export function validationSource(text: string, program: StyleProgram): string {
	const rule = program.rules[0];
	return rule?.kind === "keyframes" && rule.name !== undefined
		? `const ${rule.name} = ${text}`
		: text;
}

export type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
