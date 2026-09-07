export declare enum PostHogDocsLane {
    Tw = "tw",
    CssClass = "css-class",
    DesignCss = "design-css"
}
export interface PostHogDocsMigrationOptions {
    readonly referenceRoot?: string;
    readonly outputRoot?: string;
}
export interface PostHogDocsMigrationReport {
    readonly lane: PostHogDocsLane;
    readonly referenceCommit: string;
    readonly sourceFiles: number;
    readonly changedFiles: number;
    readonly convertedCallSites: number;
    readonly residualCount: number;
    readonly residuals: readonly {
        file: string;
        token: string;
        reason: string;
    }[];
    readonly sourceBytes: number;
    readonly outputBytes: number;
    readonly outputByteDelta: number;
    readonly mappedTokens: number;
}
export declare class PostHogDocsMigration {
    static readonly lanes: readonly PostHogDocsLane[];
    static run(lane: PostHogDocsLane, options?: PostHogDocsMigrationOptions): Promise<PostHogDocsMigrationReport>;
    /**
     * Materialize the untouched checkout used as the browser/CSS baseline.
     * Keeping this beside the lane materializer prevents parity runs from
     * accidentally comparing a lane with a manually edited or stale baseline.
     */
    static materializeBaseline(options?: Pick<PostHogDocsMigrationOptions, "referenceRoot" | "outputRoot">): Promise<{
        referenceCommit: string;
        outputRoot: string;
    }>;
}
