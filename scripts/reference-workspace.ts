import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveReferenceCheckoutId } from "./reference-repository-catalog.ts";

export interface ReferenceWorkspace {
	readonly root: string;
	path(id: string): string;
}

export const REFERENCE_AVAILABILITY = {
	Available: "available",
	Unavailable: "unavailable",
} as const;

export type ReferenceAvailabilityStatus =
	(typeof REFERENCE_AVAILABILITY)[keyof typeof REFERENCE_AVAILABILITY];

export interface ReferenceAvailability {
	readonly id: string;
	readonly path: string;
	readonly status: ReferenceAvailabilityStatus;
	readonly prepareCommand: "nub run references:prepare";
}

export function createReferenceWorkspace(root?: string): ReferenceWorkspace {
	const workspaceRoot = resolve(
		root ?? process.env.PANDWIND_REFERENCE_ROOT ?? join(homedir(), ".references"),
	);
	return {
		root: workspaceRoot,
		path: (id) => {
			const [checkoutId, ...segments] = id.split("/");
			return join(workspaceRoot, resolveReferenceCheckoutId(checkoutId ?? id), ...segments);
		},
	};
}

export function inspectReferenceAvailability(
	workspace: ReferenceWorkspace,
	id: string,
): ReferenceAvailability {
	const path = workspace.path(id);
	return {
		id,
		path,
		status: existsSync(path)
			? REFERENCE_AVAILABILITY.Available
			: REFERENCE_AVAILABILITY.Unavailable,
		prepareCommand: "nub run references:prepare",
	};
}
