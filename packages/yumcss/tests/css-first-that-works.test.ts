import { describe, expect, test } from "vitest";
import { parse } from "postcss";
import { createCss, firstThatWorks } from "../src/css/index.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeCss, createRuntimeSheet } from "../src/css/runtime.ts";
import { createCx } from "../src/cx/index.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { examplePreset } from "@yumcss/example-preset";

describe("firstThatWorks", () => {
	test("emits preferred CSS values after their fallbacks", () => {
		const css = createCss(examplePreset, { debug: true });
		const chain = firstThatWorks("flex", "-webkit-box", "block");
		const className = css.class({ display: chain });
		const stylesheet = createStylesheet(examplePreset, { debug: true });

		stylesheet.process([css.raw({ display: chain })]);

		expect(className).toMatch(/^[^\s]+$/u);
		expect(stylesheet.gen.atomic()).toContain("display:block;display:-webkit-box;display:flex");
		expect(() => parse(stylesheet.gen.atomic())).not.toThrow();
		expect(stylesheet.gen.atomic()).not.toContain("yumcss:first-that-works");
	});

	test("normalizes each numeric fallback for its property", () => {
		const css = createUnsafeCss({ debug: true });
		const chain = firstThatWorks(8, 4);
		const stylesheet = createStylesheet(examplePreset, { debug: true });

		stylesheet.process([css.raw({ marginTop: chain })]);

		expect(stylesheet.gen.atomic()).toContain("margin-top:4px;margin-top:8px");
	});

	test("resolves each fallback through the preset token catalog", () => {
		const css = createCss(examplePreset);
		const chain = firstThatWorks("$blue-500", "$blue-600");
		const stylesheet = createStylesheet(examplePreset);

		stylesheet.process([css.raw({ color: chain })]);

		expect(stylesheet.gen.atomic()).toContain("color:#2b6cb0;color:#3182ce");
	});

	test("keeps fallback atoms mergeable by their CSS property", () => {
		const css = createCss(examplePreset);
		const cx = createCx({ css: css as never });
		const fallback = css({ display: firstThatWorks("flex", "block") });
		const override = css({ display: "none" });

		expect(cx(fallback, override)).toEqual(override.display);
	});

	test("works with a sheet-backed class-name strategy", () => {
		const strategy = createNamedAtomsStrategy("app");
		const css = createCss(examplePreset, { className: strategy });
		const chain = firstThatWorks("flex", "block");
		const className = css.class({ display: chain });
		const stylesheet = createStylesheet(examplePreset, { className: strategy });

		stylesheet.process([css.raw({ display: chain })]);

		expect(className).toMatch(/^[^\s]+$/u);
		expect(stylesheet.gen.atomic()).toContain("display:block;display:flex");
	});

	test("rejects external class-name strategies that cannot emit fallback rules", () => {
		const css = createCss(examplePreset, {
			className: { name: "external", toClassName: () => "external" },
		});

		expect(() => css.class({ display: firstThatWorks("flex", "block") })).toThrow(
			"firstThatWorks requires the atomic stylesheet",
		);
	});

	test("supports fallback declarations in static group members", () => {
		const sheet = createRuntimeSheet({ id: "first-that-works-group", autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const styles = css.group({ layout: { display: firstThatWorks("flex", "block") } });

		expect(styles.layout).toHaveProperty("display");
		expect(sheet.css()).toContain("display:block;display:flex");
	});

	test("rejects fallback declarations for the colorPalette selector", () => {
		const css = createUnsafeCss();
		const stylesheet = createStylesheet(examplePreset);

		expect(() =>
			stylesheet.process([css.raw({ colorPalette: firstThatWorks("brand", "gray") } as never)]),
		).toThrow("firstThatWorks cannot be used with the colorPalette selector");
	});

	test("registers repeated declarations in the runtime sheet", () => {
		const sheet = createRuntimeSheet({ id: "first-that-works", autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet, debug: true });

		css.class({ display: firstThatWorks("flex", "-webkit-box", "block") });

		expect(sheet.css()).toContain("display:block;display:-webkit-box;display:flex");
	});

	test("rejects fallback chains in the dynamic vars carrier", () => {
		const css = createUnsafeCss();

		expect(() => css.vars({ display: firstThatWorks("flex", "block") })).toThrow(
			"firstThatWorks is a static declaration fallback",
		);
	});
});
