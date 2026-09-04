export declare enum ChakraDocsLane {
    CssClass = "css-class",
    DesignCss = "design-css"
}
export interface ChakraDocsLaneReport {
    readonly lane: ChakraDocsLane;
    readonly referenceCommit: string;
    readonly sourceFiles: number;
    readonly changedFiles: number;
    readonly convertedCallSites: number;
    readonly skippedCallSites: number;
    readonly sourceBytes: number;
    readonly outputBytes: number;
    readonly outputByteDelta: number;
    readonly residuals: readonly {
        file: string;
        kind: string;
        text: string;
        hint?: string;
    }[];
}
export interface ChakraDocsMigrationOptions {
    readonly referenceRoot?: string;
    readonly outputRoot?: string;
}
export declare class ChakraDocsMigration {
    static readonly lanes: readonly ChakraDocsLane[];
    static run(lane: ChakraDocsLane, options?: ChakraDocsMigrationOptions): Promise<ChakraDocsLaneReport>;
}
