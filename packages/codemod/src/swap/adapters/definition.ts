import { ADAPTER_CAPABILITIES_SCHEMA, type AdapterCapabilities } from "../capabilities.ts";
import type { AdapterDependencies, AdapterEmitResult } from "../adapter-contract.ts";
import type { StyleProgram } from "../semantic-ir.ts";

export interface CallPattern {
	readonly name: string;
	readonly regex: RegExp;
	readonly form?: "object" | "template" | "reference";
}

export interface AdapterRenderers {
	readonly firstKind: (program: StyleProgram) => StyleProgram["rules"][number]["kind"];
	readonly programObject: (program: StyleProgram) => string;
	readonly declarationsObject: (
		declarations: readonly StyleProgram["declarations"][number][],
	) => string;
	readonly templateCss: (program: StyleProgram) => string;
}

export interface AdapterDefinition {
	readonly id: string;
	readonly patterns: readonly CallPattern[];
	readonly packages: AdapterDependencies;
	readonly capabilities: AdapterCapabilities;
	readonly detectPatterns: readonly RegExp[];
	readonly sourceModules: readonly string[];
	emit(
		program: StyleProgram,
		renderers: AdapterRenderers,
	): Pick<AdapterEmitResult, "text" | "imports">;
}

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
