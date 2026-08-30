import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface ReferenceWorkspace {
	readonly root: string;
	path(id: string): string;
}

export function createReferenceWorkspace(root?: string): ReferenceWorkspace {
	const workspaceRoot = resolve(
		root ?? process.env.PANDWIND_REFERENCE_ROOT ?? join(homedir(), ".references"),
	);
	return {
		root: workspaceRoot,
		path: (id) => join(workspaceRoot, id),
	};
}
