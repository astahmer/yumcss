/**
 * Versioned semantic style-program IR.
 *
 * `SwapIR` stays deliberately flat and cheap for the common literal swap
 * path. This richer representation is the interop boundary: adapters can
 * distinguish selector/media/container conditions, token identity, dynamic
 * values, and provenance without teaching every source parser about every
 * target library.
 */
import {
	SwapResidualKindTag,
	type SwapIR,
	type SwapResidual,
	type SwapResidualKind,
} from "./ir.ts";
export { SwapResidualKindTag } from "./ir.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import {
	StyleProgramConditionOrder,
	StyleProgramCompositionKind,
	StyleDynamicExpressionKind,
	type StyleProgramEmissionHint,
} from "./identifiers.ts";
import { createStyleDeclarationOrderingPolicy } from "./style-declaration-order.ts";
import { NodeKind, PropertyKindTag } from "pandwind/tw/literal";

const defaultDeclarationOrdering = createStyleDeclarationOrderingPolicy();

export const STYLE_PROGRAM_SCHEMA = "pandwind.style-program/4" as const;

export const enum SemanticConditionKindTag {
	Named = "named",
	Pseudo = "pseudo",
	Selector = "selector",
	Media = "media",
	Container = "container",
	Supports = "supports",
}

export const enum StyleConditionOperatorTag {
	And = "and",
	Or = "or",
	Not = "not",
}

export const enum StyleRuleKindTag {
	Style = "style",
	Global = "global",
	Keyframes = "keyframes",
	FontFace = "font-face",
	Layer = "layer",
	Supports = "supports",
	Property = "property",
}

export const enum StyleValueKindTag {
	Token = "token",
	Literal = "literal",
	Dynamic = "dynamic",
}
export type StyleValueKind = `${StyleValueKindTag}`;
type StyleTokenKind = `${StyleValueKindTag.Token}`;
type StyleLiteralKind = `${StyleValueKindTag.Literal}`;
type StyleDynamicKind = `${StyleValueKindTag.Dynamic}`;

export const enum StyleDynamicLoweringTag {
	Runtime = "runtime",
	CustomProperty = "custom-property",
	StaticOnly = "static-only",
	Residual = "residual",
}

export const enum StyleStaticEvaluationStatusTag {
	Unresolved = "unresolved",
}
export type StyleStaticEvaluationStatus = `${StyleStaticEvaluationStatusTag}`;

/** Known residual categories used by lowering and migration diagnostics. */
export const enum StyleProgramResidualKindTag {
	Dynamic = "dynamic",
	FunctionDynamic = "function-dynamic",
	DynamicCustomProperty = "dynamic-custom-property",
	DynamicFallback = "dynamic-fallback",
	DynamicValues = "dynamic-values",
	RuntimeContext = "runtime-context",
	Parse = "parse",
	Capability = "capability",
	Nesting = "nesting",
	Configuration = "configuration",
	UnknownUtility = "unknown-utility",
	Composition = "composition",
	Component = "component",
	HostFramework = "host-framework",
	PluginTransform = "plugin-transform",
	UnmatchedSource = "unmatched-source",
}

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

export type SemanticConditionKind = `${SemanticConditionKindTag}`;

export type StyleConditionOperator = `${StyleConditionOperatorTag}`;

export type StyleRuleKind = `${StyleRuleKindTag}`;

export interface StyleTokenValue {
	readonly kind: StyleTokenKind;
	/** Stable source-facing token reference without the `$` sigil. */
	readonly ref: string;
	/** Exact authored spelling, retained for lossless emission. */
	readonly authored: string;
	readonly resolved?: string;
}

export interface StyleLiteralValue {
	readonly kind: StyleLiteralKind;
	readonly value: string | boolean | number;
}

export type StyleDynamicLowering = `${StyleDynamicLoweringTag}`;

export interface StyleStaticEvaluation {
	readonly attempted: true;
	readonly status: StyleStaticEvaluationStatus;
	readonly reason: string;
}

export interface StyleDynamicValue {
	readonly kind: StyleDynamicKind;
	/** Source expression or placeholder retained for a target adapter. */
	readonly expression: string;
	/** Parsed expression shape used by lowering and framework host adapters. */
	readonly expressionKind?: StyleDynamicExpressionKind;
	/** Evidence that compile-time evaluation was attempted and could not resolve it. */
	readonly staticEvaluation?: StyleStaticEvaluation;
	readonly fallback?: StyleLiteralValue;
	/** Exact source range for diagnostics and source-to-source adapters. */
	readonly source?: StyleProgramSource;
	/** Optional names extracted by a source adapter for dependency analysis. */
	readonly dependencies?: readonly string[];
	/** Adapter hint; `residual` is the safe default for flat targets. */
	readonly lowering?: StyleDynamicLowering;
}

export type StyleValue = StyleTokenValue | StyleLiteralValue | StyleDynamicValue;

type StyleValueTransform = (value: StyleValue, property?: string) => StyleValue;

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
	/** Source-adapter pattern that owns this program, for specialized emission. */
	readonly pattern?: string;
	/** Authored factory subject, for example `styled.button` or `styled(Base)`. */
	readonly subject?: string;
	readonly subjectKind?: "member" | "call";
	/** Authored `.attrs(...)` expression attached to a styled subject. */
	readonly subjectAttrs?: string;
	readonly framework?: string;
	/** Original JSX opening element when a source adapter owns style props. */
	readonly hostOpenTag?: string;
	/** Canonical intrinsic tag for factory JSX hosts such as `<styled.button>`. */
	readonly hostTag?: string;
	/** Source attributes consumed by the style-prop adapter. */
	readonly hostStyleAttributes?: readonly string[];
	/** Marks a style program that must be rendered back into its host element. */
	readonly hostAttribute?: string;
	/** Original template body retained for a lossless runtime global fallback. */
	readonly template?: string;
}

