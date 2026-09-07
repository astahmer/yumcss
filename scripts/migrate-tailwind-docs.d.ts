export declare enum TailwindDocsLane {
    Tw = "tw",
    CssClass = "css-class",
    DesignDss = "design-dss"
}
export interface TailwindDocsLaneReport {
    readonly lane: TailwindDocsLane;
    readonly referenceCommit: string;
    readonly sourceFiles: number;
    readonly changedFiles: number;
    readonly convertedCallSites: number;
    readonly preservedTokens: number;
    readonly outputBytes: number;
    readonly sourceBytes: number;
    readonly outputByteDelta: number;
    readonly generatedUtilities: number;
    readonly generatedVariants: number;
    readonly generatedBridgeEntries: number;
    readonly sourceStylesheetBytes: number;
    readonly residuals: readonly {
        file: string;
        token: string;
        reason: string;
    }[];
}
export interface TailwindDocsMigrationOptions {
    readonly referenceRoot?: string;
    readonly outputRoot?: string;
}
export declare class TailwindDocsMigration {
    static readonly lanes: readonly TailwindDocsLane[];
    static run(lane: TailwindDocsLane, options?: TailwindDocsMigrationOptions): Promise<TailwindDocsLaneReport>;
}
