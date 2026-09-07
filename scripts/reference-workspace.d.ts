export interface ReferenceWorkspace {
    readonly root: string;
    path(id: string): string;
}
export declare const REFERENCE_AVAILABILITY: {
    readonly Available: "available";
    readonly Unavailable: "unavailable";
};
export type ReferenceAvailabilityStatus = (typeof REFERENCE_AVAILABILITY)[keyof typeof REFERENCE_AVAILABILITY];
export interface ReferenceAvailability {
    readonly id: string;
    readonly path: string;
    readonly status: ReferenceAvailabilityStatus;
    readonly prepareCommand: "nub run references:prepare";
}
export declare function createReferenceWorkspace(root?: string): ReferenceWorkspace;
export declare function inspectReferenceAvailability(workspace: ReferenceWorkspace, id: string): ReferenceAvailability;
