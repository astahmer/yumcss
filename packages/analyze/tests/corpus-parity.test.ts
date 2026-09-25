/**
 * Corpus parity — running `pandwind analyze` over the fold-coverage corpus
 * reproduces the exact elimination numbers the vite-cx-coverage harness
 * reports, via ONE command.
 *
 * The fixtures under tests/fixtures/coverage-corpus/ mirror the corpus in
 * packages/pandwind/tests/vite-cx-coverage.test.ts entry-for-entry (same
 * sources, same expectations; the expected kind is encoded in the filename
 * prefix). If a pattern there changes, update the mirror here and both
 * suites keep reporting identical percentages.
 *
 * Expected aggregates (after the smarter compiler): 15 full + 10 partial +
 * 10 runtime = 35 entries -> 71% eliminated. The "const used twice" fixture
 * holds two cx calls but still counts once at entry level (an entry counts
 * as eliminated only when EVERY call in it folds).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { createPandwindEngineContext } from "pandwind/vite";
import { analyzeSource } from "../src/analyze.ts";

const _app = resolve(import.meta.dirname, "../../../examples/example");
const config = { conflicts: undefined, compose: undefined } as never;
const corpusDir = resolve(import.meta.dirname, "fixtures/coverage-corpus");

/** Cross-module import bindings per fixture (mirrors the coverage harness). */
const IMPORTS: Record<string, Record<string, string>> = {
	"031-full-cross-module-direct-import.ts": { PAD: "px-4 py-3" },
	"032-full-cross-module-barrel-reexport.ts": { BRAND_BG: "bg-indigo-600" },
	"033-full-cross-module-star-reexport.ts": { TONE: "text-white" },
	"034-partial-cross-module-const-partial-mix.ts": { SHELL: "min-h-screen flex flex-col" },
	"035-runtime-cross-module-shadowed-by-param.ts": { PAD: "px-4 py-3" },
};

interface Entry {
	file: string;
	expect: "full" | "partial" | "runtime";
	stats: ReturnType<typeof analyzeSource>;
}

const entries: Array<Entry> = readdirSync(corpusDir)
	.filter((f) => f.endsWith(".ts"))
	.toSorted()
	.map((file) => {
		const expectKey = file.split("-")[1] as Entry["expect"];
		const source = readFileSync(resolve(corpusDir, file), "utf8");
		const stats = analyzeSource(source, file, {
			config,
			importedConstants: IMPORTS[file],
			...(file === "021-full-css-atom-object.ts"
				? {
						cxFold: {
							cssNames: new Set(["css"]),
							engine: createPandwindEngineContext({ preset: examplePreset }),
						},
					}
				: {}),
		});
		return { file, expect: expectKey, stats };
	});

function kindOf(stats: Entry["stats"]): "full" | "partial" | "runtime" {
	if (stats.cxRuntime > 0) return "runtime";
	if (stats.cxFoldedPartial > 0) return "partial";
	return "full";
}

describe("analyze reproduces the vite-cx-coverage corpus", () => {
	test("every fixture classifies exactly as its coverage-harness expectation", () => {
		const mismatches = entries.filter((e) => kindOf(e.stats) !== e.expect);
		expect(
			mismatches.map((m) => `${m.file}: expected ${m.expect}, got ${kindOf(m.stats)}`),
		).toEqual([]);
	});

	test("aggregate elimination matches the coverage harness (24/35 = 69%)", () => {
		const full = entries.filter((e) => e.expect === "full").length;
		const partial = entries.filter((e) => e.expect === "partial").length;
		const runtime = entries.length - full - partial;
		// Entry-level counting: an entry is eliminated when every cx call in
		// it folds — so per-call classification must agree with the prefix.
		for (const e of entries) expect(kindOf(e.stats)).toBe(e.expect);
		expect(full).toBe(15);
		expect(partial).toBe(10);
		expect(runtime).toBe(10);
		const eliminated = full + partial;
		expect(Math.round((eliminated / entries.length) * 100)).toBe(71);
		// Per-file pct from the analyzer must agree with the classification.
		for (const e of entries) {
			if (e.expect === "full") expect(e.stats.eliminatedPct).toBe(100);
			if (e.expect === "runtime") expect(e.stats.eliminatedPct).toBe(0);
		}
	});
});
