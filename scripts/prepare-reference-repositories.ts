import { execFileSync } from "node:child_process";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import {
	createPinnedReferenceRepositoryCatalog,
	resolveReferenceCheckoutId,
} from "./reference-repository-catalog.ts";
import { createEffectToolingFileSystem, createEffectToolingTaskRunner } from "./effect-tooling.ts";

export interface PrepareReferenceRepositoriesOptions {
	readonly log?: boolean;
}

export async function prepareReferenceRepositories(
	workspace: ReturnType<typeof createReferenceWorkspace>,
	ids?: readonly string[],
	options: PrepareReferenceRepositoriesOptions = {},
): Promise<readonly string[]> {
	const fileSystem = createEffectToolingFileSystem();
	const taskRunner = createEffectToolingTaskRunner();
	await fileSystem.ensureDirectory(workspace.root);
	const requested = ids === undefined ? undefined : new Set(ids.map(resolveReferenceCheckoutId));
	const references = createPinnedReferenceRepositoryCatalog().filter(
		(reference) => requested === undefined || requested.has(reference.id),
	);
	if (references.length === 0)
		throw new Error(
			`no pinned reference repositories matched: ${ids?.join(", ") ?? "<empty catalog>"}`,
		);
	const results = await taskRunner.run(
		references.map((reference) => ({
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
				execFileSync("git", ["-C", target, "reset", "--hard", reference.commit], {
					stdio: "ignore",
				});
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
	if (options.log !== false) {
		for (const result of results) console.log(result);
	}
	return results;
}

if (import.meta.main) {
	prepareReferenceRepositories(createReferenceWorkspace()).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