interface StyleProgramCanonicalization {
	/** Conditions that are semantic defaults rather than emitted selectors. */
	readonly ignoredConditions?: readonly Pick<StyleCondition, "kind" | "name">[];
	/** Ordering policy for conditional declaration groups. */
	readonly conditionalOrder?: StyleProgramConditionOrder;
}

export interface StyleThemeBinding {
	readonly path: string;
	readonly authored?: string;
	readonly resolved?: string;
	readonly source?: StyleProgramSource;
}

export interface StyleComposition {
	readonly kind: StyleProgramCompositionKind;
	readonly reference: string;
	/** Static slot names when a source recipe declares its anatomy explicitly. */
	readonly slots?: readonly string[];
	readonly source?: StyleProgramSource;
	readonly program?: StyleProgram;
}

export interface StyleRuntimeContext {
	readonly phase: "build" | "server" | "client" | "render";
	readonly framework?: string;
	readonly dependencies: readonly string[];
	readonly hydrationKey?: string;
}

export interface StylePluginTransform {
	readonly id: string;
	readonly version?: string;
	readonly input: string;
	readonly output?: string;
}

export interface StyleProgramResidual {
	readonly kind: SwapResidualKind | string;
	readonly text: string;
	readonly hint?: string;
	/** The target explicitly retained this residual in a semantic carrier. */
	readonly preserved?: boolean;
}

export interface StyleProgram {
	readonly schema: typeof STYLE_PROGRAM_SCHEMA;
	/** Ordered semantic rules; the complete interop representation. */
	readonly rules: readonly StyleRule[];
	/** Root declarations retained as the cheap projection for flat consumers. */
	readonly declarations: readonly StyleDeclaration[];
	readonly residuals: readonly StyleProgramResidual[];
	/** All authored source locations represented by rules and dynamic values. */
	readonly sourceMap?: readonly StyleProgramSource[];
	readonly source?: StyleProgramSource;
	readonly themes?: readonly StyleThemeBinding[];
	readonly compositions?: readonly StyleComposition[];
	readonly runtime?: StyleRuntimeContext;
	readonly plugins?: readonly StylePluginTransform[];
	/** Generic target-neutral emission intent supplied by a source adapter. */
	readonly emissionHints?: readonly StyleProgramEmissionHint[];
	readonly canonicalization?: StyleProgramCanonicalization;
}

export interface StyleProgramOptions {
	readonly source?: StyleProgramSource;
	readonly conditionKinds?: Readonly<Record<string, SemanticConditionKind>>;
	readonly conditionValues?: Readonly<Record<string, string>>;
	readonly conditionRaw?: Readonly<Record<string, string>>;
	/** Treat every nested object as a semantic condition of this kind. */
	readonly nestedObjectKind?: SemanticConditionKind;
	/** Treat named object members as independent style rules, not conditions. */
	readonly namedRuleObjects?: boolean;
	/** Keep a source system's default named group instead of flattening it. */
	readonly preserveDefaultGroup?: boolean;
	/** Adapter-owned object containers whose contents are the actual style object. */
	readonly unwrapNestedObjectKeys?: readonly string[];
	/** Adapter-owned metadata keys that describe a style object but are not styles. */
	readonly ignoredObjectKeys?: readonly string[];
	/** Source systems such as StyleX encode conditional values under a property. */
	readonly propertyValueConditions?: boolean;
	/** Optional adapter-owned allow-list for property-value condition keys. */
	readonly propertyValueConditionNames?: ReadonlySet<string>;
	/** Adapter-owned variant containers, for example Stitches `variants`. */
	readonly variantContainerKeys?: readonly string[];
	/** Source-adapter mappings for computed custom-property keys. */
	readonly computedKeys?: Readonly<Record<string, string>>;
	/** Source-adapter resolver for computed keys that need semantic lowering. */
	readonly computedKeyResolver?: (expression: string) => string | undefined;
	/** Source-adapter mappings for runtime variable references in values. */
	readonly dynamicReferences?: Readonly<Record<string, string>>;
	/** Source-adapter object bindings that can be safely expanded at parse time. */
	readonly objectReferences?: Readonly<Record<string, string>>;
	/** Source aliases expanded into one or more canonical CSS properties. */
	readonly propertyAliases?: Readonly<Record<string, string | readonly string[]>>;
	/** Source-specific value normalization, for example default theme spacing. */
	/** Use `*` as a fallback for every property when an adapter needs a uniform policy. */
	readonly valueTransforms?: Readonly<Record<string, StyleValueTransform>>;
	/** Adapter-owned array fields that expand into independent semantic rules. */
	readonly arrayRuleKinds?: Readonly<Record<string, StyleRuleKind>>;
	/** Adapter-owned arrays whose entries are composition references. */
	readonly compositionArrayKeys?: readonly string[];
	/** Absolute offset of the supplied source-object body in the source file. */
	readonly sourceOffset?: number;
	/** Additional provenance entries supplied by an adapter. */
	readonly sourceMap?: readonly StyleProgramSource[];
	readonly themes?: readonly StyleThemeBinding[];
	readonly compositions?: readonly StyleComposition[];
	readonly runtime?: StyleRuntimeContext;
	readonly plugins?: readonly StylePluginTransform[];
	readonly emissionHints?: readonly StyleProgramEmissionHint[];
	readonly canonicalization?: StyleProgramCanonicalization;
}

export interface StyleRuleInput extends Omit<StyleRule, "children" | "order"> {
	readonly children?: readonly StyleRule[];
	readonly order?: number;
}

function sourceIdentity(source: StyleProgramSource): string {
	return JSON.stringify(source);
}

