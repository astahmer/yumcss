/**
 * Versioned semantic style-program IR.
 *
 * `SwapIR` stays deliberately flat and cheap for the common literal swap
 * path. This richer representation is the interop boundary: adapters can
 * distinguish selector/media/container conditions, token identity, dynamic
 * values, and provenance without teaching every source parser about every
 * target library.
 */
import type { SwapIR, SwapResidual, SwapResidualKind } from "./ir.ts";
import { parseSync } from "oxc-parser";

export const STYLE_PROGRAM_SCHEMA = "pandwind.style-program/2" as const;

export type SemanticConditionKind =
	| "named"
	| "pseudo"
	| "selector"
	| "media"
	| "container"
	| "supports";

export type StyleConditionOperator = "and" | "or" | "not";

export type StyleRuleKind =
	| "style"
	| "global"
	| "keyframes"
	| "font-face"
	| "layer"
	| "supports"
	| "property";

export interface StyleCondition {
	readonly kind: SemanticConditionKind;
	readonly name: string;
	/** Canonical query/selector payload when the source supplied one. */
	readonly value?: string;
	/** Exact authored condition spelling when it differs from `name`. */
	readonly raw?: string;
	/** Logical composition marker for adapters that preserve condition trees. */
	readonly operator?: StyleConditionOperator;
}

export interface StyleTokenValue {
	readonly kind: "token";
	/** Stable source-facing token reference without the `$` sigil. */
	readonly ref: string;
	/** Exact authored spelling, retained for lossless emission. */
	readonly authored: string;
	readonly resolved?: string;
}

export interface StyleLiteralValue {
	readonly kind: "literal";
	readonly value: string | boolean | number;
}

export type StyleDynamicLowering = "runtime" | "custom-property" | "residual";

export interface StyleDynamicValue {
	readonly kind: "dynamic";
	/** Source expression or placeholder retained for a target adapter. */
	readonly expression: string;
	readonly fallback?: StyleLiteralValue;
	/** Exact source range for diagnostics and source-to-source adapters. */
	readonly source?: StyleProgramSource;
	/** Optional names extracted by a source adapter for dependency analysis. */
	readonly dependencies?: readonly string[];
	/** Adapter hint; `residual` is the safe default for legacy targets. */
	readonly lowering?: StyleDynamicLowering;
}

export type StyleValue = StyleTokenValue | StyleLiteralValue | StyleDynamicValue;

export interface StyleDeclaration {
	readonly conditions: readonly StyleCondition[];
	readonly property: string;
	readonly value: StyleValue;
}

/**
 * A rule-level node deliberately sits above the flat declaration list. Rules
 * retain authored CSS structure that cannot be represented by SwapIR: global
 * selectors, at-rules, keyframe steps, layers, and custom-property metadata.
 */
export interface StyleRule {
	readonly kind: StyleRuleKind;
	readonly name?: string;
	readonly selector?: string;
	readonly conditions: readonly StyleCondition[];
	readonly declarations: readonly StyleDeclaration[];
	readonly children: readonly StyleRule[];
	/** Explicit cascade layer, when the source supplied one. */
	readonly layer?: string;
	/** Stable authored order within the containing program. */
	readonly order: number;
	readonly source?: StyleProgramSource;
}

export interface StyleProgramSource {
	readonly file?: string;
	readonly start?: number;
	readonly end?: number;
	readonly adapter?: string;
}

export interface StyleProgramResidual {
	readonly kind: SwapResidualKind | string;
	readonly text: string;
	readonly hint?: string;
}

export interface StyleProgram {
	readonly schema: typeof STYLE_PROGRAM_SCHEMA;
	/** Ordered semantic rules; the complete interop representation. */
	readonly rules: readonly StyleRule[];
	/** Root declarations retained as the cheap projection for old emitters. */
	readonly declarations: readonly StyleDeclaration[];
	readonly residuals: readonly StyleProgramResidual[];
	readonly source?: StyleProgramSource;
}

