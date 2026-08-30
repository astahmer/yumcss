import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createRealRepositoryCorpus } from "../packages/codemod/src/swap/index.ts";

const cloneRoot = "/Users/astahmer/.references";
const references = createRealRepositoryCorpus().references;
const seen = new Set<string>();

const entries = references.flatMap((reference) => {
	const key = `${reference.clone}:${reference.commit}`;
	if (seen.has(key)) return [];
	seen.add(key);
	let actual: string | undefined;
	let error: string | undefined;
	try {
		actual = execFileSync("git", ["-C", join(cloneRoot, reference.clone), "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
	} catch (caught) {
		error = caught instanceof Error ? caught.message : "unable to inspect checkout";
	}
	return [
		{
			clone: reference.clone,
			expected: reference.commit,
			actual,
			matched: actual === reference.commit,
			...(error === undefined ? {} : { error }),
		},
	];
});

console.log(
	JSON.stringify(
		{
			schema: "pandwind.reference-pin-audit/1",
			cloneRoot,
			checked: entries.length,
			matched: entries.filter((entry) => entry.matched).length,
			mismatched: entries.filter((entry) => !entry.matched).length,
			entries,
		},
		null,
		2,
	),
);
