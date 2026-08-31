import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { createPinnedReferenceRepositoryCatalog } from "./reference-repository-catalog.ts";

function run(workspace: ReturnType<typeof createReferenceWorkspace>): void {
	mkdirSync(workspace.root, { recursive: true });
	for (const reference of createPinnedReferenceRepositoryCatalog()) {
		const target = workspace.path(reference.id);
		if (!existsSync(target)) {
			execFileSync("git", ["clone", "--filter=blob:none", reference.repository, target], {
				stdio: "inherit",
			});
		}
		const actual = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		if (actual !== reference.commit) {
			execFileSync("git", ["-C", target, "fetch", "--depth=1", "origin", reference.commit], {
				stdio: "inherit",
			});
			execFileSync("git", ["-C", target, "checkout", "--detach", reference.commit], {
				stdio: "inherit",
			});
		}
		const verified = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		if (verified !== reference.commit)
			throw new Error(
				`${reference.id} is not pinned: expected ${reference.commit}, got ${verified}`,
			);
		console.log(`${reference.id}: ${verified}`);
	}
}

if (import.meta.main) run(createReferenceWorkspace());
