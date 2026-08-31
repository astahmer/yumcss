import { applyEdits } from "../migrate.ts";
import { matchBlock } from "../sources.ts";
import { joinDocumentPath } from "../path-utils.ts";
import { computeExcludedRanges } from "pandwind/source";
import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "./capabilities.ts";
import {
	ADAPTER_CONTRACT_SCHEMA,
	type AdapterConfigContext,
	type AdapterDependencies,
	type AdapterDetectionContext,
	type AdapterDetectionResult,
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
	inferSemanticConditionKind,
	type StyleDeclaration,
	type StyleProgram,
	type StyleProgramOptions,
	type StyleProgramResidual,
	type StyleProgramSource,
} from "./semantic-ir.ts";
import { findTemplateLiteralEnd } from "./adapter-template-parser.ts";
import { JsxStyleHost, type JsxStyleHostMatch } from "./jsx-style-host.ts";
import type { StyleLowering } from "./lowering.ts";
import { StyleNamedRuleStrategy } from "./identifiers.ts";

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
	| "namedRuleObjects"
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
	| "compositionArrayKeys"
>;
export type AdapterSourceObjectOptionsProvider =
	| AdapterSourceObjectOptions
	| ((source: string, context: AdapterParseContext) => AdapterSourceObjectOptions);

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
	readonly lowerings?: readonly StyleLowering[];
	readonly configFiles?: readonly string[];
	readonly detect?: (
		context: AdapterDetectionContext,
		fallback: () => AdapterDetectionResult,
	) => AdapterDetectionResult;
	readonly loadConfig?: (context: AdapterConfigContext) => AdapterProjectConfig;
	readonly loadConfigAsync?: (context: AdapterConfigContext) => Promise<AdapterProjectConfig>;
	readonly parse?: (source: string, context: AdapterParseContext) => AdapterParseResult;
	readonly postprocessEmit?: (
		emission: Pick<AdapterEmitResult, "text" | "imports" | "semantic">,
		context: AdapterEmitContext,
	) => Pick<AdapterEmitResult, "text" | "imports" | "semantic">;
	readonly sourceObjectOptions?: AdapterSourceObjectOptionsProvider;
	readonly migration?: AdapterMigrationHooks;
	/** Target-owned policy for preserving named style maps without source branches. */
	readonly namedRuleStrategy?: StyleNamedRuleStrategy;
	emit(
		program: StyleProgram,
		renderers: AdapterRenderers,
		context?: AdapterEmitContext,
	): Pick<AdapterEmitResult, "text" | "imports" | "semantic">;
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
			"function-values": "unsupported",
			"pseudo-conditions": "exact",
			"selector-conditions": "exact",
			"media-conditions": "exact",
			"container-conditions": "exact",
			"supports-conditions": "exact",
			...capabilities,
		},
	};
}

/** Cohesive construction utilities used by concrete adapter modules. */
export class CodemodAdapterKit {
	static dependency = dependency;
	static allRuleCapabilities = allRuleCapabilities;
}

