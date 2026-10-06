import { expect, test } from "vitest";
import { createRuntimeCss, createRuntimeSheet } from "../src/css/runtime.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";

const keywordCollisionPreset = {
	conditions: {},
	properties: {
		$all: true,
		lineHeight: { $tokens: "lineHeights" },
		width: { $tokens: "sizes" },
	},
	strict: true,
	tokens: {
		lineHeights: { normal: "1.5" },
		sizes: { auto: "12rem" },
	},
} as never;

test("keeps token-first CSS keyword collisions consistent across build and runtime", () => {
	const styles = createUnsafeCss().raw({ lineHeight: "normal", width: "auto" });
	const build = createStylesheet(keywordCollisionPreset, { debug: true }).generate([styles]);
	const runtime = createRuntimeCss(keywordCollisionPreset, {
		debug: true,
		sheet: createRuntimeSheet({ autoMount: false }),
	});
	runtime.class({ lineHeight: "normal", width: "auto" });
	const runtimeCss = runtime.sheet.css();

	for (const [css, property] of [
		[build, "line-height"],
		[build, "width"],
		[runtimeCss, "line-height"],
		[runtimeCss, "width"],
	] as const) {
		expect(css).toMatch(new RegExp(`${property}:\\s*var\\(--[^)]+\\)`));
	}
	expect(build.match(/line-height:\s*var\(--[^)]+\)/)?.[0]).toBe(
		runtimeCss.match(/line-height:\s*var\(--[^)]+\)/)?.[0],
	);
	expect(build.match(/width:\s*var\(--[^)]+\)/)?.[0]).toBe(
		runtimeCss.match(/width:\s*var\(--[^)]+\)/)?.[0],
	);
	expect(build).toContain("1.5");
	expect(runtimeCss).toContain("1.5");
	expect(build).toContain("12rem");
	expect(runtimeCss).toContain("12rem");
});
