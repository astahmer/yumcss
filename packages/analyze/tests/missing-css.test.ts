/**
 * Missing-CSS warnings lane: statically-known class tokens from folded
 * cx() calls must resolve to real Tailwind candidates through the generated
 * conflict map — anything else renders unstyled and gets reported with its
 * line number. Inspired by panda's missing-css-warnings plugin.
 */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { analyzeSource, formatReport, loadTwConfig, summarize } from "../src/analyze.ts";

const app = resolve(import.meta.dirname, "../../../examples/example");
const config = loadTwConfig(resolve(app, "src/tw.ts"));

describe("missing-css warnings", () => {
	test("missing Tailwind config reports the requested path", () => {
		expect(() => loadTwConfig("/nonexistent/src/tw.ts")).toThrow(/tw\.ts/);
	});

	test("valid tokens are not flagged", () => {
		const stats = analyzeSource(`export const a = cx("px-2 py-4 rounded-lg");`, "ok.ts", {
			config,
		});
		expect(stats.missingCss).toEqual([]);
	});

	test("unknown utility value is flagged with its line", () => {
		const source = `export const a = (\n  cx("flex", "bgnone")\n);`;
		const stats = analyzeSource(source, "typo.ts", { config });
		expect(stats.missingCss).toHaveLength(1);
		expect(stats.missingCss[0]).toMatchObject({ token: "bgnone", line: 2 });
	});

	test("unknown variant prefix is flagged", () => {
		const stats = analyzeSource(`cx("hvr:bg-red-500")`, "v.ts", { config });
		expect(stats.missingCss).toHaveLength(1);
		expect(stats.missingCss[0]?.token).toBe("hvr:bg-red-500");
	});

	test("known variants + arbitrary values + opacity modifiers pass", () => {
		const stats = analyzeSource(
			`cx("hover:bg-red-500 md:p-[3px] bg-blue-600/50 border")`,
			"ok2.ts",
			{ config },
		);
		expect(stats.missingCss).toEqual([]);
	});

	test("partial folds check their static arguments only", () => {
		const source = `export const c = cx(active ? "bg-blue-600" : "bg-gray-100", "px4");`;
		const stats = analyzeSource(source, "p.ts", { config });
		expect(stats.cxFoldedPartial).toBe(1);
		expect(stats.missingCss.map((s) => s.token)).toEqual(["px4"]);
	});

	test("runtime calls are never flagged (values unknowable)", () => {
		const source = `statuses.map((s) => cx(s.color, "whatever-class"));`;
		const stats = analyzeSource(source, "r.ts", { config });
		expect(stats.cxRuntime).toBe(1);
		expect(stats.missingCss).toEqual([]);
	});

	test("ignore list suppresses foreign classes", () => {
		const opts = { config, missingCssIgnore: new Set(["my-custom-class"]) };
		const stats = analyzeSource(`cx("my-custom-class", "flex")`, "i.ts", opts);
		expect(stats.missingCss).toEqual([]);
	});

	test("summary aggregates the total", () => {
		const stats = [
			analyzeSource(`cx("bgnone")`, "a.ts", { config }),
			analyzeSource(`cx("flex")`, "b.ts", { config }),
		];
		expect(summarize(stats).totalMissingCss).toBe(1);
	});

	test("report renders a warnings section", () => {
		const summary = summarize([analyzeSource(`cx("bgnone")`, "a.ts", { config })]);
		const report = formatReport(summary);
		expect(report).toContain("missing-css: 1 static class token(s)");
		expect(report).toContain(`no Tailwind candidate for "bgnone"`);
	});
});
