import { describe, expect, test } from "vitest";
import { createGenerator } from "@unocss/core";
import { createCss } from "../src/css/create-css.ts";
import { unoPresetMini } from "./helpers/unocss-oracle.ts";
import { createUnoCssAdapter } from "../src/css/unocss-adapter.ts";
import { examplePreset } from "@pandwind/example-preset";

/**
 * Compile proof: emitted candidates must match real UnoCSS rules and
 * produce the intended declarations. preset-mini is the real package at
 * the pinned @unocss/core version (loaded out-of-tree by the oracle
 * helper); the generator is the @unocss/core dev dependency itself.
 */
const unoGenerator = async () => {
	type UnoPreset = NonNullable<
		Parameters<typeof createGenerator>[0]
	>["presets"] extends infer P extends readonly unknown[]
		? P[number]
		: never;
	const preset = await unoPresetMini<UnoPreset>();
	return createGenerator({ presets: [preset], content: { pipeline: false } });
};

describe("UnoCSS class-name adapter", () => {
	test("emits arbitrary-property candidates the real generator matches", async () => {
		const adapter = createUnoCssAdapter();
		const candidates = [
			adapter.toClassName("color", "red"),
			adapter.toClassName("width", "3.5rem"),
			adapter.toClassName("margin", "8px 16px"),
		].filter((candidate) => candidate !== null);
		expect(candidates).toEqual(["[color:red]", "[width:3.5rem]", "[margin:8px_16px]"]);

		const gen = await unoGenerator();
		const out = await gen.generate(candidates);
		for (const candidate of candidates) {
			expect(out.matched.has(candidate), candidate).toBe(true);
		}
		const css = out.css;
		expect(css).toContain("color:red;}");
		expect(css).toContain("width:3.5rem;}");
	});

	test("joins variant conditions the real generator matches", async () => {
		const adapter = createUnoCssAdapter({
			conditions: { _hover: "hover", _dark: "dark", _focus: "focus" },
		});
		const candidate = adapter.toClassName("_dark___hover__color", "red");
		if (candidate === null) throw new Error("expected a candidate");
		expect(candidate).toBe("dark:hover:[color:red]");

		const gen = await unoGenerator();
		const out = await gen.generate([candidate]);
		expect(out.matched.has(candidate)).toBe(true);
		expect(out.css).toContain(":hover");
		expect(out.css).toMatch(/\.dark [^{]*\{color:red;/u);
	});

	test("derives arbitrary variants from preset condition selectors", () => {
		const adapter = createUnoCssAdapter({ preset: examplePreset });
		expect(adapter.toClassName("_supportHover__color", "red")).toBe(
			"[@media(hover:hover)and(pointer:fine)]:hover:[color:red]",
		);
		expect(adapter.toClassName("_hover__color", "red")).toBe("hover:[color:red]");
	});

	test("returns null for values outside the arbitrary-property rule", () => {
		const adapter = createUnoCssAdapter();
		expect(adapter.toClassName("color", "rgb(0 [ x")).toBeNull();
	});

	test("falls back to atomic classes for unrepresentable declarations", () => {
		const adapter = createUnoCssAdapter();
		const css = createCss({ className: adapter });
		const className = css.class({ color: "bg-red-500" });
		expect(className).not.toBeNull();
	});

	test("throws for unknown conditions instead of emitting a dead class", () => {
		const adapter = createUnoCssAdapter();
		expect(() => adapter.toClassName("_hover__color", "red")).toThrowError(/no UnoCSS variant/u);
	});

	test("throws for $input dynamics like the tailwind adapter", () => {
		const adapter = createUnoCssAdapter();
		expect(() => adapter.toClassName("color", "input>$blue")).toThrowError(/does not support/u);
	});
});
