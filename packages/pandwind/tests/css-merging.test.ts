import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import type { examplePreset } from "../src/preset/example-preset.ts";

test("css merging simple prop", () => {
	const _css = createCss<typeof examplePreset>({ debug: true });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css(
			{
				color: "$red-100",
			},
			{
				color: "$blue-200",
			},
			{
				color: "$green-300",
			},
		),
	).toMatchInlineSnapshot(`
    {
      "class": "color__$green-300",
      "css": {
        "color": "color__$green-300",
      },
    }
  `);
});

test("css merging in condition", () => {
	const _css = createCss<typeof examplePreset>({ debug: true });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css(
			{
				margin: "1px",
				_hover: { color: "$red-100" },
			},
			{
				margin: "2px",
				_hover: { color: "$blue-200" },
			},
			{
				margin: "3px",
				_hover: { color: "$green-300" },
			},
		),
	).toMatchInlineSnapshot(`
    {
      "class": "margin__3px _hover__color__$green-300",
      "css": {
        "_hover__color": "_hover__color__$green-300",
        "margin": "margin__3px",
      },
    }
  `);
});

test("css merging in nested condition", () => {
	const _css = createCss<typeof examplePreset>({ debug: true });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css(
			{
				margin: "1px",
				sm: {
					height: "1px",
					_hover: {
						color: "$red-100",
					},
				},
			},
			{
				margin: "2px",
				sm: {
					height: "2px",
					_hover: {
						color: "$blue-200",
					},
				},
			},
			{
				margin: "3px",
				sm: {
					height: "3px",
					_hover: {
						color: "$green-300",
					},
				},
			},
		),
	).toMatchInlineSnapshot(`
		{
		  "class": "margin__3px height__sm__3px _hover__color__sm__$green-300",
		  "css": {
		    "margin": "margin__3px",
		    "sm___hover__color": "_hover__color__sm__$green-300",
		    "sm__height": "height__sm__3px",
		  },
		}
	`);
});
