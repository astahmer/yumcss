export declare enum ShadcnV4MigrationLane {
    Tw = "tw",
    Css = "css",
    Dcss = "dcss"
}
export interface ShadcnV4MigrationOptions {
    readonly referenceRoot?: string;
    readonly outputRoot?: string;
    readonly reportPath?: string;
}
export interface ShadcnV4MigrationReport {
    readonly schema: "pandwind.shadcn-v4-migration/1";
    readonly lane: ShadcnV4MigrationLane;
    readonly referenceCommit: string;
    readonly sourceFiles: number;
    readonly changedFiles: number;
    readonly convertedCallSites: number;
    readonly residualCount: number;
    readonly residualSamples: readonly {
        file: string;
        token: string;
        reason: string;
    }[];
    readonly sourceBytes: number;
    readonly outputBytes: number;
    readonly outputByteDelta: number;
    readonly generatedUtilities: number;
    readonly generatedVariants: number;
    readonly generatedBridgeEntries: number;
}
export declare class ShadcnV4Migration {
    static readonly lanes: readonly ShadcnV4MigrationLane[];
    static run(lane: ShadcnV4MigrationLane, options?: ShadcnV4MigrationOptions): Promise<ShadcnV4MigrationReport>;
}
