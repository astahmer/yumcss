/** A task has a stable id so failures remain actionable after batching. */
export interface ToolingTask<A> {
    readonly id: string;
    readonly run: () => Promise<A>;
}
export interface ToolingTaskOptions {
    readonly concurrency?: number;
    readonly signal?: AbortSignal;
}
export interface ToolingTaskRunner {
    run<A>(tasks: readonly ToolingTask<A>[], options?: ToolingTaskOptions): Promise<readonly A[]>;
}
export declare class ToolingTaskError extends Error {
    readonly taskId: string;
    readonly cause: unknown;
    constructor(taskId: string, cause: unknown);
}
/**
 * Effect is deliberately kept behind this local tooling port. Callers get an
 * ordered Promise API and do not need to depend on Effect's service model.
 */
export declare function createEffectToolingTaskRunner(): ToolingTaskRunner;
export interface ToolingFileSystem {
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    ensureDirectory(path: string): Promise<void>;
    resolve(...segments: readonly string[]): Promise<string>;
}
/** Node implementation of the tooling filesystem/path ports using Effect 4. */
export declare function createEffectToolingFileSystem(): ToolingFileSystem;
