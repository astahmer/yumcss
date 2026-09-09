import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { extractTwConfig, inlineTwCalls } from "../src/vite/inline.ts";
import { createTw } from "../src/tw/runtime.ts";

const twSource = readFileSync(
	resolve(import.meta.dirname, "../../../examples/example/src/tw.ts"),
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
		expect(config!.wildcardValues?.bg).toContain("blue-500");
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

	test("unresolvable candidates are not registered and surface through onUnresolved", () => {
		const input = 'const a = tw({ wibble: active ? "foo" : "bar" });';
		const { candidates, unresolved } = inlineTwCalls(
			input,
			"app.ts",
			config!,
			new Set(["tw"]),
			undefined,
			{ onUnresolved: "warn" },
		);
		// Exact-match only: a token the conflict map cannot compile must not
		// be registered for scanning — no invented classes.
		expect(candidates).toEqual([]);
		expect(unresolved?.map((entry) => entry.reason)).toEqual(["no-css", "no-css"]);
	});

	test("mixed finite sets register only verified candidates", () => {
		const input = 'const a = tw({ bg: active ? "sky-600" : "not-a-token" });';
		const { code, inlined, candidates, unresolved } = inlineTwCalls(
			input,
			"app.ts",
			config!,
			new Set(["tw"]),
			undefined,
			{ onUnresolved: "warn" },
		);
		expect(inlined).toBe(0);
		expect(code).toBe(input);
		expect(candidates).toEqual(["bg-sky-600"]);
		expect(unresolved?.map((entry) => entry.token)).toEqual(["bg-not-a-token"]);
	});

	test("verification still registers every candidate when the map is absent", () => {
		// No conflict map => the lane is disabled; everything compiles.
		const input = 'const a = tw({ bg: active ? "sky-600" : "gray-900" });';
		const { candidates } = inlineTwCalls(input, "app.ts", { variants: {} }, new Set(["tw"]));
		expect(candidates).toEqual(["bg-sky-600", "bg-gray-900"]);
	});

	test("exact raw-value matches remap to the configured token spelling", () => {
		// #3182ce is the example preset's resolved --color-blue-500; the
		// generated catalog proves the exact match, so the emitted class is
		// the token spelling, not an arbitrary value.
		const input = 'tw({ bg: "#3182ce" })';
		const { code, inlined } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(inlined).toBe(1);
		expect(JSON.parse(code)).toBe("bg-blue-500");
	});

	test("dynamic raw values register token-spelled candidates", () => {
		const input = 'const a = tw({ bg: active ? "#3182ce" : "#111827" });';
		const { code, inlined, candidates, unresolved } = inlineTwCalls(
			input,
			"app.ts",
			config!,
			new Set(["tw"]),
		);
		expect(inlined).toBe(0);
		expect(code).toBe(input);
		expect(candidates).toEqual(["bg-blue-500", "bg-gray-900"]);
		expect(unresolved).toBeUndefined();
	});

	test("unknown raw values keep the source and surface no-css", () => {
		const input = 'const a = tw({ bg: active ? "#00ff00" : "#111827" });';
		const { code, candidates, unresolved } = inlineTwCalls(
			input,
			"app.ts",
			config!,
			new Set(["tw"]),
			undefined,
			{ onUnresolved: "warn" },
		);
		expect(code).toBe(input);
		expect(candidates).toEqual(["bg-gray-900"]);
		expect(unresolved?.map((entry) => entry.token)).toEqual(["bg-#00ff00"]);
	});

	test("opacity-modified raw values are not remapped", () => {
		// The catalog proves whole declarations only; a /50 modifier is a
		// different declaration the design system may not define, so the
		// value stays raw and unregistered (safe failure, no invention).
		const input = 'const a = tw({ bg: active ? "#3182ce/50" : "#111827" });';
		const { candidates } = inlineTwCalls(input, "app.ts", config!, new Set(["tw"]));
		expect(candidates).toEqual(["bg-gray-900"]);
	});

	test("missing catalog keeps raw-value candidates", () => {
		// Without valueTokens the dynamic lane cannot remap; raw arbitrary
		// candidates compile and register as before T6.
		const input = 'const a = tw({ bg: active ? "#3182ce" : "#111827" });';
		const { candidates } = inlineTwCalls(input, "app.ts", { variants: {} }, new Set(["tw"]));
		expect(candidates).toEqual(["bg-#3182ce", "bg-#111827"]);
	});

	test("runtime and inliner stay byte-identical through the remap", () => {
		const styles = { bg: "#3182ce" };
		const { code } = inlineTwCalls(
			`tw(${JSON.stringify(styles)})`,
			"app.ts",
			config!,
			new Set(["tw"]),
		);
		const tw = createTw({
			variants: config!.variants,
			conflicts: config!.conflicts,
			compose: config!.compose,
			valueTokens: config!.valueTokens,
		});
		expect(JSON.parse(code)).toBe(tw(styles));
	});
});
