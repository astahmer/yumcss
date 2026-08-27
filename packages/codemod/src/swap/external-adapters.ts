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
	type StyleProgramResidual,
	type StyleProgramSource,
} from "./semantic-ir.ts";
import { findTemplateLiteralEnd } from "./adapter-template-parser.ts";
import {
	asStyleDialect,
	createStyleSystem,
	createStyleSystemRegistry,
	type StyleSystemRegistry,
} from "./style-systems.ts";
import { createStyleAdapterRegistry, type StyleAdapterRegistry } from "./adapter-registry.ts";
import { EXTRA_ADAPTERS } from "./extra-adapters.ts";
import type {
	AdapterDefinition,
	AdapterRenderers,
	AdapterSourceObjectOptions,
	AdapterSourceObjectOptionsProvider,
} from "./adapters/definition.ts";
import { EMOTION_DEFINITION } from "./adapters/emotion-definition.ts";
import { STYLED_COMPONENTS_DEFINITION } from "./adapters/styled-components-definition.ts";
import { VANILLA_EXTRACT_DEFINITION } from "./adapters/vanilla-extract-definition.ts";
import { STITCHES_DEFINITION } from "./adapters/stitches-definition.ts";
import { LINARIA_DEFINITION } from "./adapters/linaria-definition.ts";
import { JSS_DEFINITION } from "./adapters/jss-definition.ts";
import { PANDWIND_DEFINITION } from "./adapters/pandwind-definition.ts";
import { STYLEX_DEFINITION } from "./adapters/stylex-definition.ts";

/** Adapter ids are registry-defined so adding an adapter does not require a central union edit. */
export type ExternalAdapterId = string;

export type CallPattern = {
	readonly name: string;
	readonly regex: RegExp;
	readonly form?: "object" | "template" | "reference";
};

