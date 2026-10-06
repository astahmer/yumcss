/** Pure analytics tests — no I/O (plans/023 #6). */
import { describe, expect, test } from "vitest";
import {
	analyzeStyleUsage,
	buildPruneChangeset,
	computeContrastWarnings,
	evaluateContrastPair,
} from "./analytics.ts";

const files = [
	{
		file: "a.tsx",
		content: `
const a = tw({ bgColor: "$blue-500", rounded: "xl", hover: { bgColor: "$blue-600" } });
const b = tw({ sm: { flexDirection: "row" }, display: "flex", gap: "2", dark: { textColor: "$gray-300" } });
const c = css.class({ backgroundColor: "$surface", padding: "4px" });
`,
	},
];

describe("analyzeStyleUsage", () => {
	const report = analyzeStyleUsage(files);

	test("counts sites scanned", () => {
		expect(report.sitesScanned).toBe(3);
	});

	test("token usage counts $tokens across nesting + conditions", () => {
		const get = (n: string) => report.tokenUsage.find((t) => t.name === n)?.count ?? 0;
		expect(get("$blue-500")).toBe(1);
		expect(get("$blue-600")).toBe(1);
		expect(get("$gray-300")).toBe(1);
		expect(get("$surface")).toBe(1);
	});

	test("unused tokens reported when the universe is provided", () => {
		const withUniverse = analyzeStyleUsage(files, ["blue-500", "blue-600", "red-900"]);
		expect(withUniverse.unusedTokens).toEqual(["$red-900"]);
	});

	test("normalizes authored shorthand against grouped token ids", () => {
		const grouped = analyzeStyleUsage(
			[
				{
					file: "grouped.tsx",
					content: `css.class({ color: "$blue-600", padding: "$4" })`,
				},
			],
			["colors/$blue-600", "spacing/$4", "colors/$red-900"],
		);
		expect(grouped.tokenUsage).toEqual([
			{ name: "colors/blue-600", count: 1 },
			{ name: "spacing/4", count: 1 },
		]);
		expect(grouped.unusedTokens).toEqual(["colors/red-900"]);
	});

	test("top properties ranked by frequency", () => {
		const names = report.topProperties.map((p) => p.name);
		expect(names).toContain("bgColor");
		expect(names).toContain("backgroundColor");
		expect(report.topProperties[0]!.count).toBeGreaterThanOrEqual(
			report.topProperties[report.topProperties.length - 1]!.count,
		);
	});

	test("property+value combos captured", () => {
		expect(report.topPropertyValues.some((c) => c.combo.includes('rounded: "xl"'))).toBe(true);
	});

	test("reports token versus literal coverage per file", () => {
		expect(report.valueCoverage).toMatchObject({
			tokenValues: 4,
			literalValues: 5,
			dynamicValues: 0,
			tokenPct: 44,
			literalPct: 56,
		});
		expect(report.fileValueCoverage).toEqual([
			{
				file: "a.tsx",
				tokenValues: 4,
				literalValues: 5,
				dynamicValues: 0,
				tokenPct: 44,
				literalPct: 56,
			},
		]);
	});

	test("excludes dynamic expressions from the percentage denominator", () => {
		const dynamic = analyzeStyleUsage([
			{
				file: "dynamic.tsx",
				content: `css.class({ color: value, padding: getPadding(), gap: "2" })`,
			},
		]);
		expect(dynamic.fileValueCoverage[0]).toEqual({
			file: "dynamic.tsx",
			tokenValues: 0,
			literalValues: 1,
			dynamicValues: 2,
			tokenPct: 0,
			literalPct: 100,
		});
	});

	test("conditions classified responsive/pseudo/media", () => {
		const kinds = Object.fromEntries(report.conditions.map((c) => [c.name, c.kind]));
		expect(kinds.hover).toBe("pseudo");
		expect(kinds.sm).toBe("responsive");
		expect(kinds.dark).toBe("media");
		expect(report.conditionBreakdown.pseudo).toBeGreaterThanOrEqual(1);
		expect(report.conditionBreakdown.responsive).toBeGreaterThanOrEqual(1);
	});
});

describe("contrast warnings", () => {
	const tokens = { "gray-100": "#f3f4f6", "gray-800": "#1f2937", "blue-500": "#3182ce" };

	test("pairs text/background within one call site and flags low ratio", () => {
		const fixtureFiles = [
			{
				file: "a.tsx",
				content: `const card = css.class({ backgroundColor: "$gray-100", color: "$blue-500" });`,
			},
		];
		const w = computeContrastWarnings(fixtureFiles, tokens);
		expect(w.length).toBe(1);
		expect(w[0]!.fg).toBe("$blue-500");
		expect(w[0]!.bg).toBe("$gray-100");
		// #3182ce on #f3f4f6 ~ 3.7 - fails normal text, passes large
		expect(w[0]!.ratio).toBeGreaterThan(3);
		expect(w[0]!.ratio).toBeLessThan(4.5);
		expect(w[0]!.severity).toBe("fail-normal");
	});

	test("passing pairs produce no warnings", () => {
		const fixtureFiles = [
			{
				file: "a2.tsx",
				content: `css.class({ backgroundColor: "$gray-100", color: "$gray-800" });`,
			},
		];
		expect(computeContrastWarnings(fixtureFiles, tokens)).toEqual([]);
	});

	test("flags low contrast with severity by threshold", () => {
		const fixtureFiles = [
			{
				file: "b.tsx",
				content: `css.class({ backgroundColor: "$gray-100", color: "$gray-100" });`,
			},
		];
		const w = computeContrastWarnings(fixtureFiles, tokens);
		expect(w[0]!.ratio).toBe(1);
		expect(w[0]!.severity).toBe("fail-large");
	});

	test("unresolvable values are skipped", () => {
		const fixtureFiles = [
			{ file: "c.tsx", content: `css.class({ backgroundColor: someVar, color: "currentColor" })` },
		];
		expect(computeContrastWarnings(fixtureFiles, tokens)).toEqual([]);
	});

	test("evaluates a selected color pair without scanning every combination", () => {
		expect(evaluateContrastPair("$gray-800", "$gray-100", tokens)).toEqual({
			ratio: expect.any(Number),
			status: "pass",
		});
	});
});

describe("prune changeset", () => {
	test("generates changeset markdown listing unused tokens", () => {
		const content = buildPruneChangeset(["$unused-a", "$unused-b"], "docs-app");
		expect(content).toContain('---\n"yumcss": patch\n---');
		expect(content).toContain("Remove 2 unused design token(s)");
		expect(content).toContain("- `$unused-a`");
	});

	test("returns null when nothing to prune", () => {
		expect(buildPruneChangeset([])).toBeNull();
	});
});
