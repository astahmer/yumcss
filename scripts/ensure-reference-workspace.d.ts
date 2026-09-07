import { type ReferenceAvailability, type ReferenceWorkspace } from "./reference-workspace.ts";
/**
 * Materialize one pinned checkout before a corpus test uses it. Existing
 * checkouts are reset to the pinned commit so a partially deleted worktree
 * cannot masquerade as available evidence.
 */
export declare function ensureReferenceWorkspace(id: string, workspace?: ReferenceWorkspace): Promise<ReferenceAvailability>;
