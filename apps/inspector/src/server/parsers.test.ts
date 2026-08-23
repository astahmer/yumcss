import { describe, expect, test } from "vitest";
import {
	flattenTokenGroups,
	parseBridgeStats,
	parseThemeVars,
	parseUtilityUnions,
} from "./parsers.ts";

describe("parseThemeVars", () => {
	test("extracts name/value pairs from the @theme block", () => {
		const css = "@theme {\n\t--color-a: #fff;\n\t--text-sm: 0.875rem;\n}\n.dark {\n\t--x: y;\n}";
		expect(parseThemeVars(css)).toEqual([
			{ name: "--color-a", value: "#fff" },
			{ name: "--text-sm", value: "0.875rem" },
		]);
	});
	test("no theme block -> empty", () => {
		expect(parseThemeVars(".foo {}")).toEqual([]);
	});
});

describe("parseUtilityUnions", () => {
	test("counts values, samples, and detects the escape hatch", () => {
		const dts = [
			'type TextValue = WithOpacityModifiers<"sm" | "base" | (string & {})>;',
			'type FontWeightValue = "bold" | "normal";',
		].join("\n");
		const out = parseUtilityUnions(dts);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ key: "Text", count: 2, sample: ["sm", "base"], openEnded: true });
		expect(out[1]).toEqual({
			key: "FontWeight",
			count: 2,
			sample: ["bold", "normal"],
			openEnded: false,
		});
	});
});

describe("flattenTokenGroups", () => {
	test("string values pass through, objects badge as condition-bound", () => {
		const sections = flattenTokenGroups(
			{ colors: { primary: "#00f", surface: { base: "#fff", _dark: "#000" } } },
			{ colors: "Colors" },
		);
		expect(sections[0]?.label).toBe("Colors");
		expect(sections[0]?.entries[0]).toEqual({ name: "primary", value: "#00f" });
		expect(sections[0]?.entries[1]?.value).toContain("condition-bound");
	});
});

describe("parseBridgeStats", () => {
	test("counts property groups and leaf mappings", () => {
		const src =
			'export const bridge = {\n\tbottom: {\n\t\t"0": "bottom-0",\n\t\t"1px": "bottom-1",\n\t},\n\tcolor: {\n\t\t"red": "text-red-500",\n\t},\n};';
		expect(parseBridgeStats(src)).toEqual({ properties: 2, mappings: 3 });
	});
});
