import { createReferenceWorkspace } from "./reference-workspace.ts";
export interface PrepareReferenceRepositoriesOptions {
    readonly log?: boolean;
}
export declare function prepareReferenceRepositories(workspace: ReturnType<typeof createReferenceWorkspace>, ids?: readonly string[], options?: PrepareReferenceRepositoriesOptions): Promise<readonly string[]>;
