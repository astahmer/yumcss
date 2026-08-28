import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import type { examplePreset } from "../src/preset/example-preset.ts";

test("css group", () => {
	const css = createCss<typeof examplePreset>({ debug: true });
	const styles = css.group({
		header: {
			color: "$blue-300",
			_hover: { color: "$blue-400", display: "block" },
		},
		body: { borderRadius: "2xl", color: "$red-300" },
		footer: { display: "flex" },
		dynamic: {
			$input: {
				bg: {} as "blue" | "red",
				bgHover: {} as string,
				space: {} as 5 | 10,
			},
			display: "flex",
			margin: css.input("space"),
			backgroundColor: css.input("bg"),
			_hover: {
				backgroundColor: css.input("bgHover"),
			},
		},
	});

	expect(styles).toMatchInlineSnapshot(`
    {
      "body": {
        "borderRadius": "borderRadius__2xl",
        "color": "color__$red-300",
      },
      "dynamic": [Function],
      "footer": {
        "display": "display__flex",
      },
      "header": {
        "_hover__color": "_hover__color__$blue-400",
        "_hover__display": "_hover__display__block",
        "color": "color__$blue-300",
      },
    }
  `);

	expect(
		css.props(
			styles.header,
			styles.body,
			styles.footer,
			styles.dynamic({ bg: "blue", bgHover: "", space: 10 }),
			css({
				color: "$red-700",
				_hover: {
					color: "$red-800",
				},
				margin: "10px",
				"&:hover": {
					backgroundColor: "$red-500",
				},
			}),
		),
	).toMatchInlineSnapshot(`
    {
      "className": "color__$red-700 _hover__color__$red-800 _hover__display__block borderRadius__2xl display__flex margin__10px backgroundColor__$bg _hover__backgroundColor__$bgHover &:hover__backgroundColor__$red-500",
      "style": {
        "--bg": "blue",
        "--bgHover": "",
        "--space": 10,
      },
    }
  `);
});

test("css group accepts precompiled class strings", () => {
	const css = createCss();
	const styles = css.group({ button: css.class({ color: "red" }) });

	expect(styles.button).toMatch(/^\S+$/);
	expect(css.props(styles.button).className).toBe(styles.button);
});

test("css group function values can be passed directly to props", () => {
	const css = createCss();
	const styles = css.group({ item: ((padding: number) => ({ padding })) as any });

	const result = css.props((styles.item as any)(8));

	expect(result.className).toContain("pw-padding");
	expect(result.style).toEqual({ "--pw-c-padding": "8px" });
});

test("css group preserves null reset declarations for composed styles", () => {
	const css = createCss({ debug: true });
	const styles = css.group({
		base: css.class({ borderTopWidth: 1 }),
		withoutBorder: css.class({ borderTopWidth: null }),
	});

	expect(css.props(styles.base, styles.withoutBorder).className).toContain("borderTopWidth__0");
});
