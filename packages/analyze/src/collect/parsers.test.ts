import { describe, expect, test } from "vitest";
import {
	categorizeThemeVar,
	flattenTokenGroups,
	groupThemeVars,
	parseBridgeStats,
	parseThemeScopes,
	parseThemeVars,
	parseUtilityUnions,
	resolveChain,
	splitTokenValue,
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
	test("preserves selector scopes without confusing component declarations", () => {
		const scopes = parseThemeScopes(`
			@theme { --color-base: #fff; }
			[data-theme="dark"] { --color-base: #111; --color-accent: #f0f; }
			.card { --local: red; color: var(--local); }
		`);
		expect(scopes).toMatchInlineSnapshot(`
			[
			  {
			    "name": "--color-base",
			    "scope": "[data-theme="dark"]",
			    "value": "#111",
			  },
			  {
			    "name": "--color-accent",
			    "scope": "[data-theme="dark"]",
			    "value": "#f0f",
			  },
			]
		`);
		expect(scopes).toHaveLength(2);
		expect(scopes.every((scope) => scope.scope === '[data-theme="dark"]')).toBe(true);
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

describe("categorizeThemeVar / groupThemeVars", () => {
	test("maps tailwind v4 namespaces to preview categories", () => {
		expect(categorizeThemeVar("--color-red-500")).toBe("color");
		expect(categorizeThemeVar("--text-2xl")).toBe("font-size");
		expect(categorizeThemeVar("--font-weight-bold")).toBe("font-weight");
		expect(categorizeThemeVar("--font-sans")).toBe("font-family");
		expect(categorizeThemeVar("--tracking-wide")).toBe("tracking");
		expect(categorizeThemeVar("--leading-tight")).toBe("leading");
		expect(categorizeThemeVar("--radius-lg")).toBe("radius");
		expect(categorizeThemeVar("--shadow-drop")).toBe("shadow");
		expect(categorizeThemeVar("--spacing")).toBe("spacing");
		expect(categorizeThemeVar("--mystery")).toBe("other");
	});
	test("groupThemeVars buckets and preserves order", () => {
		const grouped = groupThemeVars([
			{ name: "--color-a", value: "#fff" },
			{ name: "--text-sm", value: "0.875rem" },
			{ name: "--color-b", value: "#000" },
		]);
		expect(grouped.color.map((v) => v.name)).toEqual(["--color-a", "--color-b"]);
		expect(grouped["font-size"]).toHaveLength(1);
	});
});

describe("splitTokenValue", () => {
	test("plain values pass through", () => {
		expect(splitTokenValue("#fff")).toEqual({ conditionBound: false, json: null, raw: "#fff" });
	});
	test("condition-bound payloads parse back to JSON", () => {
		const out = splitTokenValue('{"base":"#fff","_dark":"#000"} ⛭ condition-bound');
		expect(out.conditionBound).toBe(true);
		expect(out.json).toEqual({ base: "#fff", _dark: "#000" });
	});
	test("truncated payloads keep the raw text", () => {
		const out = splitTokenValue('{"base":"#f ⛭ condition-bound');
		expect(out.conditionBound).toBe(true);
		expect(out.json).toBeNull();
	});
});

describe("resolveChain", () => {
	test("follows $refs to literals", () => {
		const lookup = new Map([
			["$green-500", "#60A3BC"],
			["$surface", "$green-500"],
		]);
		expect(resolveChain("$surface", lookup)).toEqual(["$surface", "$green-500", "#60A3BC"]);
	});
	test("unknown ref terminates without loop", () => {
		expect(resolveChain("$nope", new Map())).toEqual(["$nope"]);
		const cyc = new Map([
			["$a", "$b"],
			["$b", "$a"],
		]);
		expect(resolveChain("$a", cyc)).toEqual(["$a", "$b"]);
	});
	test("literals are single-element chains", () => {
		expect(resolveChain("#ffffff", new Map())).toEqual(["#ffffff"]);
	});
});
