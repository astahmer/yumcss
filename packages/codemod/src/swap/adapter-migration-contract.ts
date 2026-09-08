import type { SourceScannerService } from "pandwind/source";
import type { PandwindMeta } from "../meta.ts";
import type {
	AdapterDependencies,
	AdapterGeneratedFile,
	AdapterParseContext,
	AdapterValidationResult,
	AdapterFileChange,
	AdapterMigrationOutcome,
	AdapterProjectBindings,
} from "./adapter-contract.ts";
import type { AdapterCapabilityMode, AdapterCapabilityReport } from "./capabilities.ts";
import type { StyleLoweringPlan, StyleLoweringRegistry } from "./lowering.ts";
import type { ProjectModuleLoader } from "./project-module-loader.ts";
import type { StyleAdapterRegistry } from "./adapter-registry.ts";
import type { StyleDialectResolver } from "./style-systems.ts";
import type { StyleProgramResidual } from "./semantic-ir.ts";
import type { TokenReferenceFormat } from "./tokens.ts";

export type { AdapterMigrationOutcome } from "./adapter-contract.ts";

/** Input and infrastructure boundary for one source-file migration. */
export interface AdapterMigrationOptions {
	readonly from: string;
	readonly to: string;
	readonly file: string;
	readonly root?: string;
	readonly meta?: PandwindMeta;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	readonly readFile?: (file: string) => string | undefined;
	readonly listFiles?: (root: string) => readonly string[];
	readonly mode?: AdapterCapabilityMode;
	readonly skipMarker?: string;
	/** Read-only route resolution; mutation belongs to the adapter registry. */
	readonly registry?: StyleDialectResolver;
	readonly moduleLoader?: ProjectModuleLoader;
	readonly adapterRegistry?: StyleAdapterRegistry;
	readonly loweringRegistry?: StyleLoweringRegistry;
	readonly semantic?: AdapterParseContext["semantic"];
	/** Root-relative shared target modules prepared for this migration. */
	readonly project?: AdapterProjectBindings;
	/** Token spelling policy selected for target-owned references. */
	readonly tokenReferenceFormat?: TokenReferenceFormat;
}

/** Infrastructure ports used by the adapter migration application service. */
export interface AdapterMigrationPorts {
	readonly adapterRegistry: StyleAdapterRegistry;
	readonly sourceScanner: SourceScannerService;
	readonly loweringRegistry: StyleLoweringRegistry;
	readonly resolveAdapterRegistry?: (
		moduleLoader?: ProjectModuleLoader,
	) => Promise<StyleAdapterRegistry>;
}

export interface AdapterMigrationExecutor {
	run(source: string, options: AdapterMigrationOptions): AdapterMigrationResult;
	runAsync(source: string, options: AdapterMigrationOptions): Promise<AdapterMigrationResult>;
}

export interface AdapterMigrationResult {
	readonly code: string;
	readonly outputExtension?: string;
	readonly changed: boolean;
	readonly converted: number;
	readonly skipped: number;
	readonly reports: readonly AdapterCapabilityReport[];
	readonly validations: readonly AdapterValidationResult[];
	readonly dependencies: readonly AdapterDependencies[];
	readonly generatedFiles: readonly AdapterGeneratedFile[];
	readonly sourceMaps?: readonly string[];
	readonly fileChanges: readonly AdapterFileChange[];
	readonly residuals: readonly StyleProgramResidual[];
	readonly loweringPlans: readonly StyleLoweringPlan[];
	readonly outcomes: readonly AdapterMigrationOutcome[];
}
