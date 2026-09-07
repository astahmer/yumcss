export interface PinnedReferenceRepository {
    readonly id: string;
    readonly repository: string;
    readonly commit: string;
}
/** One deterministic catalog drives cloning and pin auditing. */
export declare function createPinnedReferenceRepositoryCatalog(): readonly PinnedReferenceRepository[];
/** Resolve a logical corpus id to the checkout name used by the workspace. */
export declare function resolveReferenceCheckoutId(id: string): string;
