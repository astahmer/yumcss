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
	test("emits the versioned machine-readable document", async () => {
		seed({
			"a.ts": 'export const a = cx("px-2", "py-4");',
			"b.ts": `export const b = cx(active ? "bg-blue-600" : "bg-gray-100", "p-4");`,
			"c.ts": `export const c = cx(props.tone, "p-4");`,
		});
		const output = await runCli(["**/*.ts", "--tw", twPath, "--root", root, "--json"]);
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

	test("without --json the same invocation prints the human table", async () => {
		seed({ "a.ts": 'export const a = cx("px-2", "py-4");' });
		const human = await runCli(["**/*.ts", "--tw", twPath, "--root", root]);
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

describe("runCli --json missing-css + cssBudget fields", () => {
	test("arbitraryValues aggregates off-design-system sites like missingCss", async () => {
		seed({ "ar.ts": `export const ar = cx("px-2", "w-[13px]");` });
		const output = await runCli(["**/*.ts", "--tw", twPath, "--root", root, "--json"]);
		const doc = JSON.parse(output) as {
			missingCss: { count: number };
			arbitraryValues: { count: number; sites: Array<{ file: string; token: string }> };
		};
		// Arbitrary values compile — they are NOT missing-css sites.
		expect(doc.missingCss.count).toBe(0);
		expect(doc.arbitraryValues.count).toBe(1);
		expect(doc.arbitraryValues.sites[0]).toMatchObject({ file: "ar.ts", token: "w-[13px]" });
	});

	test("missingCss aggregates per-file sites with count + bounded sample", async () => {
		// "bogus-flag-999" is not a known utility -> missing-CSS site.
		seed({ "m.ts": `export const m = cx("px-2", "bogus-flag-999");` });
		const output = await runCli(["**/*.ts", "--tw", twPath, "--root", root, "--json"]);
		const doc = JSON.parse(output) as {
			missingCss: { count: number; sites: Array<{ file: string; token: string }> };
		};
		expect(doc.missingCss.count).toBeGreaterThanOrEqual(1);
		expect(doc.missingCss.sites.length).toBe(doc.missingCss.count);
		expect(doc.missingCss.sites[0]?.token).toContain("bogus");
	});

	test("--css embeds the byte budget in the JSON document", async () => {
		seed({ "a.ts": `export const a = tw({ bg: "blue-500" });` });
		const output = await runCli(["**/*.ts", "--tw", twPath, "--root", root, "--json", "--css"]);
		const doc = JSON.parse(output) as { cssBudget?: Record<string, number> };
		expect(doc.cssBudget).toBeDefined();
		expect(doc.cssBudget?.cssBytes).toBeGreaterThan(0);
		expect(typeof doc.cssBudget?.cssGzipBytes).toBe("number");
		expect(typeof doc.cssBudget?.rules).toBe("number");
	});
});
