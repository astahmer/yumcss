import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import type { examplePreset } from "@pandwind/example-preset";

test("css props simple prop", () => {
	const css = createCss<typeof examplePreset>({ debug: true });

	expect(
		css.props(
			css({
				color: "$red-100",
			}),
			css({
				color: "$blue-200",
			}),
			css({
				color: "$green-300",
			}),
		),
	).toMatchInlineSnapshot(`
    {
      "className": "color__$green-300",
      "style": undefined,
    }
  `);
});

test("css props in condition", () => {
	const css = createCss<typeof examplePreset>({ debug: true });

	expect(
		css.props(
			css({
				margin: "1px",
				_hover: { color: "$red-100" },
			}),
			css({
				margin: "2px",
				_hover: { color: "$blue-200" },
			}),
			css({
				margin: "3px",
				_hover: { color: "$green-300" },
			}),
		),
	).toMatchInlineSnapshot(`
    {
      "className": "margin__3px _hover__color__$green-300",
      "style": undefined,
    }
  `);
});

test("css props in nested condition", () => {
	const css = createCss<typeof examplePreset>({ debug: true });

	expect(
		css.props(
			css({
				margin: "1px",
				sm: {
					height: "1px",
					_hover: {
						color: "$red-100",
					},
				},
			}),
			css({
				margin: "2px",
				sm: {
					height: "2px",
					_hover: {
						color: "$blue-200",
					},
				},
			}),
			css({
				margin: "3px",
				sm: {
					height: "3px",
					_hover: {
						color: "$green-300",
					},
				},
			}),
		),
	).toMatchInlineSnapshot(`
		{
		  "className": "margin__3px height__sm__3px _hover__color__sm__$green-300",
		  "style": undefined,
		}
	`);
});

test("css props ignores conditional falsy style arguments", () => {
	const css = createCss({ debug: true });

	expect(css.props(css({ color: "red" }), false, undefined, null)).toEqual({
		className: "color__red",
		style: undefined,
	});
});

test("css props flattens nested style arrays", () => {
	const css = createCss({ debug: true });

	expect(css.props([css({ color: "red" }), [false, css({ backgroundColor: "blue" })]])).toEqual({
		className: "color__red backgroundColor__blue",
		style: undefined,
	});
});

test("css with dynamic styles", () => {
	const css = createCss<typeof examplePreset>({ debug: true });

	const styles = css.group({
		rounded: {
			borderRadius: "2xl",
		},
		buttonColor: {
			$input: {
				bg: {} as "blue" | "red",
				fontSize: {} as 5 | 10,
			},
			display: "flex",
			fontSize: css.input("fontSize"),
			backgroundColor: css.input("bg"),
			_hover: {
				backgroundColor: css.input("bgHover"),
			},
		},
	});

	expect(styles.buttonColor({ bg: "blue", fontSize: 10 })).toMatchInlineSnapshot(`
      {
        "compiled": {
          "_hover__backgroundColor": "_hover__backgroundColor__$bgHover",
          "backgroundColor": "backgroundColor__$bg",
          "display": "display__flex",
          "fontSize": "fontSize__$fontSize",
        },
        "style": {
          "--bg": "blue",
          "--fontSize": 10,
        },
        Symbol(dynamic): true,
      }
    `);

	expect(
		css.props(
			css({ display: "block", padding: 4 }),
			styles.rounded,
			styles.buttonColor({ bg: "blue", fontSize: 10 }),
		),
	).toMatchInlineSnapshot(`
    {
      "className": "display__flex padding__4px borderRadius__2xl fontSize__$fontSize backgroundColor__$bg _hover__backgroundColor__$bgHover",
      "style": {
        "--bg": "blue",
        "--fontSize": 10,
      },
    }
  `);
});
