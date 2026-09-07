import { type AdapterMigrationResult } from "pandwind-codemod/swap";
export declare enum StylexDocsLane {
    RuntimeCss = "runtime-css",
    AtomicCss = "atomic-css",
    DesignDss = "design-dss"
}
export interface StylexDocsLaneReport {
    readonly lane: StylexDocsLane;
    readonly sourceFiles: number;
    readonly changedFiles: number;
    readonly converted: number;
    readonly skipped: number;
    readonly residuals: number;
    readonly invalidValidations: number;
    readonly outputBytes: number;
}
interface StylexDocsMigrationLane {
    readonly id: StylexDocsLane;
    migrate(source: string, context: {
        file: string;
        root: string;
    }): Promise<AdapterMigrationResult>;
}
export declare class StylexDocsMigration {
    static readonly lanes: readonly StylexDocsMigrationLane[];
    static run(root: string, laneId: StylexDocsLane, outputRoot?: string): Promise<StylexDocsLaneReport>;
}
export {};
