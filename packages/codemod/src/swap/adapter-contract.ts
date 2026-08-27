import type { PandwindMeta } from "../meta.ts";
import type {
	AdapterCapabilities,
	AdapterCapabilityMode,
	AdapterCapabilityReport,
} from "./capabilities.ts";
import type { StyleProgram, StyleProgramResidual } from "./semantic-ir.ts";

/** Versioned source/target adapter protocol for the migration pivot. */
export const ADAPTER_CONTRACT_SCHEMA = "pandwind.style-adapter/2" as const;

export type AdapterDependencyKind = "runtime" | "development" | "peer" | "config";

export interface AdapterDependency {
	readonly name: string;
	readonly range?: string;
	readonly kind: AdapterDependencyKind;
}

export interface AdapterDependencies {
	readonly packages: readonly AdapterDependency[];
	readonly files?: readonly string[];
}

export interface AdapterDetectionContext {
	readonly file: string;
	readonly source: string;
	readonly root?: string;
	readonly packageJson?: Readonly<Record<string, unknown>>;
}

export interface AdapterDetectionResult {
	readonly matched: boolean;
	readonly confidence: number;
	readonly evidence: readonly string[];
}

export interface AdapterProjectConfig {
	readonly adapter: string;
	readonly root?: string;
	readonly files: readonly string[];
	readonly values: Readonly<Record<string, unknown>>;
}

export interface AdapterConfigContext extends AdapterDetectionContext {
	readonly readFile?: (file: string) => string | undefined;
}

export interface AdapterParseContext extends AdapterDetectionContext {
	readonly config: AdapterProjectConfig;
	readonly meta?: PandwindMeta;
}

export interface AdapterMatch {
	readonly start: number;
	readonly end: number;
	readonly program: StyleProgram;
	readonly sourceText: string;
}

export interface AdapterParseResult {
	readonly matches: readonly AdapterMatch[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterEmitContext {
	readonly file: string;
	readonly config: AdapterProjectConfig;
	readonly mode: AdapterCapabilityMode;
	readonly capability?: AdapterCapabilityReport;
	readonly index: number;
}

export interface AdapterEmitResult {
	readonly text: string;
	readonly imports?: readonly string[];
	readonly dependencies?: AdapterDependencies;
	readonly residuals: readonly StyleProgramResidual[];
}

export type AdapterLossiness = "lossless" | "lossy" | "unsupported";

export interface AdapterValidationResult {
	readonly valid: boolean;
	readonly lossiness: AdapterLossiness;
	readonly canonicalSource: string;
	readonly canonicalTarget: string;
	readonly differences: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface StyleAdapter {
	readonly schema: typeof ADAPTER_CONTRACT_SCHEMA;
	readonly id: string;
	readonly version: string;
	/** Package entry points this adapter owns and may remove during migration. */
	readonly sourceModules: readonly string[];
	readonly capabilities: AdapterCapabilities;
	readonly dependencies: AdapterDependencies;
	detect(context: AdapterDetectionContext): AdapterDetectionResult;
	loadConfig(context: AdapterConfigContext): AdapterProjectConfig;
	parse(source: string, context: AdapterParseContext): AdapterParseResult;
	emit(program: StyleProgram, context: AdapterEmitContext): AdapterEmitResult;
	validate(
		source: StyleProgram,
		target: StyleProgram,
		residuals?: readonly StyleProgramResidual[],
	): AdapterValidationResult;
}
