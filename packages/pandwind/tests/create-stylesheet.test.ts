import { expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "@pandwind/example-preset";

test("can emit only token declarations referenced by extracted styles", () => {
	const preset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
		strict: true,
		tokens: { colors: { $brand: "#123456", $unused: "#abcdef" } },
	} as never;
	const css = createCss();
	const used = createStylesheet(preset, {}, { tokens: "used" });
	used.process([css.raw({ color: "$brand" })]);

	expect(used.gen.tokens()).toContain("#123456");
	expect(used.gen.tokens()).not.toContain("#abcdef");
	expect(createStylesheet(preset).gen.tokens()).toContain("#abcdef");
});

test("emits a used token declaration for every accepted token spelling", () => {
	const preset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
		strict: true,
		tokens: { colors: { $brand: "#123456" } },
	} as never;

	for (const value of ["brand", "$brand"]) {
		const sheet = createStylesheet(preset, {}, { tokens: "used" });
		sheet.process([{ color: value }]);

		expect(sheet.gen.tokens()).toContain("#123456");
	}
});

test("css gen simple prop", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	const styles = [
		css.raw({
			color: "$red-700",
		}),
	];

	expect(sheet.process(styles)).toMatchInlineSnapshot(`
		Map {
		  "color__$red-700" => {
		    "css": ".\\31 p2xix9{color:#9B2C2C}",
		    "id": "color__$red-700",
		    "priority": 3000,
		  },
		}
	`);
});

test("stylesheet lowering accepts substituted serializer and ordering policies", () => {
	const sheet = createStylesheet(
		examplePreset,
		{ debug: false },
		{
			serializer: {
				serialize(declarations, conditions) {
					return `/* substituted */${conditions.className}{${declarations}}`;
				},
			},
			ordering: {
				order(values) {
					return [...values].toReversed();
				},
			},
		},
	);
	const css = createCss<typeof examplePreset>({ debug: false });
	const rules = sheet.process([css.raw({ color: "$red-700" })]);
	expect(rules.get("color__$red-700")?.css).toContain("/* substituted */");
});

test("css gen prop in known pseudo selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				_hover: {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(`
    Map {
      "_hover__color__$red-800" => {
        "css": ".lciejg:hover{color:#822727}",
        "id": "_hover__color__$red-800",
        "priority": 3130,
      },
    }
  `);
});

test("css gen prop in arbitrary pseudo selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"&:hover": {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(`
		Map {
		  "&:hover__color__$red-800" => {
		    "css": ".\\31 wewgbw:hover{color:#822727}",
		    "id": "&:hover__color__$red-800",
		    "priority": 3130,
		  },
		}
	`);
});

test("css gen prop preserves class specificity inside zero-specificity selectors", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"&:where(pre *)": {
					backgroundColor: "$red-700",
				},
			}),
		]),
	).toMatchInlineSnapshot(`
    Map {
      "&:where(pre *)__backgroundColor__$red-700" => {
        "css": ".\\31 o6w7dx.\\31 o6w7dx:where(pre *){background-color:#9B2C2C}",
        "id": "&:where(pre *)__backgroundColor__$red-700",
        "priority": 3040,
      },
    }
  `);
});

test("css gen prop in arbitrary descendant selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"[data-selected] &": {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(`
    Map {
      "[data-selected] &__color__$red-800" => {
        "css": "[data-selected] .tphr12{color:#822727}",
        "id": "[data-selected] &__color__$red-800",
        "priority": 6000,
      },
    }
  `);
});

test("css gen prop in known at rule", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				sm: {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
    Map {
      "color__sm__$red-800" => {
        "css": "@media (min-width: 640px){.yu75ve{color:#822727}}",
        "id": "color__sm__$red-800",
        "priority": 3200,
      },
    }
  `,
	);
});

test("css gen prop in unknown at rule", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"@media (min-width: 640px)": {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
		Map {
		  "@media (min-width: 640px)__color__$red-800" => {
		    "css": "@media (min-width: 640px){.\\31 u25oza{color:#822727}}",
		    "id": "@media (min-width: 640px)__color__$red-800",
		    "priority": 3200,
		  },
		}
	`,
	);
});

test("css gen prop in unknown at rule in pseudo selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"@media (min-width: 640px)": {
					_hover: {
						color: "$red-800",
					},
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
    Map {
      "@media (min-width: 640px)___hover__color__$red-800" => {
        "css": "@media (min-width: 640px){.u94ve5:hover{color:#822727}}",
        "id": "@media (min-width: 640px)___hover__color__$red-800",
        "priority": 3330,
      },
    }
  `,
	);
});

test("css gen prop in selector list", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"&:active, &[data-active=true]": {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
    Map {
      "&:active, &[data-active=true]__color__$red-800" => {
        "css": ".h49ddi:active, .h49ddi[data-active=true]{color:#822727}",
        "id": "&:active, &[data-active=true]__color__$red-800",
        "priority": 3040,
      },
    }
  `,
	);
});

test("css gen prop with multiple selectors in :is", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"&:is(:active, [data-active=true])": {
					color: "$red-800",
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
		Map {
		  "&:is(:active, [data-active=true])__color__$red-800" => {
		    "css": ".\\31 jahbf6:is(:active, [data-active=true]){color:#822727}",
		    "id": "&:is(:active, [data-active=true])__color__$red-800",
		    "priority": 3040,
		  },
		}
	`,
	);
});

test("css gen prop with multiple selectors in :is also in selector list", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
				"&:is(:active, [data-active=true])": {
					"&:disabled, &[data-disabled=true]": {
						color: "$red-800",
					},
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
    Map {
      "&:disabled, &[data-disabled=true]__&:is(:active, [data-active=true])__color__$red-800" => {
        "css": ".migzmv:is(:active, [data-active=true]):disabled, .migzmv:is(:active, [data-active=true])[data-disabled=true]{color:#822727}",
        "id": "&:disabled, &[data-disabled=true]__&:is(:active, [data-active=true])__color__$red-800",
        "priority": 3080,
      },
    }
  `,
	);
});

test("css gen prop in nested unknown at rule in pseudo selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createCss<typeof examplePreset>({ debug: false });

	expect(
		sheet.process([
			css.raw({
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
		]),
	).toMatchInlineSnapshot(
		`
    Map {
      "@media (min-width: 640px)__[data-active] &___disabled___hover__color__$red-800" => {
        "css": "@media (min-width: 640px){[data-active] .icev1y:hover:disabled, [data-active] .icev1y:hover[aria-disabled=true]{color:#822727}}",
        "id": "@media (min-width: 640px)__[data-active] &___disabled___hover__color__$red-800",
        "priority": 6370,
      },
    }
  `,
	);
});

test("css property-based conditionals", () => {
	const sheet = createStylesheet(examplePreset);
	const css = createCss<typeof examplePreset>({ debug: true });

	expect(
		sheet.process([
			css.raw({
				color: {
					_hover: "$red-100",
				},
				_hover: {
					color: "$red-100",
				},
			}),
		]),
	).toMatchInlineSnapshot(
		`
    Map {
      "_hover__color__$red-100" => {
        "css": ".mkt4u4:hover{color:#FED7D7}",
        "id": "_hover__color__$red-100",
        "priority": 3130,
      },
    }
  `,
	);
});
