import type { YumCSSMeta } from "../meta.ts";
import type { AdapterDependencies } from "./adapter-contract.ts";
import type { TokenReferenceFormat } from "./tokens.ts";

/** Port for project-wide migrations that need more than one source match. */
export interface ProjectMigrationContext {
	readonly projectRoot: string;
	readonly from: string;
	readonly to: string;
	readonly reportFormat: "text" | "json";
	readonly patterns: readonly string[];
	readonly filePaths: readonly string[];
	readonly meta: YumCSSMeta;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	readonly outDir?: string;
	readonly force?: boolean;
	readonly diff: boolean;
	readonly report: boolean;
	readonly write: boolean;
	readonly skipMarker: string;
	readonly tokenReferenceFormat?: TokenReferenceFormat;
	readonly hoistStaticStyles?: boolean;
}

export interface ProjectMigrationCommand {
	readonly id: string;
	/** Target ids for which this project-level pipeline owns the route. */
	readonly targets: readonly string[];
	/** Dependencies required by the target project support emitted by this command. */
	readonly dependencies?: AdapterDependencies;
	run(context: ProjectMigrationContext): Promise<void>;
}
