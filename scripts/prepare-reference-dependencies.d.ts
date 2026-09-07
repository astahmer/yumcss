import { createReferenceWorkspace } from "./reference-workspace.ts";
export declare const REFERENCE_DEPENDENCY_INSTALL_KIND: {
    readonly NpmProject: "npm-project";
    readonly PnpmWorkspace: "pnpm-workspace";
};
export interface PrepareReferenceDependenciesOptions {
    readonly log?: boolean;
}
export declare function prepareReferenceDependencies(workspace: ReturnType<typeof createReferenceWorkspace>, ids?: readonly string[], options?: PrepareReferenceDependenciesOptions): readonly string[];
