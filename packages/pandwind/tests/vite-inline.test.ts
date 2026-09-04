import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { extractTwConfig, inlineTwCalls } from "../src/vite/inline.ts";

const twSource = readFileSync(
	resolve(import.meta.dirname, "../../../apps/example/src/tw.ts"),
	"utf8",
);
const config = extractTwConfig(twSource);

describe("extractTwConfig", () => {
	test("extracts variants, conflicts and compose from the generated tw.ts", () => {
		expect(config).toBeDefined();
		expect(Object.keys(config!.variants).length).toBeGreaterThan(0);
		expect(config!.variants.group?.join).toBe("-");
		expect(config!.conflicts?.p?.["*"]?.length).toBeGreaterThan(0);
		expect(config!.conflicts?.text?.["gray-900"]).toEqual(["color"]);
		expect(config!.compose).toContain("translate-x");
	});
});

describe("inlineTwCalls", () => {
	test("replaces literal tw() calls with compiled class strings", () => {
		const input =
			'const a = tw({ bg: "sky-600", p: "6" });\nconst b = tw({ sm: { flex: "col" } });';
		const { code, inlined } = inlineTwCalls(input, "app.tsx", config!, new Set(["tw"]));
		expect(inlined).toBe(2);
		expect(code).toContain('"bg-sky-600 p-6"');
		expect(code).toContain('"sm:flex sm:flex-col"');
	});

	test("conflict merging happens at compile time", () => {
		const { code } = inlineTwCalls('tw({ px: "4", p: "6" })', "app.ts", config!, new Set(["tw"]));
		expect(code).toBe('"p-6"');
	});

	test("inline output matches the runtime for the same input", () => {
		const input = 'tw({ ring: ["1", "gray-900/5"], text: ["2xl", "gray-900"] })';
		const { code } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(JSON.parse(code)).toBe("ring-1 ring-gray-900/5 text-2xl text-gray-900");
	});

	test("leaves dynamic calls for the runtime", () => {
		const input = "tw({ bg: color })";
		const { code, inlined } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(inlined).toBe(0);
		expect(code).toBe(input);
	});

	test("inlines aliased imports and ignores other identifiers", () => {
		const { code, inlined } = inlineTwCalls(
			'wind({ rounded: "xl" })',
			"app.ts",
			config!,
			new Set(["wind"]),
		);
		expect(inlined).toBe(1);
		expect(code).toBe('"rounded-xl"');
	});

	test("leaves invalid style objects alone", () => {
		const input = 'tw({ group: { bg: "red-500" } })';
		const { code, inlined } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(inlined).toBe(0);
		expect(code).toBe(input);
	});

	test("bounded dynamic tw() calls keep the source and emit every candidate", () => {
		const input = 'const a = tw({ bg: active ? "sky-600" : "gray-900" });';
		const { code, inlined, candidates } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(inlined).toBe(0);
		expect(code).toBe(input);
		expect(candidates).toEqual(["bg-sky-600", "bg-gray-900"]);
	});

	test("unbounded dynamic tw() calls emit no candidates", () => {
		const input = "const a = tw({ bg: someColor });";
		const { code, candidates } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(code).toBe(input);
		expect(candidates).toBeUndefined();
	});

	test("candidate validation flags unknown utilities through onUnresolved", () => {
		const input = 'const a = tw({ wibble: active ? "foo" : "bar" });';
		const { candidates, unresolved } = inlineTwCalls(
			input,
			"app.ts",
			config!,
			new Set(["tw"]),
			undefined,
			{ onUnresolved: "warn" },
		);
		expect(candidates).toEqual(["wibble-foo", "wibble-bar"]);
		expect(unresolved?.map((entry) => entry.reason)).toEqual(["no-css", "no-css"]);
	});
});
