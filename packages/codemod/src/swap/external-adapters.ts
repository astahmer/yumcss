import { join } from "node:path";
import { readFileSync } from "node:fs";
import { applyEdits } from "../migrate.ts";
import { matchBlock } from "../source-pass-utils.ts";
import { computeExcludedRanges } from "pandwind/source";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	ADAPTER_CONTRACT_VERSION,
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
import { findTemplateLiteralEnd, parseAdapterTemplate } from "./adapter-template-parser.ts";
import { JsxStyleHost, type JsxStyleHostMatch } from "./jsx-style-host.ts";

/** Adapter ids are registry-defined so adding an adapter does not require a central union edit. */
export type ExternalAdapterId = string;

type CallPattern = {
	readonly name: string;
	readonly regex: RegExp;
	readonly form?: "object" | "template" | "reference" | "jsx-style";
	readonly kind?: "style" | "styled" | "keyframes" | "global" | "font-face";
	readonly objectKind?: StyleProgramOptions["nestedObjectKind"];
	readonly styleProps?: readonly string[];
	/** Source-specific host props that must remain for component semantics. */
	readonly preserveHostStyleProps?: (host: JsxStyleHostMatch) => readonly string[];
	readonly transform?: (program: StyleProgram, context: AdapterParseContext) => StyleProgram;
};

export type AdapterSourceObjectOptions = Pick<
	StyleProgramOptions,
	| "conditionKinds"
	| "conditionValues"
	| "conditionRaw"
	| "nestedObjectKind"
	| "propertyValueConditions"
	| "unwrapNestedObjectKeys"
	| "variantContainerKeys"
	| "computedKeys"
	| "computedKeyResolver"
	| "dynamicReferences"
	| "objectReferences"
	| "propertyAliases"
	| "valueTransforms"
	| "emissionHints"
	| "canonicalization"
	| "compositions"
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

// oxlint-disable-next-line typescript/no-extraneous-class -- scoped adapter construction policy
export class CodemodAdapterKit {
	static dependency(
		name: string,
		kind: AdapterDependencies["packages"][number]["kind"],
	): AdapterDependencies {
		return { packages: [{ name, kind }] };
	}