function configFor(
	id: string,
	configFiles: readonly string[],
	context: AdapterConfigContext,
): AdapterProjectConfig {
	const files: string[] = [];
	const values: Record<string, unknown> = {};
	const readFile = context.readFile;
	const packageText =
		context.packageJson === undefined && context.root !== undefined && readFile !== undefined
			? readFile(joinDocumentPath(context.root, "package.json"))
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
		const file = joinDocumentPath(context.root, relative);
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
		if (rule.kind === "style" && rule.name === undefined) {
			for (const declaration of rule.declarations) {
				addDeclaration(root, declaration, declaration.conditions.map(conditionKey));
			}
		} else if (rule.kind === "style" && rule.name !== undefined) {
			root.entries.push([rule.name, ruleObject(rule)]);
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
	selector?: string,
): StyleProgram {
	const base = styleProgramFromSourceObject(body, {
		source: adapterSource(context, start),
		nestedObjectKind: "selector",
		sourceOffset: start + 1,
	});
	if (selector !== undefined)
		return styleProgramFromRules(
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
			{ source: adapterSource(context, start), residuals: base.residuals },
		);
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
	const normalized = rawValue.trim();
	if (normalized.startsWith("${")) {
		const interpolation = matchBlock(normalized, 1);
		if (interpolation?.end === normalized.length) return interpolation.body.trim();
	}
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
			const hasInterpolation = rawValue.includes("${");
			let value: StyleDeclaration["value"];
			if (hasInterpolation) {
				const expression = templateDynamicExpression(rawValue);
				value = { kind: "dynamic", expression, lowering: "residual" };
				residuals.push({
					kind: "dynamic",
					text: rawValue,
					hint: rawValue.includes("=>")
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
				if (selector.includes("${"))
					residuals.push({
						kind: "dynamic",
						text: selector,
						hint: "component selector interpolation requires a host rewrite",
					});
				const nested = parseBlock(block.body);
				const conditionKind = inferSemanticConditionKind(selector);
				const conditionValue = selector.replace(/^@(media|container|supports)\s+/, "");
				const atRuleCondition =
					conditionKind === "media" || conditionKind === "container" || conditionKind === "supports"
						? { kind: conditionKind, name: selector, value: conditionValue }
						: undefined;
				children.push({
					kind: "style",
					...(atRuleCondition === undefined
						? {
								selector: selector.startsWith("&")
									? selector
									: selector.startsWith(":") || selector.startsWith("[")
										? `&${selector}`
										: `& ${selector}`,
							}
						: { conditions: [atRuleCondition] }),
					conditions: atRuleCondition === undefined ? [] : [atRuleCondition],
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

function parseKeyframeTemplateProgram(
	body: string,
	context: AdapterParseContext,
	start: number,
	name: string,
): StyleProgram {
	const base = parseTemplateProgram(body, context, start);
	const root = base.rules[0];
	return styleProgramFromRules(
		[
			{
				kind: "keyframes",
				name,
				conditions: [],
				declarations: [],
				children: (root?.children ?? []).map((child) => ({
					...child,
					selector: child.selector?.replace(/^&\s+/u, ""),
				})),
				order: 0,
			},
		],
		{ source: base.source, residuals: base.residuals },
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
	const conditionSelector = (
		condition: StyleProgram["rules"][number]["conditions"][number],
	): string => {
		if (
			condition.kind === "media" ||
			condition.kind === "container" ||
			condition.kind === "supports"
		)
			return (condition.value ?? condition.name).startsWith(`@${condition.kind}`)
				? (condition.value ?? condition.name)
				: `@${condition.kind} ${condition.value ?? condition.name}`;
		if (condition.kind === "pseudo")
			return condition.name.startsWith(":") ? `&${condition.name}` : `&:${condition.name}`;
		const value = condition.value ?? condition.raw ?? condition.name;
		return value.includes("&") ? value : `&${value}`;
	};
	const wrap = (
		body: string,
		conditions: readonly StyleProgram["rules"][number]["conditions"][number][],
	): string =>
		conditions.reduceRight(
			(current, condition) => `${conditionSelector(condition)} { ${current} }`,
			body,
		);
	const renderRule = (rule: StyleProgram["rules"][number]): string => {
		const grouped = new Map<
			string,
			{ conditions: StyleProgram["rules"][number]["conditions"]; declarations: StyleDeclaration[] }
		>();
		for (const declaration of rule.declarations) {
			const key = JSON.stringify(declaration.conditions);
			const group = grouped.get(key) ?? { conditions: declaration.conditions, declarations: [] };
			group.declarations.push(declaration);
			grouped.set(key, group);
		}
		const declarations =
			grouped
				.get("[]")
				?.declarations.map(
					(declaration) =>
						`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)};`,
				)
				.join(" ") ?? "";
		const conditioned = [...grouped.values()]
			.filter((group) => group.conditions.length > 0)
			.map((group) =>
				wrap(
					group.declarations
						.map(
							(declaration) =>
								`${kebabProperty(declaration.property)}: ${templateValue(declaration.value)};`,
						)
						.join(" "),
					group.conditions,
				),
			)
			.join(" ");
		const nested = rule.children.map(renderRule).join(" ");
		if (rule.kind !== "style") return `${declarations}${nested}`;
		const base = `${declarations}${conditioned}${nested}`;
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
			? sourceObjectOptions(context.source, context)
			: sourceObjectOptions;
	let mask: ReturnType<typeof computeExcludedRanges> | undefined;
	try {
		mask = computeExcludedRanges(source, context.file);
	} catch {
		// Source parsers are allowed to operate on snippets that are not complete
		// modules; the adapter remains conservative through its balanced matcher.
	}
	const hostRanges = patterns.flatMap((pattern) => {
		if (pattern.form !== "jsx-style") return [];
		return [...source.matchAll(pattern.regex)].flatMap((match) => {
			const start = match.index ?? 0;
			if (mask?.isExcluded(start)) return [];
			const tag = JsxStyleHost.parse(
				source,
				start,
				context,
				pattern.styleProps ?? [],
				adapterSource(context, start),
			);
			return tag === undefined ? [] : [{ start, end: tag.end }];
		});
	});
	const isInsideHostRange = (start: number): boolean =>
		hostRanges.some((range) => start >= range.start && start < range.end);
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
					const program =
						tag.template === undefined
							? styleProgramFromSourceObject(tag.body, {
									...resolvedObjectOptions,
									source: tag.source,
									sourceOffset: start,
								})
							: parseTemplateProgram(tag.template, context, start);
					const hostProgram = {
						...program,
						source: {
							...program.source,
							...tag.source,
							...(tag.template === undefined ? {} : { template: tag.template }),
						},
					};
					matches.push({
						start,
						end: tag.end,
						program: pattern.transform?.(hostProgram, context) ?? hostProgram,
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
				const firstTick = source.indexOf("`", start);
				const lastTick = findTemplateLiteralEnd(source, firstTick);
				if (firstTick === -1 || lastTick === undefined || lastTick <= firstTick) continue;
				// A JSX style host owns the complete tagged template. Do not parse the
				// nested `css\`...\`` again: doing so creates residuals for the same
				// source site and makes a valid host migration look incomplete.
				if (isInsideHostRange(start)) continue;
				if (source.slice(start, firstTick).includes("=>")) {
					residuals.push({
						kind: "capability",
						text: source.slice(start, lastTick + 1),
						hint: `${pattern.name} function-valued styles require a host-specific lowering`,
					});
					continue;
				}
				const templateBody = source.slice(firstTick + 1, lastTick);
				if (/\$\{[^`]*`/u.test(templateBody)) {
					residuals.push({
						kind: "dynamic",
						text: source.slice(start, lastTick + 1),
						hint: `${pattern.name} nested template interpolation requires a host-specific lowering`,
					});
					continue;
				}
				const template = source.slice(start, lastTick + 1);
				let program =
					pattern.kind === "keyframes"
						? parseKeyframeTemplateProgram(
								templateBody,
								context,
								start,
								sourceName(source, start, `${pattern.name}${matches.length + 1}`),
							)
						: parseTemplateProgram(templateBody, context, start);
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
				const selector = source.slice(start, open).match(/\(\s*(["'])([^"']+)\1\s*,\s*$/)?.[2];
				program = parseGlobalProgram(block.body, context, start, selector);
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
	const capabilities =
		spec.namedRuleStrategy === undefined ||
		spec.namedRuleStrategy === StyleNamedRuleStrategy.Unsupported
			? spec.capabilities
			: {
					...spec.capabilities,
					capabilities: {
						...spec.capabilities.capabilities,
						"named-rules": "exact" as const,
					},
				};
	return {
		schema: ADAPTER_CONTRACT_SCHEMA,
		id: spec.id,
		version: "2",
		sourceModules: spec.sourceModules,
		capabilities,
		dependencies: spec.packages,
		...(spec.lowerings === undefined ? {} : { lowerings: spec.lowerings }),
		migration: spec.migration,
		detect: (context) =>
			spec.detect?.(context, () => detectBy(spec.detectPatterns, context)) ??
			detectBy(spec.detectPatterns, context),
		loadConfig: (context) =>
			spec.loadConfig?.(context) ?? configFor(spec.id, spec.configFiles ?? [], context),
		...(spec.loadConfigAsync === undefined ? {} : { loadConfigAsync: spec.loadConfigAsync }),
		parse: (source, context) =>
			spec.parse?.(source, context) ??
			parseCalls(source, context, spec.patterns, spec.sourceObjectOptions),
		emit: (program, context) => {
			const renderers: AdapterRenderers = {
				firstKind,
				programObject,
				declarationsObject,
				templateCss,
			};
			const render = (value: StyleProgram) => spec.emit(value, renderers, context);
			const namedRules = program.rules.filter((rule) => rule.name !== undefined);
			const rendered =
				namedRules.length > 0 && spec.namedRuleStrategy === StyleNamedRuleStrategy.ClassMap
					? (() => {
							const imports = new Set<string>();
							const entries = namedRules.map((rule) => {
								const single = render({
									...program,
									rules: [{ ...rule, name: undefined }],
									declarations: rule.declarations,
								});
								for (const statement of single.imports ?? []) imports.add(statement);
								return `${JSON.stringify(rule.name)}: ${single.text}`;
							});
							return { text: `{ ${entries.join(", ")} }`, imports: [...imports] };
						})()
					: render(program);
			const processed = spec.postprocessEmit?.(rendered, context) ?? rendered;
			return { ...processed, dependencies: spec.packages, residuals: [...program.residuals] };
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
