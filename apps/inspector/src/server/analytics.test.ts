/** Pure analytics tests — no I/O (plans/023 #6). */
import { describe, expect, test } from "vitest";
import { analyzeStyleUsage } from "./analytics.ts";

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

	test("conditions classified responsive/pseudo/media", () => {
		const kinds = Object.fromEntries(report.conditions.map((c) => [c.name, c.kind]));
		expect(kinds.hover).toBe("pseudo");
		expect(kinds.sm).toBe("responsive");
		expect(kinds.dark).toBe("media");
		expect(report.conditionBreakdown.pseudo).toBeGreaterThanOrEqual(1);
		expect(report.conditionBreakdown.responsive).toBeGreaterThanOrEqual(1);
	});
});
