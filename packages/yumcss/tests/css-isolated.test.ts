import { expect, test } from "vitest";
import { createUnsafeCss } from "../src/unsafe/css.ts";

test("css fn simple prop", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			color: "$red-700",
		}),
	).toMatchInlineSnapshot(`
    {
      "class": "1p2xix9",
      "css": {
        "color": "1p2xix9",
      },
    }
  `);
});

test("css fn prop in known pseudo selector", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			_hover: {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(`
    {
      "class": "lciejg",
      "css": {
        "_hover__color": "lciejg",
      },
    }
  `);
});

test("css fn prop in arbitrary pseudo selector", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"&:hover": {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(`
    {
      "class": "1wewgbw",
      "css": {
        "&:hover__color": "1wewgbw",
      },
    }
  `);
});

test("css fn prop in arbitrary descendant selector", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"[data-selected] &": {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(`
    {
      "class": "tphr12",
      "css": {
        "[data-selected] &__color": "tphr12",
      },
    }
  `);
});

test("css fn prop in known at rule", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			sm: {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(
		`
		{
		  "class": "i4ah8r",
		  "css": {
		    "sm__color": "i4ah8r",
		  },
		}
	`,
	);
});

test("css fn prop in unknown at rule", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"@media (min-width: 640px)": {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(
		`
    {
      "class": "1u25oza",
      "css": {
        "@media (min-width: 640px)__color": "1u25oza",
      },
    }
  `,
	);
});

test("css fn prop in unknown at rule in pseudo selector", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"@media (min-width: 640px)": {
				_hover: {
					color: "$red-800",
				},
			},
		}),
	).toMatchInlineSnapshot(
		`
    {
      "class": "u94ve5",
      "css": {
        "@media (min-width: 640px)___hover__color": "u94ve5",
      },
    }
  `,
	);
});

test("css fn prop in selector list", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"&:active, &[data-active=true]": {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(
		`
    {
      "class": "h49ddi",
      "css": {
        "&:active, &[data-active=true]__color": "h49ddi",
      },
    }
  `,
	);
});

test("css fn prop with multiple selectors in :is", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"&:is(:active, [data-active=true])": {
				color: "$red-800",
			},
		}),
	).toMatchInlineSnapshot(
		`
    {
      "class": "1jahbf6",
      "css": {
        "&:is(:active, [data-active=true])__color": "1jahbf6",
      },
    }
  `,
	);
});

test("css fn prop with multiple selectors in :is also in selector list", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			"&:is(:active, [data-active=true])": {
				"&:disabled, &[data-disabled=true]": {
					color: "$red-800",
				},
			},
		}),
	).toMatchInlineSnapshot(
		`
		{
		  "class": "migzmv",
		  "css": {
		    "&:is(:active, [data-active=true])__&:disabled, &[data-disabled=true]__color": "migzmv",
		  },
		}
	`,
	);
});

test("css fn prop in nested unknown at rule in pseudo selector", () => {
	const _css = createUnsafeCss({ debug: false });
	const css = (...args: Parameters<typeof _css>) => ({
		css: _css(...args),
		class: _css.class(...args),
	});

	expect(
		css({
			_disabled: {
				"[data-active] &": {
					"@media (min-width: 640px)": {
						_hover: {
							color: "$red-800",
						},
					},
				},
			},
		}),
	).toMatchInlineSnapshot(
		`
		{
		  "class": "icev1y",
		  "css": {
		    "_disabled__[data-active] &__@media (min-width: 640px)___hover__color": "icev1y",
		  },
		}
	`,
	);
});