export interface StyleProgramOptions {
	readonly source?: StyleProgramSource;
	readonly conditionKinds?: Readonly<Record<string, SemanticConditionKind>>;
	readonly conditionValues?: Readonly<Record<string, string>>;
	readonly conditionRaw?: Readonly<Record<string, string>>;
	/** Treat every nested object as a semantic condition of this kind. */
	readonly nestedObjectKind?: SemanticConditionKind;
	/** Absolute offset of the supplied source-object body in the source file. */
	readonly sourceOffset?: number;
}

export interface StyleRuleInput extends Omit<StyleRule, "children" | "order"> {
	readonly children?: readonly StyleRule[];
	readonly order?: number;
}

const toValue = (value: string | true | number): StyleValue => {
	if (typeof value === "string" && value.startsWith("$")) {
		return { kind: "token", ref: value.slice(1), authored: value };
	}
	return { kind: "literal", value };
};

const fromValue = (value: StyleValue): string | true | number | null => {
	if (value.kind === "token") return value.authored;
	if (value.kind === "literal") return value.value === false ? null : value.value;
	return null;
};

const PSEUDO_CONDITIONS = new Set([
	"active",
	"checked",
	"disabled",
	"empty",
	"focus",
	"focus-visible",
	"focus-within",
	"hover",
	"indeterminate",
	"placeholder-shown",
	"read-only",
	"required",
	"selected",
	"target",
	"visited",
	"before",
	"after",
]);

/** Infer only syntax-level condition meaning; project aliases remain named. */
export function inferSemanticConditionKind(name: string): SemanticConditionKind {
	if (/^@media(?:\s|$)/.test(name)) return "media";
	if (/^@container(?:\s|$)/.test(name)) return "container";
	if (/^@supports(?:\s|$)/.test(name)) return "supports";
	if (name.startsWith("&") || name.startsWith("[") || name.startsWith(":")) return "selector";
	if (PSEUDO_CONDITIONS.has(name.replace(/^:/, ""))) return "pseudo";
	return "named";
}

function conditionFor(name: string, options: StyleProgramOptions): StyleCondition {
	const value = options.conditionValues?.[name];
	return {
		kind:
			options.nestedObjectKind ??
			options.conditionKinds?.[name] ??
			inferSemanticConditionKind(name),
		name,
		...(value === undefined ? {} : { value }),
		...(options.conditionRaw?.[name] === undefined ? {} : { raw: options.conditionRaw[name] }),
	};
}

function sourceConditionFor(name: string, options: StyleProgramOptions): StyleCondition {
	const normalized = name.replace(/^_/, "");
	const condition = conditionFor(normalized, options);
	return normalized === name ? condition : { ...condition, raw: name };
}

/** Lift the flat fast-path IR into the versioned semantic representation. */
export function styleProgramFromSwapIR(
	ir: SwapIR,
	options: StyleProgramOptions = {},
): StyleProgram {
	const conditionKinds = options.conditionKinds ?? {};
	const declarations = ir.entries.map((entry) => ({
		conditions: entry.conditions.map((name) => conditionFor(name, { ...options, conditionKinds })),
		property: entry.prop,
		value: toValue(entry.value),
	}));
	const rules: readonly StyleRule[] = [
		{
			kind: "style",
			conditions: [],
			declarations,
			children: [],
			order: 0,
			source: options.source,
		},
	];
	return {
		schema: STYLE_PROGRAM_SCHEMA,
		rules,
		declarations,
		residuals: ir.residuals.map((residual) => ({
			kind: residual.kind,
			text: residual.text,
			hint: residual.hint,
		})),
		source: options.source,
	};
}

/** Build a normalized, deterministically ordered semantic program. */
export function styleProgramFromRules(
	rules: readonly StyleRuleInput[],
	options: StyleProgramOptions & { residuals?: readonly StyleProgramResidual[] } = {},
): StyleProgram {
	const normalized = rules.map((rule, index): StyleRule => ({
		...rule,
		children: rule.children ?? [],
		order: rule.order ?? index,
	}));
	const ordered = orderStyleRules(normalized);
	return {
		schema: STYLE_PROGRAM_SCHEMA,
		rules: ordered,
		declarations: ordered.flatMap((rule) =>
			rule.kind === "style" && rule.conditions.length === 0 ? rule.declarations : [],
		),
		residuals: [...(options.residuals ?? [])],
		source: options.source,
	};
}