export function dependency(
	name: string,
	kind: "runtime" | "development" | "peer" | "config",
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

const CONFIG_FILES: Readonly<Record<ExternalAdapterId, readonly string[]>> = {
	pandwind: ["pandwind.config.ts", "package.json"],
	emotion: [".emotionrc", "emotion.config.js", "package.json"],
	"styled-components": ["package.json"],
	"vanilla-extract": ["package.json"],
	stitches: ["stitches.config.ts", "package.json"],
	linaria: ["linaria.config.js", "package.json"],
	jss: ["jss.config.js", "package.json"],
};

function configFor(id: string, context: AdapterConfigContext): AdapterProjectConfig {
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
	for (const relative of CONFIG_FILES[id as ExternalAdapterId] ?? []) {
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

function linariaStyledSubject(source: string, start: number): Partial<StyleProgramSource> {
	const match = source.slice(start).match(/^styled\s*(\.\s*[A-Za-z_$][\w$]*|\(\s*[^)]+\s*\))\s*`/);
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

export function declarationsObject(declarations: readonly StyleDeclaration[]): string {
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

export function programObject(program: StyleProgram): string {
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

export function firstKind(program: StyleProgram): StyleProgram["rules"][number]["kind"] {
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
					kind: interpolation[1]?.includes("=>") ? "capability" : "dynamic",
					text: rawValue,
					hint: "template interpolation requires a runtime-aware lowering",
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

export function templateCss(program: StyleProgram): string {
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
				if (pattern.name.startsWith("styled"))
					program = { ...program, source: { ...program.source, ...styledSubject(source, start) } };
				if (pattern.name === "linaria-styled")
					program = {
						...program,
						source: { ...program.source, ...linariaStyledSubject(source, start) },
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
			if (pattern.name === "keyframes") {
				program = parseKeyframeProgram(
					block.body,
					context,
					start,
					sourceName(source, start, fallbackName),
					resolvedObjectOptions,
				);
			} else if (
				pattern.name === "global" ||
				pattern.name === "globalCss" ||
				pattern.name === "createGlobalStyle"
			) {
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
					...(pattern.name.startsWith("jss-") ? { nestedObjectKind: "named" as const } : {}),
					...(pattern.name === "css-group" ? { nestedObjectKind: "named" as const } : {}),
					...(pattern.name === "style"
						? {
								unwrapNestedObjectKeys: [
									...new Set([
										...(resolvedObjectOptions.unwrapNestedObjectKeys ?? []),
										"selectors",
									]),
								],
							}
						: {}),
				});
				if (pattern.name === "globalStyle") {
					const args = source.slice(start, open);
					const selector = /\(\s*(["'`])([^"'`]+)\1\s*,/.exec(args)?.[2] ?? "*";
					program = styleProgramFromRules(
						[
							{
								kind: "global",
								selector,
								conditions: [],
								declarations: base.declarations,
								children: [],
								order: 0,
							},
						],
						{ source: base.source, residuals: base.residuals },
					);
				} else if (pattern.name === "fontFace") {
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

export function adapter(
	id: ExternalAdapterId,
	patterns: readonly CallPattern[],
	packages: AdapterDependencies,
	capabilities: AdapterCapabilities,
	emitCall: (program: StyleProgram) => { text: string; imports?: readonly string[] },
	detectPatterns: readonly RegExp[],
	sourceModules: readonly string[],
	sourceObjectOptions: AdapterSourceObjectOptionsProvider | undefined = {},
): StyleAdapter {
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id,
		version: "2",
		sourceModules,
		capabilities,
		dependencies: packages,
		detect: (context) => detectBy(detectPatterns, context),
		loadConfig: (context) => configFor(id, context),
		parse: (source, context) => parseCalls(source, context, patterns, sourceObjectOptions),
		emit: (program, _context) => {
			const rendered = emitCall(program);
			return { ...rendered, dependencies: packages, residuals: [...program.residuals] };
		},
		validate: validatePrograms,
	};
}

/** Bind an independently owned concrete definition to the shared v2 parser,
 * validator, and configuration runtime. Definitions never import this module,
 * which keeps the registry cycle-free. */
function adapterFromDefinition(definition: AdapterDefinition): StyleAdapter {
	const renderers: AdapterRenderers = { firstKind, programObject, declarationsObject, templateCss };
	return adapter(
		definition.id,
		definition.patterns,
		definition.packages,
		definition.capabilities,
		(program) => definition.emit(program, renderers),
		definition.detectPatterns,
		definition.sourceModules,
		definition.sourceObjectOptions,
	);
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
	result = removeExcludedMatches(
		result,
		/\b(?:const|let|var)\s+css\s*=\s*(?:createCss|createRuntimeCss)\s*\([^;]*\);?/g,
	);
	return removeExcludedMatches(result, /\bconst\s*\{[^}]*\}\s*=\s*createStitches\s*\([^;]*\);?/g);
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

export const EXTERNAL_ADAPTERS: Readonly<Record<ExternalAdapterId, StyleAdapter>> = {
	pandwind: adapterFromDefinition(PANDWIND_DEFINITION),
	emotion: adapterFromDefinition(EMOTION_DEFINITION),
	"styled-components": adapterFromDefinition(STYLED_COMPONENTS_DEFINITION),
	"vanilla-extract": adapterFromDefinition(VANILLA_EXTRACT_DEFINITION),
	stitches: adapterFromDefinition(STITCHES_DEFINITION),
	linaria: adapterFromDefinition(LINARIA_DEFINITION),
	jss: adapterFromDefinition(JSS_DEFINITION),
	stylex: adapterFromDefinition(STYLEX_DEFINITION),
	...Object.fromEntries(EXTRA_ADAPTERS.map((extraAdapter) => [extraAdapter.id, extraAdapter])),
};

/** Built-ins are merely the default plugin set; consumers may derive a registry and discover more. */
export const EXTERNAL_ADAPTER_REGISTRY: StyleAdapterRegistry = createStyleAdapterRegistry(
	Object.values(EXTERNAL_ADAPTERS),
);

const externalDialect = (registeredAdapter: StyleAdapter) =>
	asStyleDialect(registeredAdapter, {
		system: registeredAdapter.id === "pandwind" ? "pandwind-external" : registeredAdapter.id,
		dialect: "css",
		role: "both",
	});

/** Registry is the extension point; the object remains a read-only lookup projection. */
export const EXTERNAL_STYLE_SYSTEMS: StyleSystemRegistry = createStyleSystemRegistry(
	Object.values(EXTERNAL_ADAPTERS).map((registeredAdapter) =>
		createStyleSystem(
			registeredAdapter.id === "pandwind" ? "pandwind-external" : registeredAdapter.id,
			[externalDialect(registeredAdapter)],
		),
	),
);

export const EXTERNAL_ADAPTER_IDS: readonly ExternalAdapterId[] = Object.keys(EXTERNAL_ADAPTERS);

export function getExternalAdapter(id: string): StyleAdapter | undefined {
	return EXTERNAL_STYLE_SYSTEMS.getDialect(id);
}

export { runAdapterMigration } from "./adapter-migration.ts";
export type { AdapterMigrationOptions, AdapterMigrationResult } from "./adapter-migration.ts";
