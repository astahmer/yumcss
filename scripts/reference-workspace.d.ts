export interface ReferenceWorkspace {
    readonly root: string;
    path(id: string): string;
}
export declare function createReferenceWorkspace(root?: string): ReferenceWorkspace;
