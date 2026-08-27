import type { SemanticConditionKind, StyleDynamicValue, StyleProgram } from "./semantic-ir.ts";

/** Versioned contract between the semantic program and a target adapter. */
export const ADAPTER_CAPABILITIES_SCHEMA = "pandwind.adapter-capabilities/2" as const;

export type AdapterCapability =
	| "declarations"
	| "token-values"
	| "dynamic-values"
	| "named-conditions"
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
	| "browser-differential";

export type AdapterCapabilityLevel = "exact" | "partial" | "unsupported";
export type AdapterCapabilityMode = "safe" | "partial";

export interface AdapterCapabilities {
	readonly schema: typeof ADAPTER_CAPABILITIES_SCHEMA;
	readonly adapter: string;
	readonly version?: string;
	readonly capabilities: Readonly<Partial<Record<AdapterCapability, AdapterCapabilityLevel>>>;
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

const conditionCapability = (kind: SemanticConditionKind): AdapterCapability => {
	switch (kind) {
		case "pseudo":
			return "pseudo-conditions";
		case "selector":
			return "selector-conditions";
		case "media":
			return "media-conditions";
		case "container":
			return "container-conditions";
		case "supports":
			return "supports-conditions";
		case "named":
			return "named-conditions";
	}
};

const ruleCapability = (kind: StyleProgram["rules"][number]["kind"]): AdapterCapability => {
	switch (kind) {
		case "global":
			return "global-rules";
		case "keyframes":
			return "keyframes";
		case "font-face":
			return "font-face";
		case "layer":
			return "layers";
		case "supports":
			return "supports-rules";
		case "property":
			return "property-rules";
		case "style":
			return "rule-level";
	}
};

function dynamicDetail(value: StyleDynamicValue): string {
	return value.expression.length > 80 ? `${value.expression.slice(0, 77)}...` : value.expression;
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

	if (program.declarations.length > 0) add("declarations", "style declarations");
	const needsRuleLevel = program.rules.some(
		(rule) =>
			rule.kind !== "style" ||
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
	const declarations =
		program.rules.length === 0
			? program.declarations
			: program.rules.flatMap(function collect(rule): StyleProgram["declarations"] {
					return [...rule.declarations, ...rule.children.flatMap(collect)];
				});
	for (const declaration of declarations) {
		for (const condition of declaration.conditions) {
			add(conditionCapability(condition.kind), `${condition.kind}: ${condition.name}`);
		}
		if (declaration.value.kind === "token") add("token-values", `token: ${declaration.value.ref}`);
		if (declaration.value.kind === "dynamic") {
			add("dynamic-values", `dynamic: ${dynamicDetail(declaration.value)}`);
		}
	}
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
	const issues = requiredAdapterCapabilities(program).map((requirement) => {
		const level = capabilities.capabilities[requirement.capability] ?? "unsupported";
		return {
			...requirement,
			level,
			blocking: level === "unsupported" || (mode === "safe" && level === "partial"),
		};
	});
	const exact = issues.filter((issue) => issue.level === "exact");
	const partial = issues.filter((issue) => issue.level === "partial");
	const unsupported = issues.filter((issue) => issue.level === "unsupported");
	const blockers = issues.filter((issue) => issue.blocking);
	return {
		adapter: capabilities.adapter,
		mode,
		requirements: requiredAdapterCapabilities(program),
		exact,
		partial,
		unsupported,
		blockers,
		convertible: blockers.length === 0,
	};
}

/**
 * Conservative contracts for the built-in emitters. Conditions with richer
 * selector/query payloads are deliberately partial until an emitter proves
 * lossless support; callers can provide a stricter project adapter contract.
 */
export const SWAP_ADAPTER_CAPABILITIES: Readonly<Partial<Record<string, AdapterCapabilities>>> = {
	"css.class": {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "css.class",
		capabilities: {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"selector-conditions": "partial",
			"media-conditions": "partial",
			"container-conditions": "partial",
			"supports-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
	design: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "design",
		capabilities: {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
	tw: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "tw",
		capabilities: {
			declarations: "exact",
			"token-values": "partial",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
	tailwind: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "tailwind",
		capabilities: {
			declarations: "partial",
			"token-values": "partial",
			"named-conditions": "partial",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
	panda: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "panda",
		capabilities: {
			declarations: "exact",
			"token-values": "exact",
			"named-conditions": "exact",
			"pseudo-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
	stylex: {
		schema: ADAPTER_CAPABILITIES_SCHEMA,
		adapter: "stylex",
		capabilities: {
			declarations: "partial",
			"token-values": "partial",
			"pseudo-conditions": "partial",
			"selector-conditions": "partial",
			"media-conditions": "partial",
			"dynamic-values": "unsupported",
		},
	},
};