/** Stable ordering for rules and nested at-rule children. */
export function orderStyleRules(rules: readonly StyleRule[]): StyleRule[] {
	return [...rules]
		.toSorted(
			(a, b) =>
				a.order - b.order ||
				a.kind.localeCompare(b.kind) ||
				(a.name ?? "").localeCompare(b.name ?? ""),
		)
		.map((rule) => ({ ...rule, children: orderStyleRules(rule.children) }));
}

function cssCondition(condition: StyleCondition): string {
	if (condition.value !== undefined) {
		if (condition.kind === "media") return `@media ${condition.value}`;
		if (condition.kind === "container") return `@container ${condition.value}`;
		if (condition.kind === "supports") return `@supports ${condition.value}`;
		return condition.value;
	}
	if (condition.kind === "pseudo")
		return condition.name.startsWith(":") ? condition.name : `:${condition.name}`;
	return condition.name;
}

function cssValue(value: StyleValue): string {
	if (value.kind === "token") return value.authored;
	if (value.kind === "dynamic") return value.expression;
	return typeof value.value === "string" ? value.value : String(value.value);
}

function renderDeclarations(declarations: readonly StyleDeclaration[]): string {
	return declarations
		.map((declaration) => `${declaration.property}:${cssValue(declaration.value)}`)
		.join(";");
}

function wrapConditions(body: string, conditions: readonly StyleCondition[]): string {
	return conditions.reduceRight(
		(current, condition) => `${cssCondition(condition)}{${current}}`,
		body,
	);
}

function conditionedSelector(
	rule: StyleRule,
	conditions: readonly StyleCondition[],
): { selector: string; wrappers: StyleCondition[] } {
	let selector = rule.selector ?? (rule.kind === "global" ? "*" : "&");
	const wrappers: StyleCondition[] = [];
	for (const condition of conditions) {
		if (
			condition.kind === "media" ||
			condition.kind === "container" ||
			condition.kind === "supports"
		) {
			wrappers.push(condition);
			continue;
		}
		const selectorValue =
			condition.kind === "pseudo"
				? (condition.value ?? condition.name)
				: (condition.value ?? condition.raw ?? condition.name);
		if (selectorValue.includes("&")) selector = selectorValue.replaceAll("&", selector);
		else if (condition.kind === "pseudo")
			selector += selectorValue.startsWith(":") ? selectorValue : `:${selectorValue}`;
		else if (condition.kind === "selector") selector += selectorValue;
		else selector += `:${selectorValue}`;
	}
	return { selector, wrappers };
}

/**
 * Canonical CSS-ish serialization used by adapter differential tests. It is
 * intentionally structural and stable, not a browser CSS minifier.
 */
