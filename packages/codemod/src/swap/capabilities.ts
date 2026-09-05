import { SemanticConditionKindTag, StyleRuleKindTag, StyleValueKindTag } from "./semantic-ir.ts";
import type { SemanticConditionKind, StyleDynamicValue, StyleProgram } from "./semantic-ir.ts";
import type { AdapterDependencies } from "./adapter-contract.ts";
import { StyleDynamicExpressionKind } from "./identifiers.ts";
import { StyleProgramAnalysis } from "./style-program-analysis.ts";

/** Versioned contract between the semantic program and a target adapter. */
export const ADAPTER_CAPABILITIES_SCHEMA = "pandwind.adapter-capabilities/2" as const;

export type AdapterCapability =
	| "declarations"
	| "token-values"
	| "custom-properties"
	| "dynamic-values"
	| "function-values"
	| "named-conditions"
	| "named-rules"
	| "pseudo-conditions"
	| "selector-conditions"
	| "media-conditions"
	| "container-conditions"
	| "supports-conditions"
	| "rule-level"
	| "global-rules"
	| "keyframes"
	| "font-face"
	| "layers"
	| "supports-rules"
	| "property-rules"
	| "selectors"
	| "nesting"
	| "ordering"
	| "recipes"
	| "components"
	| "host-framework"
	| "ssr"
	| "hydration"
	| "browser-differential"
	| "theme-context"
	| "composition"
	| "runtime-context"
	| "plugin-transforms"
	| "framework-semantics";

export type AdapterCapabilityLevel = "exact" | "partial" | "unsupported";
export type AdapterCapabilityMode = "safe" | "partial";

export const enum AdapterCapabilityLevelTag {
	Exact = "exact",
	Partial = "partial",
	Unsupported = "unsupported",
}

export const enum AdapterCapabilityModeTag {
	Safe = "safe",
}

export interface AdapterCapabilities {
	readonly schema: typeof ADAPTER_CAPABILITIES_SCHEMA;
	readonly adapter: string;
	readonly version?: string;
	readonly capabilities: Readonly<Partial<Record<AdapterCapability, AdapterCapabilityLevel>>>;
}

/** Registry-derived capability metadata used by reports and CI gates. */
export interface AdapterCapabilityMatrixEntry extends AdapterCapabilities {
	readonly sourceModules: readonly string[];
	readonly dependencies: AdapterDependencies;
}

export interface AdapterCapabilityMatrix {
	readonly schema: typeof ADAPTER_CAPABILITIES_SCHEMA;
	readonly entries: readonly AdapterCapabilityMatrixEntry[];
	get(adapter: string): AdapterCapabilityMatrixEntry | undefined;
}

export interface ProgramCapabilityRequirement {
	readonly capability: AdapterCapability;
	readonly detail: string;
}

export interface AdapterCapabilityIssue extends ProgramCapabilityRequirement {
	readonly level: AdapterCapabilityLevel;
	readonly blocking: boolean;
}

export interface AdapterCapabilityReport {
	readonly adapter: string;
	readonly mode: AdapterCapabilityMode;
	readonly requirements: readonly ProgramCapabilityRequirement[];
	readonly exact: readonly AdapterCapabilityIssue[];
	readonly partial: readonly AdapterCapabilityIssue[];
	readonly unsupported: readonly AdapterCapabilityIssue[];
	readonly blockers: readonly AdapterCapabilityIssue[];
	readonly convertible: boolean;
}

/** Build the capability view from registered adapters; no second catalog is allowed. */
export function createAdapterCapabilityMatrix(
	adapters: readonly AdapterCapabilityMatrixEntry[],
): AdapterCapabilityMatrix {
	const entries = adapters.map((adapter) => ({
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: adapter.adapter,
		...(adapter.version === undefined ? {} : { version: adapter.version }),
		sourceModules: [...adapter.sourceModules],
		dependencies: adapter.dependencies,
		capabilities: { ...adapter.capabilities },
	}));
	const byId = new Map(entries.map((entry) => [entry.adapter, entry]));
	return {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		entries,
		get: (adapter) => byId.get(adapter),
	};
}

const conditionCapability = (kind: SemanticConditionKind): AdapterCapability => {
	switch (kind) {
		case SemanticConditionKindTag.Pseudo:
			return "pseudo-conditions";
		case SemanticConditionKindTag.Selector:
			return "selector-conditions";
		case SemanticConditionKindTag.Media:
			return "media-conditions";
		case SemanticConditionKindTag.Container:
			return "container-conditions";
		case SemanticConditionKindTag.Supports:
			return "supports-conditions";
		case SemanticConditionKindTag.Named:
			return "named-conditions";
		default:
			throw new Error(`unknown semantic condition kind: ${kind}`);
	}
};

const ruleCapability = (kind: StyleProgram["rules"][number]["kind"]): AdapterCapability => {
	switch (kind) {
		case StyleRuleKindTag.Global:
			return "global-rules";
		case StyleRuleKindTag.Keyframes:
			return "keyframes";
		case StyleRuleKindTag.FontFace:
			return "font-face";
		case StyleRuleKindTag.Layer:
			return "layers";
		case StyleRuleKindTag.Supports:
			return "supports-rules";
		case StyleRuleKindTag.Property:
			return "property-rules";
		case StyleRuleKindTag.Style:
			return "rule-level";
		default:
			throw new Error(`unknown style rule kind: ${kind}`);
	}
};

