import { execFileSync } from "node:child_process";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { createPinnedReferenceRepositoryCatalog } from "./reference-repository-catalog.ts";
import { createEffectToolingFileSystem, createEffectToolingTaskRunner } from "./effect-tooling.ts";

async function run(workspace: ReturnType<typeof createReferenceWorkspace>): Promise<void> {
	const fileSystem = createEffectToolingFileSystem();
	const taskRunner = createEffectToolingTaskRunner();
	await fileSystem.ensureDirectory(workspace.root);
	const results = await taskRunner.run(
		createPinnedReferenceRepositoryCatalog().map((reference) => ({
			id: reference.id,
			run: async () => {
				const target = await fileSystem.resolve(workspace.root, reference.id);
				if (!(await fileSystem.exists(target))) {
					execFileSync("git", ["clone", "--filter=blob:none", reference.repository, target], {
						stdio: "ignore",
					});
				}
				const actual = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], {
					encoding: "utf8",
				}).trim();
				if (actual !== reference.commit) {
					execFileSync("git", ["-C", target, "fetch", "--depth=1", "origin", reference.commit], {
						stdio: "ignore",
					});
					execFileSync("git", ["-C", target, "checkout", "--detach", reference.commit], {
						stdio: "ignore",
					});
				}
				const verified = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], {
					encoding: "utf8",
				}).trim();
				if (verified !== reference.commit)
					throw new Error(
						`${reference.id} is not pinned: expected ${reference.commit}, got ${verified}`,
					);
				return `${reference.id}: ${verified}`;
			},
		})),
		{ concurrency: 2 },
	);
	for (const result of results) console.log(result);
}

if (import.meta.main) {
	run(createReferenceWorkspace()).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
