/**
 * Tests for the fold-coverage reporter: classification correctness against
 * the real folding passes, file collection, aggregation and formatting.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
	analyzeSource,
	collectFiles,
	formatReport,
	loadTwConfig,
	summarize,
	type FileFoldStats,
} from "../src/analyze.ts";
import { inlineCxCalls } from "../../pandwind/src/vite/cx-inline.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");
const config = loadTwConfig(resolve(app, "src/tw.ts"));

describe("analyzeSource — per-call classification", () => {
	test("static calls fold fully", () => {
		const stats = analyzeSource(`export const a = cx("px-2", "py-4", "rounded-lg");`, "a.ts", {
			config,
		});
		expect(stats.cxCalls).toBe(1);
		expect(stats.cxFoldedFull).toBe(1);
		expect(stats.cxRuntime).toBe(0);
	});

	test("same-module constants fold", () => {
		const source = `const PAD = "px-4 py-3";\nexport const b = cx(PAD, "rounded-xl");`;
		const stats = analyzeSource(source, "b.ts", { config });
		expect([stats.cxFoldedFull, stats.cxFoldedPartial, stats.cxRuntime]).toEqual([1, 0, 0]);
	});

	test("single conditional with static branches folds partially", () => {
		const source = `export const c = cx(active ? "bg-blue-600" : "bg-gray-100", "px-4 py-2");`;
		const stats = analyzeSource(source, "c.ts", { config });
		expect([stats.cxFoldedFull, stats.cxFoldedPartial, stats.cxRuntime]).toEqual([0, 1, 0]);
	});

	test("map callback stays at runtime with a reason", () => {
		const source = `statuses.map((s) => cx(s.color, "px-3 py-1"));`;
		const stats = analyzeSource(source, "d.ts", { config });
		expect(stats.cxRuntime).toBe(1);
		expect(stats.runtimeSites[0]?.line).toBe(1);
		expect(stats.runtimeSites[0]?.reason).toContain("member expression");
	});

	test("spread argument is reported with its reason", () => {
		const source = `export const join = (...parts: string[]) => cx(...parts, "flex");`;
		const stats = analyzeSource(source, "e.ts", { config });
		expect(stats.runtimeSites[0]?.reason).toBe("spread argument");
	});
});

describe("classification agrees with the real passes", () => {
	test("eliminated totals match inlineCxCalls on a mixed module", () => {
		const source = [
			`const BRAND = "bg-indigo-600";`,
			`export const one = cx(BRAND, "text-white px-4");`,
			`export const two = cx(open ? "opacity-50" : "opacity-100", "transition");`,
			`export const three = items.map((i) => cx(i.tone, "p-2"));`,
		].join("\n");
		const stats = analyzeSource(source, "mixed.ts", { config });
		const pass = inlineCxCalls(source, "mixed.ts", config, new Set(["cx"]), {
			constants: true,
			partialFold: true,
		});
		const eliminated = stats.cxFoldedFull + stats.cxFoldedPartial;
		expect(eliminated).toBe(pass.inlined);
		expect(pass.inlined).toBe(2);
		expect(stats.cxRuntime).toBe(1);
	});
});

describe("collectFiles + summarize + formatReport", () => {
	const root = resolve(tmpdir(), `pandwind-analyze-test-${process.pid}`);
	let stats: Array<FileFoldStats>;
	let summary: ReturnType<typeof summarize>;

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("globs collect only ts/tsx sources, skipping node_modules", () => {
		mkdirSync(resolve(root, "src"), { recursive: true });
		mkdirSync(resolve(root, "node_modules/some-pkg"), { recursive: true });
		writeFileSync(resolve(root, "src/comp.tsx"), `export const a = cx("p-4");`);
		writeFileSync(resolve(root, "src/util.ts"), `export const b = cx("m-2");`);
		writeFileSync(resolve(root, "src/style.css"), `.x { color: red }`);
		writeFileSync(resolve(root, "node_modules/some-pkg/index.js"), `cx("p-1")`);

		const files = collectFiles(["src/**/*.{ts,tsx}", "**/*.js"], root);
		expect(files).toHaveLength(2);
		stats = files.map((file) => analyzeSource(readFileSync(file, "utf8"), file, { config }));
		summary = summarize(stats);
	});

	test("summary aggregates across files", () => {
		expect(summary.totalCxCalls).toBe(2);
		expect(summary.eliminatedPct).toBe(100);
	});

	test("report contains table rows, runtime reasons and totals", () => {
		const report = formatReport(summary);
		expect(report).toContain("pandwind analyze — fold coverage");
		expect(report).toContain("cx(): 100% of 2 calls eliminated at build time");
	});
});