function dynamicDetail(value: StyleDynamicValue): string {
	return value.expression.length > 80 ? `${value.expression.slice(0, 77)}...` : value.expression;
}

function isFunctionDynamic(value: StyleDynamicValue): boolean {
	return (
		value.expressionKind === StyleDynamicExpressionKind.Function ||
		/=>|^function\b/.test(value.expression.trim())
	);
}

/** Return the minimum target capabilities needed to interpret a program. */
export function requiredAdapterCapabilities(
	program: StyleProgram,
): readonly ProgramCapabilityRequirement[] {
	const requirements: ProgramCapabilityRequirement[] = [];
	const seen = new Set<AdapterCapability>();
	const add = (capability: AdapterCapability, detail: string): void => {
		if (seen.has(capability)) return;
		seen.add(capability);
		requirements.push({ capability, detail });
	};

	if (StyleProgramAnalysis.declarations(program).length > 0) {
		add("declarations", "style declarations");
	}
	if (program.source?.subject !== undefined)
		add("components", `component subject: ${program.source.subject}`);
	for (const rule of program.rules) {
		if (rule.name !== undefined && rule.kind === StyleRuleKindTag.Style)
			add("named-rules", `named style rule: ${rule.name}`);
	}
	const needsRuleLevel = program.rules.some(
		(rule) =>
			rule.kind !== StyleRuleKindTag.Style ||
			rule.selector !== undefined ||
			rule.children.length > 0 ||
			rule.conditions.length > 0,
	);
	if (needsRuleLevel) {
		add("rule-level", `${program.rules.length} semantic rules`);
		if (program.rules.length > 1) add("ordering", "ordered semantic rules");
	}
	for (const rule of program.rules) {
		if (needsRuleLevel) add(ruleCapability(rule.kind), `${rule.kind} rule`);
		if (rule.selector !== undefined) add("selectors", `selector: ${rule.selector}`);
		if (rule.children.length > 0) add("nesting", `${rule.kind} nested rules`);
	}
	const declarations = StyleProgramAnalysis.declarations(program);
	for (const declaration of declarations) {
		for (const condition of declaration.conditions) {
			add(conditionCapability(condition.kind), `${condition.kind}: ${condition.name}`);
		}
		if (declaration.value.kind === StyleValueKindTag.Token)
			add("token-values", `token: ${declaration.value.ref}`);
		if (declaration.value.kind === StyleValueKindTag.Dynamic) {
			add(
				isFunctionDynamic(declaration.value) ? "function-values" : "dynamic-values",
				`dynamic: ${dynamicDetail(declaration.value)}`,
			);
		}
	}
	// Theme bindings are project provenance; a target only needs theme support
	// when a declaration actually resolves through one. Incidental bindings on
	// a program whose values are literal or statically-resolved tokens would
	// otherwise block targets that preserve the style faithfully.
	const referencesTheme = declarations.some((declaration) => {
		if (declaration.value.kind !== StyleValueKindTag.Dynamic) return false;
		return (program.themes ?? []).some(
			(binding) =>
				declaration.value.expression === binding.authored ||
				declaration.value.expression === `theme.${binding.path}`,
		);
	});
	if (referencesTheme)
		add("theme-context", `${program.themes?.length ?? 0} theme binding(s)`);
	if ((program.compositions?.length ?? 0) > 0)
		add("composition", `${program.compositions?.length ?? 0} composition edge(s)`);
	if (program.runtime !== undefined) add("runtime-context", `${program.runtime.phase} runtime`);
	if ((program.plugins?.length ?? 0) > 0)
		add("plugin-transforms", `${program.plugins?.length ?? 0} plugin transform(s)`);
	// A document's language/framework is provenance until the program actually
	// carries host or component semantics. Requiring a target framework adapter
	// for a standalone style value creates false capability mismatches: the
	// target only needs to preserve the style carrier, not rewrite JSX/template
	// syntax. Host-bound and styled-subject programs still require this contract.
	if (
		program.source?.framework !== undefined &&
		(program.source.subject !== undefined ||
			program.source.hostOpenTag !== undefined ||
			program.source.hostStyleAttributes !== undefined)
	)
		add("framework-semantics", program.source.framework);
	return requirements;
}

/**
 * Check a target contract without changing the emitter. Safe mode requires
 * exact support; partial mode permits explicitly partial capabilities while
 * still rejecting unknown/unsupported semantics.
 */
export function inspectAdapterCapabilities(
	capabilities: AdapterCapabilities,
	program: StyleProgram,
	mode: AdapterCapabilityMode = "safe",
): AdapterCapabilityReport {
	const requirements = requiredAdapterCapabilities(program);
	const issues = requirements.map((requirement) => {
		const level = capabilities.capabilities[requirement.capability] ?? "unsupported";
		return {
			...requirement,
			level,
			blocking:
				level === AdapterCapabilityLevelTag.Unsupported ||
				(mode === AdapterCapabilityModeTag.Safe && level === AdapterCapabilityLevelTag.Partial),
		};
	});
	const exact = issues.filter((issue) => issue.level === AdapterCapabilityLevelTag.Exact);
	const partial = issues.filter((issue) => issue.level === AdapterCapabilityLevelTag.Partial);
	const unsupported = issues.filter(
		(issue) => issue.level === AdapterCapabilityLevelTag.Unsupported,
	);
	const blockers = issues.filter((issue) => issue.blocking);
	return {
		adapter: capabilities.adapter,
		mode,
		requirements,
		exact,
		partial,
		unsupported,
		blockers,
		convertible: blockers.length === 0,
	};
}
