/**
 * The onUnresolved fail-fast lane: folded class tokens that are NOT part of
 * the design system — arbitrary `[...]` values (compile fine but bypass the
 * token vocabulary) and no-CSS tokens (render unstyled). Collected by
 * inlineTwCalls / inlineCxCalls when enabled, reported by the plugin core.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { extractTwConfig, inlineTwCalls } from "../src/vite/inline.ts";
import { inlineCxCalls } from "../src/vite/cx-inline.ts";
import { collectUnresolvedTokens, tokenHasCss } from "../src/vite/unresolved.ts";

const twSource = readFileSync(
	resolve(import.meta.dirname, "../../../examples/example/src/tw.ts"),
	"utf8",
) as string;
const config = extractTwConfig(twSource)!;

describe("tokenHasCss", () => {
	test("known utilities have CSS", () => {
		expect(tokenHasCss("bg-sky-600", config)).toBe(true);
		expect(tokenHasCss("p-6", config)).toBe(true);
	});

	test("unknown utilities do not", () => {
		expect(tokenHasCss("wibble-foo", config)).toBe(false);
		expect(tokenHasCss("wibble-foo", config)).toBe(false);
	});

	test("variant prefixes must be known", () => {
		expect(tokenHasCss("sm:bg-sky-600", config)).toBe(true);
		expect(tokenHasCss("nosuchvariant:bg-sky-600", config)).toBe(false);
	});
});

describe("collectUnresolvedTokens", () => {
	test("flags arbitrary values as off-system even though they compile", () => {
		const found = collectUnresolvedTokens("px-4 w-[13px]", 3, config);
		expect(found).toEqual([{ token: "w-[13px]", line: 3, reason: "arbitrary" }]);
	});

	test("flags tokens Tailwind will not compile", () => {
		const found = collectUnresolvedTokens("wibble-foo p-6", 1, config);
		expect(found).toEqual([{ token: "wibble-foo", line: 1, reason: "no-css" }]);
	});

	test("clean class strings yield nothing", () => {
		expect(collectUnresolvedTokens("flex flex-col sm:bg-sky-600", 1, config)).toEqual([]);
	});
});

describe("inlineTwCalls onUnresolved collection", () => {
	test("collects unresolved tokens from inlined calls with line numbers", () => {
		const input = 'tw({ wobble: "foo" });\ntw({ w: "[13px]" });';
		const { unresolved } = inlineTwCalls(input, "app.ts", config, new Set(["tw"]), undefined, {
			onUnresolved: "error",
		});
		expect(unresolved).toEqual([
			{ token: "wobble-foo", line: 1, reason: "no-css" },
			{ token: "w-[13px]", line: 2, reason: "arbitrary" },
		]);
	});

	test("does not collect when off (default)", () => {
		const { unresolved } = inlineTwCalls(
			'tw({ wobble: "foo" })',
			"app.ts",
			config,
			new Set(["tw"]),
		);
		expect(unresolved).toEqual([]);
	});
});

describe("inlineCxCalls onUnresolved collection", () => {
	test("collects unresolved tokens from fully-folded cx strings", () => {
		const input = 'const a = cx("px-4", "w-[13px]", "wibble-foo");';
		const { code, inlined, unresolved } = inlineCxCalls(input, "app.ts", config, new Set(["cx"]), {
			onUnresolved: "warn",
		});
		expect(inlined).toBe(1);
		expect(code).toContain('"px-4 w-[13px] wibble-foo"');
		expect(unresolved).toEqual([
			{ token: "w-[13px]", line: 1, reason: "arbitrary" },
			{ token: "wibble-foo", line: 1, reason: "no-css" },
		]);
	});
});
