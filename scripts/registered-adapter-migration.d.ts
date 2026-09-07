import { type AdapterProjectBindings } from "pandwind-codemod/swap";
import type { PandwindMeta } from "pandwind-codemod/migration/meta";
export interface CorpusTransformResult {
    readonly code: string;
    readonly changed: boolean;
    readonly converted: number;
    readonly unmappedTokens: readonly {
        file: string;
        token: string;
        reason: string;
    }[];
    readonly skippedByMarker: number;
}
export interface RegisteredMigrationOptions {
    readonly source: string;
    /** Root-relative document identifier used by the adapter and emitted imports. */
    readonly file: string;
    readonly root: string;
    readonly files: readonly string[];
    readonly meta: PandwindMeta;
    readonly from: string;
    readonly to: string;
    readonly project?: AdapterProjectBindings;
}
export declare function migrateRegisteredFile(options: RegisteredMigrationOptions): Promise<CorpusTransformResult>;
export declare function discoverProjectFiles(root: string): Promise<readonly string[]>;
