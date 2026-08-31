import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { createPinnedReferenceRepositoryCatalog } from "./reference-repository-catalog.ts";

const cloneRoot = createReferenceWorkspace().root;
const references = createPinnedReferenceRepositoryCatalog();

const entries = references.map((reference) => {
	let actual: string | undefined;
	let error: string | undefined;
	try {
		actual = execFileSync("git", ["-C", join(cloneRoot, reference.id), "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
	} catch (caught) {
		error = caught instanceof Error ? caught.message : "unable to inspect checkout";
	}
	return {
		clone: reference.id,
		expected: reference.commit,
		actual,
		matched: actual === reference.commit,
		...(error === undefined ? {} : { error }),
	};
});

const mismatched = entries.filter((entry) => !entry.matched);
console.log(
	JSON.stringify(
		{
			schema: "pandwind.reference-pin-audit/1",
			cloneRoot,
			checked: entries.length,
			matched: entries.length - mismatched.length,
			mismatched: mismatched.length,
			entries,
		},
		null,
		2,
	),
);
if (mismatched.length > 0) process.exitCode = 1;
