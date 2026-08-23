/**
 * `--json` output contract: machine consumers (the PR report bot) depend on
 * this shape. Asserts the schema tag, per-file records and aggregate totals,
 * plus the human/JSON switch in runCli.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { ANALYZE_JSON_SCHEMA, collectFiles, runCli } from "../src/cli.ts";

const root = resolve(import.meta.dirname, "tmp-json");
const twPath = resolve(import.meta.dirname, "../../../apps/example/src/tw.ts");

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

function seed(files: Record<string, string>) {
	mkdirSync(root, { recursive: true });
	for (const [name, source] of Object.entries(files)) {
		const path = resolve(root, name);
		mkdirSync(resolve(path, ".."), { recursive: true });
		writeFileSync(path, source);
	}
}

describe("runCli --json", () => {
	test("emits the versioned machine-readable document", () => {
		seed({
			"a.ts": 'export const a = cx("px-2", "py-4");',
			"b.ts": `export const b = cx(active ? "bg-blue-600" : "bg-gray-100", "p-4");`,
			"c.ts": `export const c = cx(props.tone, "p-4");`,
		});
		const output = runCli(["**/*.ts", "--tw", twPath, "--root", root, "--json"]);
		const doc = JSON.parse(output) as Record<string, unknown>;

		expect(doc["schema"]).toBe(ANALYZE_JSON_SCHEMA);
		expect(doc["schema"]).toBe("pandwind.analyze/1");

		const files = doc["files"] as Array<Record<string, unknown>>;
		expect(files).toHaveLength(3);
		for (const f of files) {
			for (const key of [
				"file",
				"eliminatedPct",
				"cxCalls",
				"cxFoldedFull",
				"cxFoldedPartial",
				"cxRuntime",
				"runtimeSites",
				"twCalls",
				"twFolded",
			]) {
				expect(f).toHaveProperty(key);
			}
			expect(Array.isArray(f["runtimeSites"])).toBe(true);
		}

		expect(doc["totalCxCalls"]).toBe(3);
		expect(doc["fullFolded"]).toBe(1);
		expect(doc["partialFolded"]).toBe(1);
		expect(doc["runtimeCalls"]).toBe(1);
		expect(doc["eliminatedPct"]).toBe(67); // round(2/3 * 100)
	});

	test("without --json the same invocation prints the human table", () => {
		seed({ "a.ts": 'export const a = cx("px-2", "py-4");' });
		const human = runCli(["**/*.ts", "--tw", twPath, "--root", root]);
		expect(human).toContain("pandwind analyze — fold coverage");
		expect(human).not.toContain('"schema"');
	});
});

describe("collectFiles", () => {
	test("skips node_modules and non-TS entries deterministically", () => {
		seed({
			"keep.ts": "",
			"nested/deep.ts": "",
			"node_modules/pkg/x.ts": "",
			"readme.md": "",
		});
		const files = collectFiles(["**/*"], root);
		expect(files.some((f) => f.includes("node_modules"))).toBe(false);
		expect(files.some((f) => f.endsWith(".md"))).toBe(false);
		expect(files).toEqual([...files].toSorted());
	});
});
