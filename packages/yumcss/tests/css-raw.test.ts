import type { StandardLonghandProperties } from "csstype";
import { expect, test } from "vitest";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createCss } from "../src/css/create-css.ts";
import { define } from "../src/types/define-preset.export.ts";

const preset = define.preset(
	{
		config: {} as StandardLonghandProperties,
		tokens: { colors: { $brand: "#2563eb" } },
	},
	{
		strict: true,
		properties: {
			color: { $tokens: "colors" },
			padding: true,
			$all: true,
		},
		conditions: { _hover: "&:hover" },
	},
);

test("preset-bound css accepts raw declarations under $raw", () => {
	const css = createCss(preset, { debug: true });
	const raw = css.raw({
		color: "$brand",
		$raw: {
			"scroll-timeline-name": "--progress",
			_hover: { color: "rebeccapurple" },
		},
	});

	const output = createStylesheet(preset, { debug: true }).generate([raw]);

	expect(output).toContain("color:var(--colors__");
	expect(output).toContain("scroll-timeline-name:--progress");
	expect(output).toContain("color:rebeccapurple");
});

test("$raw follows normal source order when merged with typed declarations", () => {
	const css = createCss(preset, { debug: true });

	const raw = css.raw({ $raw: { padding: "2px" } }, { padding: 4 }, { $raw: { padding: "8px" } });

	expect(createStylesheet(preset, { debug: true }).generate([raw])).toContain("padding:8px");
});

test("flat raw styles merge into a detached ordinary object", () => {
	const css = createCss(preset, { debug: true });
	const base = { display: "flex", padding: 4, $raw: { color: "red" } };
	const override = { padding: 8, $raw: { color: "blue" } };

	const raw = css.raw(base, override);

	expect(raw).toEqual({ display: "flex", padding: 8, color: "blue" });
	expect(Object.getPrototypeOf(raw)).toBe(Object.prototype);
	expect(base).toEqual({ display: "flex", padding: 4, $raw: { color: "red" } });
	expect(override).toEqual({ padding: 8, $raw: { color: "blue" } });
});

test("nested raw styles still deep-merge through the generic path", () => {
	const css = createCss(preset, { debug: true });
	const raw = css.raw(
		{ $raw: { _hover: { color: "red" } } },
		{ $raw: { _hover: { backgroundColor: "blue" } } },
	);
	const output = createStylesheet(preset, { debug: true }).generate([raw]);

	expect(output).toContain("color:red");
	expect(output).toContain("background-color:blue");
});

test("class projection preserves nested raw declarations", () => {
	const css = createCss(preset, { debug: true });
	const style = {
		color: "$brand",
		$raw: {
			"scroll-timeline-name": "--progress",
			_hover: { color: "rebeccapurple" },
		},
	} satisfies Parameters<typeof css>[0];

	expect(css.class(style)).toBe(Object.values(css(style)).join(" "));
});