function normalizeDynamicValue(value: StyleValue): StyleValue {
	if (value.kind !== StyleValueKindTag.Dynamic) return value;
	return {
		...value,
		expressionKind: value.expressionKind ?? dynamicExpressionKind(value.expression),
		staticEvaluation: value.staticEvaluation ?? {
			attempted: true,
			status: StyleStaticEvaluationStatusTag.Unresolved,
			reason: "expression depends on runtime or unresolved source bindings",
		},
	};
}

function normalizeRule(rule: StyleRuleInput, index: number): StyleRule {
	return {
		...rule,
		declarations: defaultDeclarationOrdering.order(
			rule.declarations.map((declaration) => ({
				...declaration,
				value: normalizeDynamicValue(declaration.value),
			})),
		),
		children: (rule.children ?? []).map((child, childIndex) => normalizeRule(child, childIndex)),
		order: rule.order ?? index,
	};
}

function collectSources(
	rules: readonly StyleRule[],
	root: StyleProgramSource | undefined,
	provided: readonly StyleProgramSource[] | undefined,
	themes: readonly StyleThemeBinding[] | undefined,
	compositions: readonly StyleComposition[] | undefined,
): readonly StyleProgramSource[] {
	const sources = new Map<string, StyleProgramSource>();
	const add = (source: StyleProgramSource | undefined): void => {
		if (source !== undefined) sources.set(sourceIdentity(source), source);
	};
	for (const source of provided ?? []) add(source);
	add(root);
	for (const theme of themes ?? []) add(theme.source);
	for (const composition of compositions ?? []) add(composition.source);
	const work = [...rules].toReversed();
	while (work.length > 0) {
		const rule = work.pop()!;
		add(rule.source);
		for (const declaration of rule.declarations) {
			if (declaration.value.kind === StyleValueKindTag.Dynamic) add(declaration.value.source);
		}
		for (const child of rule.children.toReversed()) work.push(child);
	}
	return [...sources.values()];
}

const toValue = (value: string | true | number): StyleValue => {
	if (typeof value === "string" && value.startsWith("$")) {
		return { kind: StyleValueKindTag.Token, ref: value.slice(1), authored: value };
	}
	return { kind: StyleValueKindTag.Literal, value };
};

const fromValue = (value: StyleValue): string | true | number | null => {
	if (value.kind === StyleValueKindTag.Token) return value.authored;
	if (value.kind === StyleValueKindTag.Literal) return value.value === false ? null : value.value;
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
	if (
		name.includes("&") ||
		name.startsWith(".") ||
		name.startsWith("#") ||
		name.startsWith("&") ||
		name.startsWith("[") ||
		name.startsWith(":")
	)
		return "selector";
	if (PSEUDO_CONDITIONS.has(name.replace(/^:/, ""))) return "pseudo";
	return "named";
}

function conditionFor(name: string, options: StyleProgramOptions): StyleCondition {
	const value = options.conditionValues?.[name];
	const inferredNameKind = inferSemanticConditionKind(name);
	return {
		kind:
			options.conditionKinds?.[name] ??
			(inferredNameKind === SemanticConditionKindTag.Named
				? (options.nestedObjectKind ?? inferSemanticConditionKind(value ?? name))
				: inferredNameKind),
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
			kind: StyleRuleKindTag.Style,
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
			preserved: residual.preserved,
		})),
		sourceMap: collectSources(
			rules,
			options.source,
			options.sourceMap,
			options.themes,
			options.compositions,
		),
		source: options.source,
		themes: options.themes ?? [],
		compositions: options.compositions ?? [],
		runtime: options.runtime,
		plugins: options.plugins ?? [],
		emissionHints: options.emissionHints ?? [],
		canonicalization: options.canonicalization,
	};
}

/** Build a normalized, deterministically ordered semantic program. */
export function styleProgramFromRules(
	rules: readonly StyleRuleInput[],
	options: StyleProgramOptions & { residuals?: readonly StyleProgramResidual[] } = {},
): StyleProgram {
	const normalized = rules.map(normalizeRule);
	const ordered = orderStyleRules(normalized);
	return {
		schema: STYLE_PROGRAM_SCHEMA,
		rules: ordered,
		declarations: ordered.flatMap((rule) =>
			rule.kind === StyleRuleKindTag.Style &&
			rule.name === undefined &&
			rule.conditions.length === 0
				? rule.declarations
				: [],
		),
		residuals: [...(options.residuals ?? [])],
		sourceMap: collectSources(
			ordered,
			options.source,
			options.sourceMap,
			options.themes,
			options.compositions,
		),
		source: options.source,
		themes: options.themes ?? [],
		compositions: options.compositions ?? [],
		runtime: options.runtime,
		plugins: options.plugins ?? [],
		emissionHints: options.emissionHints ?? [],
		canonicalization: options.canonicalization,
	};
}

/** Stable ordering for rules and nested at-rule children. */
export function orderStyleRules(rules: readonly StyleRule[]): StyleRule[] {
	const ordered = (input: readonly StyleRule[]): StyleRule[] =>
		[...input].toSorted(
			(a, b) =>
				a.order - b.order ||
				compareCodeUnits(a.kind, b.kind) ||
				compareCodeUnits(a.name ?? "", b.name ?? ""),
		);
	type Frame = {
		readonly rules: StyleRule[];
		index: number;
		readonly result: StyleRule[];
		readonly resume?: { readonly parent: Frame; readonly rule: StyleRule };
	};
	const root: Frame = { rules: ordered(rules), index: 0, result: [] };
	const frames: Frame[] = [root];
	while (frames.length > 0) {
		const frame = frames.at(-1)!;
		const rule = frame.rules[frame.index++];
		if (rule !== undefined) {
			if (rule.children.length === 0) {
				frame.result.push({ ...rule, children: [] });
			} else {
				frames.push({
					rules: ordered(rule.children),
					index: 0,
					result: [],
					resume: { parent: frame, rule },
				});
			}
			continue;
		}
		frames.pop();
		if (frame.resume !== undefined)
			frame.resume.parent.result.push({ ...frame.resume.rule, children: frame.result });
	}
	return root.result;
}

