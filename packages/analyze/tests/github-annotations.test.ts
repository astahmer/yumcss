/** GitHub workflow-command emitter — missing-css sites become inline PR warnings. */
import { describe, expect, test } from "vitest";
import { collectAnnotations, formatAnnotations } from "../src/github-annotations.ts";
import { analyzeSource, summarize } from "../src/analyze.ts";
import { resolve } from "node:path";
import { loadTwConfig } from "../src/analyze.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");
const config = loadTwConfig(resolve(app, "src/tw.ts"));

describe("github-annotations", () => {
	test("collects missing-css sites with file + line", () => {
		const summary = summarize([
			analyzeSource(`export const a = cx("flex", "bgnone");\nexport const b = 1;`, "a.ts", {
				config,
			}),
		]);
		const annotations = collectAnnotations(summary, undefined);
		expect(annotations).toEqual([
			{ file: "a.ts", line: 1, title: "missing-css", message: expect.stringContaining("bgnone") },
		]);
	});

	test("formats valid GitHub workflow commands (escapes special chars)", () => {
		const out = formatAnnotations(
			[{ file: "a,b.ts", line: 3, title: "missing-css", message: 'no candidate for "x:y"' }],
			false,
		);
		expect(out).toBe('::warning file=a%2Cb.ts,line=3,title=missing-css::no candidate for "x:y"');
	});

	test("truncation note appended when flagged", () => {
		const out = formatAnnotations([], true);
		expect(out).toContain("cap (50) reached");
	});

	test("empty summary yields no output", () => {
		const summary = summarize([analyzeSource(`cx("flex")`, "ok.ts", { config })]);
		expect(collectAnnotations(summary, undefined)).toEqual([]);
	});
});