	static allRuleCapabilities(
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
	const firstTick = findStyledTemplateStart(source, start);
	const end = firstTick === -1 ? findStyledObjectOpen(source, start) : firstTick;
	if (end === -1) return {};
	const prefix = source.slice(start, end).trim();
	const match = prefix.match(/^styled\s*(?:\.|\()/);
	if (match === null) return {};
	const attrs = subjectAttrs(prefix);
	return {
		subject: prefix,
		subjectKind: prefix.slice("styled".length).trim().startsWith(".") ? "member" : "call",
		...(attrs === undefined ? {} : { subjectAttrs: attrs }),
	};
}

function findStyledObjectOpen(source: string, start: number): number {
	const statementEnd = source.indexOf(";", start);
	const segment = source.slice(start, statementEnd === -1 ? source.length : statementEnd);
	let result = -1;
	for (const match of segment.matchAll(/\(\s*\{/g)) result = start + (match.index ?? 0);
	return result;
}

function findStyledTemplateStart(source: string, start: number): number {
	let depth = 0;
	let quote: string | undefined;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "`") {
			if (depth === 0) return index;
			quote = character;
			continue;
		}
		if (character === "(" || character === "{" || character === "[") depth++;
		if (character === ")" || character === "}" || character === "]") depth = Math.max(0, depth - 1);
	}
	return -1;
}

function subjectAttrs(subject: string): string | undefined {
	const markerStart = subject.indexOf(".attrs");
	if (markerStart === -1) return undefined;
	const open = subject.indexOf("(", markerStart + ".attrs".length);
	if (open === -1) return undefined;
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < subject.length; index++) {
		const character = subject[index]!;
		if (quote !== undefined) {
			if (character === quote && subject[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth++;
		if (character === ")") {
			depth--;
			if (depth === 0) return subject.slice(open + 1, index).trim();
		}
	}
	return undefined;
}

function conditionKey(condition: StyleProgram["rules"][number]["conditions"][number]): string {
	if (condition.raw !== undefined) {
		if (condition.raw.startsWith("_")) return `&:${condition.raw.slice(1)}`;
		return condition.raw;
	}
	if (condition.kind === "pseudo")
		return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
	if (condition.kind === "media")
		return condition.value === undefined ? condition.name : `@media ${condition.value}`;
	if (condition.kind === "container")
		return condition.value === undefined ? condition.name : `@container ${condition.value}`;
	if (condition.kind === "supports")
		return condition.value === undefined ? condition.name : `@supports ${condition.value}`;
	if (condition.kind === "selector") {
		if (condition.name.endsWith(" &")) return `&${condition.name.slice(0, -2)}`;
		if (!condition.name.includes("&"))
			return condition.name.startsWith(":") || condition.name.startsWith("[")
				? `&${condition.name}`
				: condition.name;
	}
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

function styleRuleNode(rule: StyleProgram["rules"][number]): ObjectNode {
	const root = objectNode();
	for (const declaration of rule.declarations)
		addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
	for (const child of rule.children) {
		const key = child.selector ?? child.name ?? child.kind;
		root.children.push([key, styleRuleNode(child)]);
	}
	return root;
}

function ruleObject(rule: StyleProgram["rules"][number]): string {
	if (rule.kind === "style" || rule.kind === "font-face" || rule.kind === "property") {
		return renderObjectNode(styleRuleNode(rule));
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

function parseTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
): StyleProgram {
	return parseAdapterTemplate(body, context, context.config.adapter, start);
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
			if (pattern.form === "jsx-style") {
				const initialTag = JsxStyleHost.parse(
					source,
					start,
					context,
					pattern.styleProps ?? [],
					adapterSource(context, start),
				);
				if (initialTag !== undefined) {
					const preserved = new Set(pattern.preserveHostStyleProps?.(initialTag) ?? []);
					const tag =
						preserved.size === 0
							? initialTag
							: JsxStyleHost.parse(
									source,
									start,
									context,
									(pattern.styleProps ?? []).filter((property) => !preserved.has(property)),
									adapterSource(context, start),
								);
					if (tag === undefined) continue;
					const program = styleProgramFromSourceObject(tag.body, {
						...resolvedObjectOptions,
						source: tag.source,
						sourceOffset: start,
					});
					matches.push({
						start,
						end: tag.end,
						program,
						sourceText: tag.openingTag,
					});
				}
				continue;
			}
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
				const firstTick =
					pattern.kind === "styled"
						? findStyledTemplateStart(source, start)
						: source.indexOf("`", start);
				const lastTick = findTemplateLiteralEnd(source, firstTick);
				if (firstTick === -1 || lastTick === undefined || lastTick <= firstTick) continue;
				const template = source.slice(start, lastTick + 1);
				let program = parseTemplateProgram(source.slice(firstTick + 1, lastTick), context, start);
				program = {
					...program,
					source: {
						...program.source,
						...(pattern.kind === "styled" ? styledSubject(source, start) : {}),
						...(context.document?.framework ? { framework: context.document.framework } : {}),
						...context.semantic?.source,
					},
				};
				program = pattern.transform?.(program, context) ?? program;
				program = {
					...program,
					source: { ...program.source, pattern: pattern.name },
				};
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
			program = pattern.transform?.(program, context) ?? program;
			program = {
				...program,
				source: { ...program.source, pattern: pattern.name },
			};
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
		version: ADAPTER_CONTRACT_VERSION,
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

export function removeSourceImports(
	code: string,
	modules: readonly string[],
	file = "pandwind-adapter.ts",
): string {
	let result = code;
	for (const module of modules) {
		const quoted = module.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pattern = new RegExp(`\\bimport\\s+([^;]*?)\\s+from\\s+(["'])${quoted}\\2\\s*;?`, "g");
		let mask: ReturnType<typeof computeExcludedRanges> | undefined;
		try {
			mask = computeExcludedRanges(result, file);
		} catch {
			// Keep cleanup best-effort for incomplete source snippets.
		}
		const edits: Array<{ start: number; end: number; text: string }> = [];
		for (const match of result.matchAll(pattern)) {
			const start = match.index ?? 0;
			if (mask?.isExcluded(start)) continue;
			const specifier = match[1]?.trim();
			if (specifier === undefined || specifier === "") continue;
			const remainder = result.slice(0, start) + result.slice(start + match[0].length);
			const declaredNames = new Set(
				[...remainder.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].flatMap(
					(entry) => (entry[1] === undefined ? [] : [entry[1]]),
				),
			);
			for (const imported of remainder.matchAll(/\bimport\s+([^;]*?)\s+from\s+["'][^"']+["']/g)) {
				const importedSpecifier = imported[1]?.trim() ?? "";
				const defaultName = /^[A-Za-z_$][\w$]*/.exec(importedSpecifier)?.[0];
				if (defaultName !== undefined) declaredNames.add(defaultName);
				const namespaceName = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(importedSpecifier)?.[1];
				if (namespaceName !== undefined) declaredNames.add(namespaceName);
				const importedBlock = /\{([\s\S]*)\}/.exec(importedSpecifier)?.[1];
				for (const entry of importedBlock?.split(",") ?? []) {
					const parts = entry.trim().split(/\s+as\s+/);
					if (parts[0] !== undefined && parts[0] !== "") declaredNames.add(parts[1] ?? parts[0]);
				}
			}
			let remainderMask: ReturnType<typeof computeExcludedRanges> | undefined;
			try {
				remainderMask = computeExcludedRanges(remainder, file);
			} catch {
				// Keep import cleanup best-effort for incomplete source snippets.
			}
			const isReferenced = (name: string): boolean => {
				if (declaredNames.has(name)) return false;
				const references = new RegExp(
					`(?<![-\\w$])${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?![-\\w$])`,
					"g",
				);
				for (const reference of remainder.matchAll(references)) {
					if (remainderMask?.isExcluded(reference.index ?? 0) !== true) return true;
				}
				return false;
			};
			const defaultImport =
				/^[A-Za-z_$][\w$]*/.exec(specifier)?.[0] ??
				(specifier.startsWith("{") || specifier.startsWith("*") ? undefined : undefined);
			const namespace = /^\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(specifier)?.[1];
			const namedBlock = /\{([\s\S]*)\}/.exec(specifier)?.[1];
			const named =
				namedBlock === undefined
					? []
					: namedBlock.split(",").flatMap((entry) => {
							const trimmed = entry.trim();
							if (trimmed === "") return [];
							const parts = trimmed.split(/\s+as\s+/);
							const imported = parts[0]!;
							const local = parts[1] ?? imported;
							return isReferenced(local) ? [trimmed] : [];
						});
			const keptDefault =
				defaultImport !== undefined && isReferenced(defaultImport) ? defaultImport : undefined;
			const keptNamespace =
				namespace !== undefined && isReferenced(namespace) ? `* as ${namespace}` : undefined;
			const kept = [
				keptDefault,
				keptNamespace,
				named.length > 0 ? `{ ${named.join(", ")} }` : undefined,
			].filter((value): value is string => value !== undefined);
			edits.push({
				start,
				end: start + match[0].length,
				text: kept.length === 0 ? "" : `import ${kept.join(", ")} from "${module}";`,
			});
		}
		result = applyEdits(result, edits);
		result = removeExcludedMatches(result, new RegExp(`\\bimport\\s*["']${quoted}["']\\s*;?`, "g"));
	}
	return result;
}

export type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
