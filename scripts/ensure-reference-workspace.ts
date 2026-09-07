import { prepareReferenceRepositories } from "./prepare-reference-repositories.ts";
import {
	createReferenceWorkspace,
	inspectReferenceAvailability,
	REFERENCE_AVAILABILITY,
	type ReferenceAvailability,
	type ReferenceWorkspace,
} from "./reference-workspace.ts";

const pendingPreparations = new Map<string, Promise<ReferenceAvailability>>();

/**
 * Materialize one pinned checkout before a corpus test uses it. Existing
 * checkouts are reset to the pinned commit so a partially deleted worktree
 * cannot masquerade as available evidence.
 */
export function ensureReferenceWorkspace(
	id: string,
	workspace: ReferenceWorkspace = createReferenceWorkspace(),
): Promise<ReferenceAvailability> {
	const key = `${workspace.root}:${id}`;
	const pending = pendingPreparations.get(key);
	if (pending !== undefined) return pending;

	const preparation = prepareReferenceRepositories(workspace, [id], { log: false }).then(() => {
		const availability = inspectReferenceAvailability(workspace, id);
		if (availability.status !== REFERENCE_AVAILABILITY.Available)
			throw new Error(
				`reference workspace was not materialized: ${availability.path} (${availability.prepareCommand})`,
			);
		return availability;
	});
	pendingPreparations.set(key, preparation);
	return preparation;
}