function compareCodeUnits(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function cssCondition(condition: StyleCondition): string {
	if (condition.value !== undefined) {
		if (condition.kind === SemanticConditionKindTag.Media) return `@media ${condition.value}`;
		if (condition.kind === SemanticConditionKindTag.Container)
			return `@container ${condition.value}`;
		if (condition.kind === SemanticConditionKindTag.Supports) return `@supports ${condition.value}`;
		return condition.value;
	}
	if (condition.kind === SemanticConditionKindTag.Pseudo)
		return condition.name.startsWith(":") ? condition.name : `:${condition.name}`;
	return condition.name;
}

function cssValue(value: StyleValue): string {
	if (value.kind === StyleValueKindTag.Token) return value.resolved ?? value.authored;
	if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
	return typeof value.value === "string" ? value.value : String(value.value);
}

function renderDeclarations(declarations: readonly StyleDeclaration[]): string {
	return defaultDeclarationOrdering
		.order(declarations)
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
	let selector = rule.selector ?? (rule.kind === StyleRuleKindTag.Global ? "*" : "&");
	const wrappers: StyleCondition[] = [];
	for (const condition of conditions) {
		if (
			condition.kind === SemanticConditionKindTag.Media ||
			condition.kind === SemanticConditionKindTag.Container ||
			condition.kind === SemanticConditionKindTag.Supports
		) {
			wrappers.push(condition);
			continue;
		}
		const selectorValue =
			condition.kind === SemanticConditionKindTag.Pseudo
				? (condition.value ?? condition.name)
				: (condition.value ?? condition.raw ?? condition.name);
		// A parent selector such as `[data-theme=dark] &` is already a
		// complete nesting expression. Reordering it to `&[data-theme=dark]`
		// changes an ancestor condition into an element condition.
		const normalizedSelectorValue = selectorValue;
		if (normalizedSelectorValue.includes("&"))
			selector = normalizedSelectorValue.replaceAll("&", selector);
		else if (condition.kind === SemanticConditionKindTag.Pseudo)
			selector += normalizedSelectorValue.startsWith(":")
				? normalizedSelectorValue
				: `:${normalizedSelectorValue}`;
		else if (condition.kind === SemanticConditionKindTag.Selector)
			selector += normalizedSelectorValue;
		else selector += `:${normalizedSelectorValue}`;
	}
	return { selector, wrappers };
}

/**
 * Canonical CSS-ish serialization used by adapter differential tests. It is
 * intentionally structural and stable, not a browser CSS minifier.
 */
export function styleProgramToCanonicalCss(program: StyleProgram): string {
	const canonicalConditions = (conditions: readonly StyleCondition[]): StyleCondition[] =>
		conditions.filter(
			(condition) =>
				!program.canonicalization?.ignoredConditions?.some(
					(ignored) =>
						ignored.name === condition.name &&
						(ignored.kind === undefined || ignored.kind === condition.kind),
				),
		);
	const renderBase = (
		rule: StyleRule,
		declarations: readonly StyleDeclaration[],
		children: readonly StyleRule[],
		selector = rule.selector,
	): string => {
		const declarationText = renderDeclarations(declarations);
		const childrenText = children.map(render).join("");
		switch (rule.kind) {
			case StyleRuleKindTag.Style:
				return `${selector ?? "&"}{${declarationText}}${childrenText}`;
			case StyleRuleKindTag.Global:
				return `${selector ?? "*"}{${declarationText}}${childrenText}`;
			case StyleRuleKindTag.Keyframes:
				return `@keyframes ${rule.name ?? ""}{${declarationText}${childrenText}}`;
			case StyleRuleKindTag.FontFace:
				return `@font-face{${declarationText}${childrenText}}`;
			case StyleRuleKindTag.Layer:
				return `@layer ${rule.layer ?? rule.name ?? ""}{${declarationText}${childrenText}}`;
			case StyleRuleKindTag.Supports:
				return `@supports ${rule.name ?? ""}{${declarationText}${childrenText}}`;
			case StyleRuleKindTag.Property:
				return `@property ${rule.name ?? ""}{${declarationText}${childrenText}}`;
			default:
				throw new Error(`unknown style rule kind: ${rule.kind}`);
		}
	};
	const render = (rule: StyleRule): string => {
		// Source-object adapters keep an empty root style rule as the structural
		// parent of named rules. It has no CSS meaning and must not make a
		// semantically equivalent target look different during validation.
		if (rule.declarations.length === 0 && rule.children.length === 0) return "";
		const rootDeclarations = rule.declarations.filter(
			(declaration) => canonicalConditions(declaration.conditions).length === 0,
		);
		const baseConditions = rule.conditions;
		let base: string;
		if (rootDeclarations.length === 0 && rule.children.length === 0) {
			// A style rule whose declarations are all conditional has no empty
			// unconditional selector. Omitting that placeholder keeps the canonical
			// form equivalent to the authored conditional rule.
			base = "";
		} else if (rule.kind === StyleRuleKindTag.Style || rule.kind === StyleRuleKindTag.Global) {
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
			const conditions = canonicalConditions(declaration.conditions);
			if (conditions.length === 0) continue;
			const key = JSON.stringify(conditions);
			const group = groups.get(key) ?? {
				conditions,
				declarations: [],
			};
			group.declarations.push({ ...declaration, conditions: [] });
			groups.set(key, group);
		}
		const conditionalGroups = [...groups.values()];
		if (program.canonicalization?.conditionalOrder === StyleProgramConditionOrder.Depth)
			conditionalGroups.sort((a, b) => a.conditions.length - b.conditions.length);
		const conditional = conditionalGroups.map((group) => {
			const conditions = [...baseConditions, ...group.conditions];
			if (rule.kind === StyleRuleKindTag.Style || rule.kind === StyleRuleKindTag.Global) {
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
	operator?: string;
	left?: SourceNode;
	right?: SourceNode;
	test?: SourceNode;
	consequent?: SourceNode;
	alternate?: SourceNode;
	argument?: SourceNode;
	kind?: string;
	valueNode?: SourceNode;
	expression?: SourceNode;
	properties?: SourceNode[];
	elements?: SourceNode[];
	quasis?: SourceNode[];
	expressions?: SourceNode[];
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

function cssVariableExpression(value: string): string {
	return value
		.replace(/\$\{\s*(?:vars|tokens)\s*\[\s*(['"])(--[^'"]+)\1\s*\]\s*\}/g, "var($2)")
		.replace(/^\s*(?:vars|tokens)\s*\[\s*(['"])(--[^'"]+)\1\s*\]\s*$/, "var($2)");
}

function sourceKey(node: SourceNode, body: string, options: StyleProgramOptions): string | null {
	if (node.computed === true) {
		const expression = node.key === undefined ? "" : sourceSlice(body, node.key).trim();
		const literal = expression.match(
			/^(?:\[\s*)?(['"])([^'"]+)\1(?:\s+as\s+[A-Za-z_$][\w$]*)?\s*(?:\])?$/,
		);
		if (literal?.[2] !== undefined) return literal[2];
		const resolved = options.computedKeyResolver?.(expression);
		if (resolved !== undefined) return resolved;
		const conditionValue = options.conditionValues?.[expression];
		if (conditionValue !== undefined) return conditionValue;
		return options.computedKeys?.[expression] ?? null;
	}
	const key = node.key;
	if (key?.type === NodeKind.Identifier && key.name !== undefined) return key.name;
	if (key?.type === NodeKind.Literal && typeof key.value === "string") return key.value;
	return key === undefined ? null : sourceSlice(body, key).replace(/^['"]|['"]$/g, "");
}

function literalSourceValue(node: SourceNode): StyleValue | null {
	if (node.type === NodeKind.ParenthesizedExpression && node.expression !== undefined)
		return literalSourceValue(node.expression);
	if (node.type === NodeKind.TemplateLiteral) {
		const quasis = node.quasis ?? [];
		const expressions = node.expressions ?? [];
		if (quasis.length !== expressions.length + 1) return null;
		let value = "";
		for (let index = 0; index < quasis.length; index++) {
			const quasiValue = quasis[index]?.value;
			if (typeof quasiValue === "string") value += quasiValue;
			else if (
				quasiValue !== null &&
				typeof quasiValue === "object" &&
				typeof (quasiValue as { cooked?: unknown }).cooked === "string"
			)
				value += (quasiValue as { cooked: string }).cooked;
			else return null;
			const expression = expressions[index];
			if (expression !== undefined) {
				const evaluated = literalSourceValue(expression);
				if (evaluated?.kind !== StyleValueKindTag.Literal) return null;
				value += String(evaluated.value);
			}
		}
		return { kind: StyleValueKindTag.Literal, value };
	}
	if (node.type === NodeKind.UnaryExpression && (node.operator === "-" || node.operator === "+")) {
		const argument = node.argument === undefined ? null : literalSourceValue(node.argument);
		if (argument?.kind === StyleValueKindTag.Literal && typeof argument.value === "number") {
			return {
				kind: StyleValueKindTag.Literal,
				value: node.operator === "-" ? -argument.value : argument.value,
			};
		}
	}
	if (node.type === NodeKind.ConditionalExpression) {
		const test = node.test === undefined ? null : literalSourceValue(node.test);
		if (test?.kind === StyleValueKindTag.Literal && typeof test.value === "boolean") {
			const selected = test.value ? node.consequent : node.alternate;
			return selected === undefined ? null : literalSourceValue(selected);
		}
	}
	if (node.type === NodeKind.BinaryExpression || node.type === NodeKind.LogicalExpression) {
		const left = node.left === undefined ? null : literalSourceValue(node.left);
		const right = node.right === undefined ? null : literalSourceValue(node.right);
		if (left?.kind === StyleValueKindTag.Literal && right?.kind === StyleValueKindTag.Literal) {
			const value = evaluateLiteralBinary(node.operator, left.value, right.value);
			if (value !== undefined) return { kind: StyleValueKindTag.Literal, value };
		}
	}
	if (node.type !== NodeKind.Literal) return null;
	if (
		typeof node.value === "string" ||
		typeof node.value === "number" ||
		typeof node.value === "boolean"
	) {
		return { kind: StyleValueKindTag.Literal, value: node.value };
	}
	return null;
}

function evaluateLiteralBinary(
	operator: string | undefined,
	left: string | boolean | number,
	right: string | boolean | number,
): string | boolean | number | undefined {
	switch (operator) {
		case "+":
			if (
				(typeof left !== "string" && typeof left !== "number") ||
				(typeof right !== "string" && typeof right !== "number")
			)
				return undefined;
			return typeof left === "number" && typeof right === "number"
				? left + right
				: `${left}${right}`;
		case "-":
		case "*":
		case "/":
		case "%":
			if (typeof left !== "number" || typeof right !== "number") return undefined;
			if (operator === "-") return left - right;
			if (operator === "*") return left * right;
			if (operator === "/") return right === 0 ? undefined : left / right;
			return left % right;
		case "&&":
			return left && right;
		case "||":
			return left || right;
		case "===":
			return left === right;
		case "!==":
			return left !== right;
		default:
			return undefined;
	}
}

function dynamicExpressionKind(expression: string): StyleDynamicExpressionKind {
	const trimmed = expression.trim();
	if (
		/^(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(trimmed) ||
		/^function(?:\s+[A-Za-z_$][\w$]*)?\s*\(/.test(trimmed)
	)
		return StyleDynamicExpressionKind.Function;
	if (trimmed.startsWith("`") || trimmed.includes("${")) return StyleDynamicExpressionKind.Template;
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) return StyleDynamicExpressionKind.Object;
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) return StyleDynamicExpressionKind.Array;
	if (/^(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*$/.test(trimmed))
		return StyleDynamicExpressionKind.Member;
	if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) return StyleDynamicExpressionKind.Identifier;
	if (/^[A-Za-z_$][\w$]*\s*\(/.test(trimmed)) return StyleDynamicExpressionKind.Call;
	if (trimmed.includes("?") && trimmed.includes(":")) return StyleDynamicExpressionKind.Conditional;
	if (/[+\-*/%|&<>]=?/.test(trimmed)) return StyleDynamicExpressionKind.Binary;
	return StyleDynamicExpressionKind.Unknown;
}

function dynamicSourceValue(
	node: SourceNode,
	body: string,
	options: StyleProgramOptions,
): StyleValue {
	const sourceExpression = sourceSlice(body, node);
	const directReference = options.dynamicReferences?.[sourceExpression.trim()];
	if (directReference !== undefined)
		return {
			kind: StyleValueKindTag.Literal,
			value: directReference,
		};
	const normalizedExpression = cssVariableExpression(sourceExpression);
	if (normalizedExpression !== sourceExpression && !normalizedExpression.includes("${")) {
		const value =
			normalizedExpression.startsWith("`") && normalizedExpression.endsWith("`")
				? normalizedExpression.slice(1, -1)
				: normalizedExpression;
		return { kind: StyleValueKindTag.Literal, value };
	}
	const expression = sourceExpression.replace(
		/\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\}/g,
		(match, name: string) =>
			options.dynamicReferences?.[name] === undefined ? match : options.dynamicReferences[name]!,
	);
	if (
		expression.trim().startsWith("`") &&
		expression.trim().endsWith("`") &&
		!expression.includes("${")
	)
		return { kind: StyleValueKindTag.Literal, value: expression.trim().slice(1, -1) };
	return {
		kind: StyleValueKindTag.Dynamic,
		expression,
		expressionKind: dynamicExpressionKind(expression),
		staticEvaluation: {
			attempted: true,
			status: StyleStaticEvaluationStatusTag.Unresolved,
			reason: "expression depends on runtime or unresolved source bindings",
		},
		lowering: StyleDynamicLoweringTag.Residual,
		source: sourceRange(options.source, options.sourceOffset ?? 0, node),
		dependencies: [...new Set(expression.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) ?? [])],
	};
}

function sourceObject(node: SourceNode): boolean {
	return node.type === NodeKind.ObjectExpression;
}

function looksLikeCondition(name: string, options: StyleProgramOptions): boolean {
	return (
		options.nestedObjectKind !== undefined ||
		name === "base" ||
		name.startsWith("_") ||
		name.startsWith("&") ||
		name.startsWith(":") ||
		name.startsWith("@") ||
		PSEUDO_CONDITIONS.has(name.replace(/^:/, "")) ||
		options.conditionKinds?.[name] !== undefined ||
		options.conditionValues?.[name] !== undefined
	);
}

function looksLikeNamedRuleKey(name: string, options: StyleProgramOptions): boolean {
	return (
		options.namedRuleObjects === true &&
		name !== "base" &&
		options.conditionKinds?.[name] === undefined &&
		options.conditionValues?.[name] === undefined &&
		!name.startsWith("_") &&
		!name.startsWith("&") &&
		!name.startsWith(":") &&
		!name.startsWith("@") &&
		!PSEUDO_CONDITIONS.has(name.replace(/^:/, ""))
	);
}

function looksLikePropertyValueConditions(
	name: string,
	value: SourceNode,
	body: string,
	options: StyleProgramOptions,
): boolean {
	if (
		options.propertyValueConditions !== true ||
		name === "base" ||
		name.startsWith("_") ||
		name.startsWith("&") ||
		name.startsWith(":") ||
		name.startsWith("@") ||
		PSEUDO_CONDITIONS.has(name.replace(/^:/, "")) ||
		!sourceObject(value) ||
		(options.propertyValueConditionNames !== undefined &&
			!options.propertyValueConditionNames.has(name))
	)
		return false;
	const properties = value.properties ?? [];
	return (
		properties.length > 0 &&
		properties.every((property) => {
			if (property.type !== NodeKind.Property || property.kind !== PropertyKindTag.Init)
				return false;
			const propertyName = sourceKey(property, body, options);
			return (
				propertyName === "default" ||
				propertyName === "base" ||
				propertyName?.startsWith("_") === true ||
				propertyName?.startsWith(":") === true ||
				propertyName?.startsWith("&") === true ||
				propertyName?.startsWith("[") === true ||
				propertyName?.startsWith("@") === true ||
				(propertyName !== null && options.conditionKinds?.[propertyName] !== undefined) ||
				(propertyName !== null && options.conditionValues?.[propertyName] !== undefined)
			);
		})
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
	const themes: StyleThemeBinding[] = [...(options.themes ?? [])];
	const compositions: StyleComposition[] = [...(options.compositions ?? [])];
	const specialRules: StyleRule[] = [];
	const themePaths = new Set(themes.map((theme) => theme.path));
	const compositionKeys = new Set(["compose", "composes", "extend", "extends"]);
	const addDynamicResidual = (text: string, hint: string): void => {
		residuals.push({ kind: StyleProgramResidualKindTag.Dynamic, text, hint });
	};
	const addDeclaration = (
		name: string,
		valueNode: SourceNode,
		conditions: readonly StyleCondition[],
	): void => {
		const value = literalSourceValue(valueNode) ?? dynamicSourceValue(valueNode, body, options);
		if (value.kind === StyleValueKindTag.Dynamic) {
			const themeMatch = /^(?:theme|tokens)\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/.exec(
				value.expression.trim(),
			);
			if (themeMatch?.[1] !== undefined && !themePaths.has(themeMatch[1])) {
				themePaths.add(themeMatch[1]);
				themes.push({
					path: themeMatch[1],
					authored: value.expression.trim(),
					source: value.source,
				});
			}
		}
		const valueTransform = options.valueTransforms?.[name] ?? options.valueTransforms?.["*"];
		const normalizedValue = valueTransform?.(value, name) ?? value;
		const aliases = options.propertyAliases?.[name] ?? name;
		for (const canonicalProperty of typeof aliases === "string" ? [aliases] : aliases)
			declarations.push({ conditions, property: canonicalProperty, value: normalizedValue });
	};
	const addConditionalValues = (
		name: string,
		valueNode: SourceNode,
		conditions: readonly StyleCondition[],
	): void => {
		if (!sourceObject(valueNode)) {
			addDeclaration(name, valueNode, conditions);
			return;
		}
		for (const conditionProperty of valueNode.properties ?? []) {
			if (
				conditionProperty.type !== NodeKind.Property ||
				conditionProperty.kind !== PropertyKindTag.Init
			) {
				addDynamicResidual(
					sourceSlice(body, conditionProperty),
					"conditional style values must be initialized properties",
				);
				continue;
			}
			const conditionName = sourceKey(conditionProperty, body, options);
			const conditionValue = conditionProperty.value as SourceNode | undefined;
			if (conditionName === null || conditionValue === undefined) {
				addDynamicResidual(
					sourceSlice(body, conditionProperty),
					"conditional style values require static condition keys and values",
				);
				continue;
			}
			addConditionalValues(
				name,
				conditionValue,
				conditionName === "default"
					? conditions
					: [...conditions, sourceConditionFor(conditionName, options)],
			);
		}
	};

	let root: SourceNode | undefined;
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: options.source?.file ?? "pandwind-style-program.tsx",
			source: `({${body}})`,
			language: "tsx",
		});
		const statement = (parsed.program as { body?: SourceNode[] }).body?.[0];
		const expression = statement?.expression;
		root =
			expression?.type === NodeKind.ParenthesizedExpression ? expression.expression : expression;
	} catch {
		addDynamicResidual(body, "source style object could not be parsed");
	}

	const walk = (object: SourceNode, conditions: readonly StyleCondition[]): void => {
		for (const property of object.properties ?? []) {
			if (property.type === NodeKind.SpreadElement) {
				const reference = sourceSlice(body, property)
					.trim()
					.replace(/^\.\.\./, "")
					.trim();
				const referencedBody = options.objectReferences?.[reference];
				if (referencedBody !== undefined) {
					const referenced = styleProgramFromSourceObject(referencedBody, {
						...options,
						objectReferences: undefined,
						sourceOffset: 0,
					});
					declarations.push(...referenced.declarations);
					specialRules.push(
						...referenced.rules.filter((rule) => rule.kind !== StyleRuleKindTag.Style),
					);
					residuals.push(...referenced.residuals);
				} else {
					addDynamicResidual(
						sourceSlice(body, property),
						"object spread requires a source adapter",
					);
				}
				continue;
			}
			if (property.type !== NodeKind.Property || property.kind !== PropertyKindTag.Init) {
				addDynamicResidual(sourceSlice(body, property), "unsupported source style property");
				continue;
			}
			const name = sourceKey(property, body, options);
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
			if (options.ignoredObjectKeys?.includes(name) === true) continue;
			if (
				options.compositionArrayKeys?.includes(name) === true &&
				valueNode.type === NodeKind.ArrayExpression
			) {
				for (const element of valueNode.elements ?? []) {
					const reference = sourceSlice(body, element).trim();
					if (reference === "") {
						addDynamicResidual(
							sourceSlice(body, element),
							"composition entries require a source reference",
						);
						continue;
					}
					compositions.push({
						kind: StyleProgramCompositionKind.Mixin,
						reference,
						source: sourceRange(options.source, options.sourceOffset ?? 0, element),
					});
				}
				continue;
			}
			const specialKind = options.arrayRuleKinds?.[name];
			if (specialKind !== undefined && valueNode.type === NodeKind.ArrayExpression) {
				for (const element of valueNode.elements ?? []) {
					if (!sourceObject(element)) {
						addDynamicResidual(
							sourceSlice(body, element),
							`${specialKind} array entries must be object expressions`,
						);
						continue;
					}
					const before = declarations.length;
					walk(element, []);
					specialRules.push({
						kind: specialKind,
						conditions: [],
						declarations: declarations.splice(before),
						children: [],
						order: specialRules.length + 1,
						source: sourceRange(options.source, options.sourceOffset ?? 0, element),
					});
				}
				continue;
			}
			if (compositionKeys.has(name)) {
				const reference = sourceSlice(body, valueNode).trim();
				if (reference !== "")
					compositions.push({
						kind: name.startsWith("extend")
							? StyleProgramCompositionKind.Extends
							: StyleProgramCompositionKind.Mixin,
						reference,
						source: sourceRange(options.source, options.sourceOffset ?? 0, valueNode),
					});
				continue;
			}
			if (sourceObject(valueNode) && options.variantContainerKeys?.includes(name)) {
				for (const variant of valueNode.properties ?? []) {
					if (variant.type !== NodeKind.Property || variant.kind !== PropertyKindTag.Init) continue;
					const variantName = sourceKey(variant, body, options);
					const values = variant.value as SourceNode | undefined;
					if (variantName === null || values === undefined || !sourceObject(values)) {
						addDynamicResidual(
							sourceSlice(body, variant),
							"variant configuration is not an object",
						);
						continue;
					}
					for (const option of values.properties ?? []) {
						if (option.type !== NodeKind.Property || option.kind !== PropertyKindTag.Init) continue;
						const optionName = sourceKey(option, body, options);
						const optionStyles = option.value as SourceNode | undefined;
						if (optionName === null || optionStyles === undefined || !sourceObject(optionStyles)) {
							addDynamicResidual(sourceSlice(body, option), "variant value is not an object");
							continue;
						}
						walk(optionStyles, [
							...conditions,
							{ kind: "named", name: variantName },
							{ kind: "named", name: optionName },
						]);
					}
				}
				continue;
			}
			const referencedObject = options.objectReferences?.[sourceSlice(body, valueNode).trim()];
			if (referencedObject !== undefined && options.unwrapNestedObjectKeys?.includes(name)) {
				const referenced = styleProgramFromSourceObject(referencedObject, {
					...options,
					objectReferences: undefined,
					sourceOffset: 0,
				});
				declarations.push(...referenced.declarations);
				specialRules.push(
					...referenced.rules.filter((rule) => rule.kind !== StyleRuleKindTag.Style),
				);
				residuals.push(...referenced.residuals);
				continue;
			}
			if (looksLikePropertyValueConditions(name, valueNode, body, options)) {
				addConditionalValues(name, valueNode, conditions);
				continue;
			}
			if (sourceObject(valueNode) && options.unwrapNestedObjectKeys?.includes(name)) {
				walk(valueNode, conditions);
				continue;
			}
			if (sourceObject(valueNode) && looksLikeNamedRuleKey(name, options)) {
				const declarationStart = declarations.length;
				const specialRuleStart = specialRules.length;
				walk(valueNode, conditions);
				const ruleDeclarations = declarations.splice(declarationStart);
				const nestedRules = specialRules.splice(specialRuleStart);
				specialRules.push({
					kind: StyleRuleKindTag.Style,
					name,
					conditions: [],
					declarations: ruleDeclarations,
					children: nestedRules,
					order: specialRules.length + 1,
					source: sourceRange(options.source, options.sourceOffset ?? 0, valueNode),
				});
				continue;
			}
			if (sourceObject(valueNode) && looksLikeCondition(name, options)) {
				if (name !== "base" || options.preserveDefaultGroup === true)
					walk(valueNode, [...conditions, sourceConditionFor(name, options)]);
				else walk(valueNode, conditions);
				continue;
			}
			addDeclaration(name, valueNode, conditions);
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
				kind: StyleRuleKindTag.Style,
				conditions: [],
				declarations,
				children: [],
				order: 0,
				source: options.source,
			},
			...specialRules,
		],
		{
			source: options.source,
			residuals,
			themes,
			compositions,
			runtime: options.runtime,
			plugins: options.plugins,
			emissionHints: options.emissionHints,
			canonicalization: options.canonicalization,
		},
	);
}

/**
 * Lower a semantic program for flat emitters. Dynamic declarations become
 * explicit residuals; they are never silently discarded by this bridge.
 */
export function swapIRFromStyleProgram(program: StyleProgram): SwapIR {
	const residuals: SwapResidual[] = program.residuals.map((residual) => ({
		kind: isResidualKind(residual.kind) ? residual.kind : "unrepresentable",
		text: residual.text,
		hint: residual.hint,
		preserved: residual.preserved,
	}));
	const entries = [] as SwapIR["entries"];
	const rules = program.rules.length > 0 ? program.rules : [];
	for (const rule of rules) {
		if (
			rule.kind !== StyleRuleKindTag.Style ||
			rule.selector !== undefined ||
			rule.conditions.length > 0 ||
			rule.children.length > 0
		) {
			residuals.push({
				kind: SwapResidualKindTag.Unrepresentable,
				text: rule.name ?? rule.selector ?? rule.kind,
				hint: "rich semantic structure requires a rule-capable target",
			});
			continue;
		}
		for (const declaration of rule.declarations) {
			const value = fromValue(declaration.value);
			if (value === null) {
				residuals.push({
					kind: StyleProgramResidualKindTag.Dynamic,
					text:
						declaration.value.kind === StyleValueKindTag.Dynamic
							? declaration.value.expression
							: `${declaration.property}: <unsupported semantic value>`,
					hint: "dynamic semantic declaration requires a target runtime",
				});
				continue;
			}
			entries.push({
				conditions: declaration.conditions.map(flatConditionName),
				prop: declaration.property,
				value,
			});
		}
	}
	return { entries, residuals };
}

const flatConditionName = (condition: StyleCondition): string => {
	if (
		condition.kind === SemanticConditionKindTag.Media ||
		condition.kind === SemanticConditionKindTag.Container ||
		condition.kind === SemanticConditionKindTag.Supports
	) {
		const prefix = `@${condition.kind}`;
		const value = condition.value ?? condition.name;
		if (value.startsWith(`${prefix} `)) return value;
		if (condition.value !== undefined || value.startsWith("(")) return `${prefix} ${value}`;
	}
	return condition.name;
};

function isResidualKind(value: string): value is SwapResidualKind {
	return (
		value === SwapResidualKindTag.Dynamic ||
		value === SwapResidualKindTag.UnknownValue ||
		value === SwapResidualKindTag.Unrepresentable
	);
}