export function styleProgramToCanonicalCss(program: StyleProgram): string {
	const renderBase = (
		rule: StyleRule,
		declarations: readonly StyleDeclaration[],
		children: readonly StyleRule[],
		selector = rule.selector,
	): string => {
		const declarationText = renderDeclarations(declarations);
		const childrenText = children.map(render).join("");
		switch (rule.kind) {
			case "style":
				return `${selector ?? "&"}{${declarationText}${childrenText}}`;
			case "global":
				return `${selector ?? "*"}{${declarationText}${childrenText}}`;
			case "keyframes":
				return `@keyframes ${rule.name ?? ""}{${declarationText}${childrenText}}`;
			case "font-face":
				return `@font-face{${declarationText}${childrenText}}`;
			case "layer":
				return `@layer ${rule.layer ?? rule.name ?? ""}{${declarationText}${childrenText}}`;
			case "supports":
				return `@supports ${rule.name ?? ""}{${declarationText}${childrenText}}`;
			case "property":
				return `@property ${rule.name ?? ""}{${declarationText}${childrenText}}`;
		}
	};
	const render = (rule: StyleRule): string => {
		const rootDeclarations = rule.declarations.filter(
			(declaration) => declaration.conditions.length === 0,
		);
		const baseConditions = rule.conditions;
		let base: string;
		if (rule.kind === "style" || rule.kind === "global") {
			const resolved = conditionedSelector(rule, baseConditions);
			base = renderBase(rule, rootDeclarations, rule.children, resolved.selector);
			base = wrapConditions(base, resolved.wrappers);
		} else {
			base = wrapConditions(renderBase(rule, rootDeclarations, rule.children), baseConditions);
		}
		const groups = new Map<
			string,
			{ conditions: StyleCondition[]; declarations: StyleDeclaration[] }
		>();
		for (const declaration of rule.declarations) {
			if (declaration.conditions.length === 0) continue;
			const key = JSON.stringify(declaration.conditions);
			const group = groups.get(key) ?? {
				conditions: [...declaration.conditions],
				declarations: [],
			};
			group.declarations.push({ ...declaration, conditions: [] });
			groups.set(key, group);
		}
		const conditional = [...groups.values()].map((group) => {
			const conditions = [...baseConditions, ...group.conditions];
			if (rule.kind === "style" || rule.kind === "global") {
				const resolved = conditionedSelector(rule, conditions);
				return wrapConditions(
					renderBase({ ...rule, children: [] }, group.declarations, [], resolved.selector),
					resolved.wrappers,
				);
			}
			return wrapConditions(
				renderBase({ ...rule, children: [] }, group.declarations, []),
				conditions,
			);
		});
		return base + conditional.join("");
	};
	return orderStyleRules(program.rules).map(render).join("");
}

interface SourceNode {
	type?: string;
	start?: number;
	end?: number;
	value?: unknown;
	name?: string;
	key?: SourceNode;
	computed?: boolean;
	kind?: string;
	valueNode?: SourceNode;
	expression?: SourceNode;
	properties?: SourceNode[];
}

function sourceSlice(body: string, node: SourceNode): string {
	const start = node.start ?? 0;
	const end = node.end ?? start;
	// `({${body}})` adds two bytes before the body in the parser input.
	return body.slice(Math.max(0, start - 2), Math.max(0, end - 2));
}

function sourceRange(
	base: StyleProgramSource | undefined,
	sourceOffset: number,
	node: SourceNode,
): StyleProgramSource {
	const start = sourceOffset + Math.max(0, (node.start ?? 2) - 2);
	const end = sourceOffset + Math.max(0, (node.end ?? node.start ?? 2) - 2);
	return { ...base, start, end };
}

