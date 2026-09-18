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
