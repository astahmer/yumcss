/**
 * Off-design-system lane: statically-known class tokens using Tailwind
 * arbitrary-value bracket syntax compile fine — they are flagged as a
 * DISTINCT diagnostic kind from missing-css, because the problem is not
 * compilability but bypassing the token vocabulary.
 */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeSource, formatReport, loadTwConfig, summarize } from "../src/analyze.ts";
import { collectAnnotations } from "../src/github-annotations.ts";

const app = resolve(import.meta.dirname, "../../../examples/example");
const config = loadTwConfig(resolve(app, "src/tw.ts"));

describe("off-design-system arbitrary values", () => {
	test("token-only utilities are not flagged", () => {
		const stats = analyzeSource(`export const a = cx("px-2 py-4 rounded-lg");`, "ok.ts", {
			config,
		});
		expect(stats.arbitraryValues).toEqual([]);
	});

	test("arbitrary length value is flagged with its line", () => {
		const stats = analyzeSource(`cx("flex", "w-[13px]")`, "a.ts", { config });
		expect(stats.missingCss).toEqual([]); // it compiles — NOT a missing-css site
		expect(stats.arbitraryValues).toHaveLength(1);
		expect(stats.arbitraryValues[0]).toMatchObject({ token: "w-[13px]", line: 1 });
	});

	test("arbitrary color and bare property forms are flagged", () => {
		const stats = analyzeSource(`cx("bg-[#0f0]", "[margin-top:7px]")`, "b.ts", { config });
		expect(stats.arbitraryValues.map((s) => s.token)).toEqual(["bg-[#0f0]", "[margin-top:7px]"]);
	});

	test("variant-prefixed arbitrary value is flagged", () => {
		const stats = analyzeSource(`cx("hover:[margin-top:7px] md:w-[3px]")`, "c.ts", { config });
		expect(stats.arbitraryValues.map((s) => s.token)).toEqual([
			"hover:[margin-top:7px]",
			"md:w-[3px]",
		]);
	});

	test("partial folds check their static arguments only", () => {
		const source = `export const c = cx(active ? "bg-blue-600" : "bg-gray-100", "w-[13px]");`;
		const stats = analyzeSource(source, "p.ts", { config });
		expect(stats.cxFoldedPartial).toBe(1);
		expect(stats.arbitraryValues.map((s) => s.token)).toEqual(["w-[13px]"]);
	});

	test("runtime calls are never flagged (values unknowable)", () => {
		const stats = analyzeSource(`statuses.map((s) => cx(s.color, "w-[13px]"));`, "r.ts", {
			config,
		});
		expect(stats.cxRuntime).toBe(1);
		expect(stats.arbitraryValues).toEqual([]);
	});

	test("ignore list suppresses deliberate arbitrary classes", () => {
		const opts = { config, missingCssIgnore: new Set(["w-[13px]"]) };
		const stats = analyzeSource(`cx("w-[13px]", "flex")`, "i.ts", opts);
		expect(stats.arbitraryValues).toEqual([]);
	});

	test("summarize aggregates the total", () => {
		const summary = summarize([
			analyzeSource(`cx("w-[13px]")`, "a.ts", { config }),
			analyzeSource(`cx("bg-[#0f0]", "flex")`, "b.ts", { config }),
		]);
		expect(summary.totalArbitraryValues).toBe(2);
	});

	test("human report renders the off-design-system lane", () => {
		const summary = summarize([analyzeSource(`cx("w-[13px]", "bgnone")`, "h.ts", { config })]);
		const report = formatReport(summary);
		expect(report).toContain(
			'off-design-system: "w-[13px]" uses an arbitrary value outside the design system',
		);
		expect(report).toContain("missing-css: no Tailwind candidate for");
		expect(report).toContain("off-design-system: 1 arbitrary-value token(s)");
	});

	test("github annotations carry the off-design-system title after missing-css", () => {
		const summary = summarize([analyzeSource(`cx("w-[13px]", "bgnone")`, "g.ts", { config })]);
		const annotations = collectAnnotations(summary, undefined);
		expect(annotations).toEqual([
			{
				file: "g.ts",
				line: 1,
				title: "missing-css",
				message: expect.stringContaining("bgnone"),
			},
			{
				file: "g.ts",
				line: 1,
				title: "off-design-system",
				message: '"w-[13px]" uses an arbitrary value outside the design system',
			},
		]);
	});
});