function sourceKey(node: SourceNode, body: string): string | null {
	if (node.computed === true) return null;
	const key = node.key;
	if (key?.type === "Identifier" && key.name !== undefined) return key.name;
	if (key?.type === "Literal" && typeof key.value === "string") return key.value;
	return key === undefined ? null : sourceSlice(body, key).replace(/^['"]|['"]$/g, "");
}

function literalSourceValue(node: SourceNode): StyleValue | null {
	if (node.type !== "Literal") return null;
	if (
		typeof node.value === "string" ||
		typeof node.value === "number" ||
		typeof node.value === "boolean"
	) {
		return { kind: "literal", value: node.value };
	}
	return null;
}

function dynamicSourceValue(
	node: SourceNode,
	body: string,
	options: StyleProgramOptions,
): StyleDynamicValue {
	return {
		kind: "dynamic",
		expression: sourceSlice(body, node),
		lowering: "residual",
		source: sourceRange(options.source, options.sourceOffset ?? 0, node),
	};
}

function sourceObject(node: SourceNode): boolean {
	return node.type === "ObjectExpression";
}

function looksLikeCondition(name: string, options: StyleProgramOptions): boolean {
	return (
		options.nestedObjectKind !== undefined ||
		name === "base" ||
		name.startsWith("_") ||
		name.startsWith("&") ||
		name.startsWith(":") ||
		name.startsWith("@") ||
		options.conditionKinds?.[name] !== undefined ||
		options.conditionValues?.[name] !== undefined
	);
}

/**
 * Parse a source object into the semantic view without weakening
 * `parseObjectLiteral` or the `SwapIR` fast path. Literal values are emitted
 * as declarations; expressions, arrays, and templates remain dynamic nodes
 * with exact source text/ranges for runtime-capable adapters.
 */
export function styleProgramFromSourceObject(
	body: string,
	options: StyleProgramOptions = {},
): StyleProgram {
	const declarations: StyleDeclaration[] = [];
	const residuals: StyleProgramResidual[] = [];
	const addDynamicResidual = (text: string, hint: string): void => {
		residuals.push({ kind: "dynamic", text, hint });
	};

	let root: SourceNode | undefined;
	try {
		const parsed = parseSync(options.source?.file ?? "pandwind-style-program.ts", `({${body}})`, {
			lang: "tsx",
		});
		const statement = (parsed.program as { body?: SourceNode[] }).body?.[0];
		const expression = statement?.expression;
		root = expression?.type === "ParenthesizedExpression" ? expression.expression : expression;
	} catch {
		addDynamicResidual(body, "source style object could not be parsed");
	}

	const walk = (object: SourceNode, conditions: readonly StyleCondition[]): void => {
		for (const property of object.properties ?? []) {
			if (property.type === "SpreadElement") {
				addDynamicResidual(sourceSlice(body, property), "object spread requires a source adapter");
				continue;
			}
			if (property.type !== "Property" || property.kind !== "init") {
				addDynamicResidual(sourceSlice(body, property), "unsupported source style property");
				continue;
			}
			const name = sourceKey(property, body);
			if (name === null) {
				addDynamicResidual(
					sourceSlice(body, property),
					"computed style keys require a source adapter",
				);
				continue;
			}
			const valueNode = property.value as SourceNode | undefined;
			if (valueNode === undefined) {
				addDynamicResidual(sourceSlice(body, property), "missing style value");
				continue;
			}
			if (sourceObject(valueNode) && looksLikeCondition(name, options)) {
				if (name !== "base") walk(valueNode, [...conditions, sourceConditionFor(name, options)]);
				else walk(valueNode, conditions);
				continue;
			}
			const value = literalSourceValue(valueNode) ?? dynamicSourceValue(valueNode, body, options);
			declarations.push({ conditions, property: name, value });
		}
	};

	if (root === undefined || !sourceObject(root)) {
		if (residuals.length === 0)
			addDynamicResidual(body, "source style object is not an object expression");
	} else {
		walk(root, []);
	}
	return styleProgramFromRules(
		[
			{
				kind: "style",
				conditions: [],
				declarations,
				children: [],
				order: 0,
				source: options.source,
			},
		],
		{ source: options.source, residuals },
	);
}

/**
 * Lower a semantic program for legacy emitters. Dynamic declarations become
 * explicit residuals; they are never silently discarded by this bridge.
 */
export function swapIRFromStyleProgram(program: StyleProgram): SwapIR {
	const residuals: SwapResidual[] = program.residuals.map((residual) => ({
		kind: isResidualKind(residual.kind) ? residual.kind : "unrepresentable",
		text: residual.text,
		hint: residual.hint,
	}));
	const entries = [] as SwapIR["entries"];
	const rules = program.rules.length > 0 ? program.rules : [];
	for (const rule of rules) {
		if (rule.kind !== "style") {
			residuals.push({
				kind: "unrepresentable",
				text: rule.name ?? rule.selector ?? rule.kind,
				hint: `${rule.kind} rule requires a rule-capable target`,
			});
			continue;
		}
		for (const declaration of rule.declarations) {
			const value = fromValue(declaration.value);
			if (value === null) {
				residuals.push({
					kind: "dynamic",
					text:
						declaration.value.kind === "dynamic"
							? declaration.value.expression
							: `${declaration.property}: <unsupported semantic value>`,
					hint: "dynamic semantic declaration requires a target runtime",
				});
				continue;
			}
			entries.push({
				conditions: declaration.conditions.map((condition) => condition.name),
				prop: declaration.property,
				value,
			});
		}
	}
	return { entries, residuals };
}

function isResidualKind(value: string): value is SwapResidualKind {
	return value === "dynamic" || value === "unknown-value" || value === "unrepresentable";
}
