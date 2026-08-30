import type { PandwindMeta } from "../meta.ts";
import type {
	AdapterCapabilities,
	AdapterCapabilityMode,
	AdapterCapabilityReport,
} from "./capabilities.ts";
import type {
	StyleComposition,
	StylePluginTransform,
	StyleProgram,
	StyleProgramOptions,
	StyleProgramResidual,
	StyleRuntimeContext,
	StyleThemeBinding,
} from "./semantic-ir.ts";
import type { SourceScanResult } from "pandwind/source";

/** Versioned source/target adapter protocol for the migration pivot. */
export const ADAPTER_CONTRACT_SCHEMA = "pandwind.style-adapter/2" as const;
export const ADAPTER_CONTRACT_VERSION = "2" as const;

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
	/** Optional filesystem port for project-aware detection (for example JSX config). */
	readonly readFile?: (file: string) => string | undefined;
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
	/** Optional filesystem port for resolving imported static style fragments. */
	readonly readFile?: (file: string) => string | undefined;
	readonly meta?: PandwindMeta;
	/** Optional language-neutral document view supplied by the scanner registry. */
	readonly document?: SourceScanResult;
	/** Source semantic metadata supplied by a framework or project integration. */
	readonly semantic?: Pick<
		StyleProgramOptions,
		"source" | "themes" | "compositions" | "runtime" | "plugins"
	> & {
		readonly themes?: readonly StyleThemeBinding[];
		readonly compositions?: readonly StyleComposition[];
		readonly runtime?: StyleRuntimeContext;
		readonly plugins?: readonly StylePluginTransform[];
	};
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
	readonly meta?: PandwindMeta;
	/** Optional language-neutral document view for target emitters. */
	readonly document?: SourceScanResult;
	/** Host binding context for adapters that emit framework wrappers. */
	readonly host?: {
		readonly binding?: string;
		readonly framework?: string;
		readonly subject?: string;
		readonly subjectAttrs?: string;
		/** Deterministic file-scoped class used by runtime component wrappers. */
		readonly stableClassName?: string;
		/** Ask a target to emit a host component instead of a style value. */
		readonly wrapComponent?: boolean;
	};
}

export interface AdapterEmitResult {
	readonly text: string;
	/** Semantic observation when emitted syntax contains opaque runtime registration. */
	readonly semantic?: StyleProgram;
	readonly imports?: readonly string[];
	readonly dependencies?: AdapterDependencies;
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterDynamicPreparationContext {
	readonly source: string;
	readonly file: string;
	readonly targetId: string;
	readonly program: StyleProgram;
	readonly binding?: string;
	readonly framework?: string;
}

export interface AdapterDynamicPreparation {
	readonly handled: boolean;
	readonly standalone?: boolean;
}

export interface AdapterRewriteContext {
	readonly source: string;
	readonly code: string;
	readonly file: string;
	readonly targetId: string;
	readonly convertedBindings: ReadonlySet<string>;
	readonly complete: boolean;
}

export interface AdapterRewriteResult {
	readonly code: string;
	readonly imports?: readonly string[];
	readonly residuals: readonly StyleProgramResidual[];
}

export interface AdapterMigrationHooks {
	prepareDynamic?(context: AdapterDynamicPreparationContext): AdapterDynamicPreparation;
	rewrite?(context: AdapterRewriteContext): AdapterRewriteResult;
	/** Target-owned policy used by the neutral migration runner for host rewrites. */
	targetPolicy?: AdapterTargetMigrationPolicy;
}

export interface AdapterTargetMigrationPolicy {
	/** Whether this target owns framework host/component rewrites. */
	readonly handlesHostRewrites: boolean;
	/**
	 * Decide whether a converted host binding must remain a component value.
	 * This is target-owned because only the target knows whether a class string
	 * can safely replace a framework component expression.
	 */
	readonly requiresHostWrapper?: (context: {
		readonly source: string;
		readonly file: string;
		readonly binding: string;
		readonly subject: string;
		readonly program: StyleProgram;
	}) => boolean;
	/** Whether parse residuals can be represented by the target as raw templates. */
	handlesRawTemplate(program: StyleProgram): boolean;
	/** Whether a source template fragment can remain a target runtime expression. */
	handlesTemplateFragment(program: StyleProgram): boolean;
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
	readonly migration?: AdapterMigrationHooks;
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
