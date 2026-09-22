import { expect, test } from "vitest";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeStylesheet } from "../src/css/runtime-stylesheet.ts";
import { createRuntimeCss, createRuntimeSheet } from "../src/css/runtime.ts";
import { examplePreset } from "@pandwind/example-preset";

test("can emit only token declarations referenced by extracted styles", () => {
	const preset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
		strict: true,
		tokens: { colors: { $brand: "#123456", $unused: "#abcdef" } },
	} as never;
	const css = createUnsafeCss();
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

test("emits flat cssVariables through preset conditions and registrations", () => {
	const preset = {
		conditions: { _dark: ".dark &", md: "@media (min-width: 768px)" },
		properties: { $all: true },
		strict: true,
		tokens: {},
		cssVariables: {
			radius: "1rem",
			accent: { base: "red", _dark: "blue", md: "green" },
			progress: { syntax: "<number>", inherits: false, initialValue: "0" },
		},
	} as never;

	const build = createStylesheet(preset).gen.tokens();
	const runtime = createRuntimeStylesheet(preset).gen.tokens();

	expect(build).toContain(":root {--radius: 1rem;}");
	expect(build).toContain(".dark {--accent: blue;}");
	expect(build).toContain("@media (min-width: 768px)");
	expect(build).toContain('@property --progress{syntax:"<number>";inherits:false;initial-value:0}');
	expect(runtime).toContain(":root {--radius: 1rem;}");
	expect(runtime).toContain(".dark {--accent: blue;}");
	expect(runtime).toContain('@property --progress{syntax:"<number>";inherits:false;initial-value:0}');
});

test("authored token names are opt-in and collisions fail closed", () => {
	const preset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
		strict: true,
		tokens: { colors: { $brand: "red" } },
		tokenVariables: { colors: { $brand: "brand" } },
	} as never;

	const hashed = createStylesheet(preset).gen.tokens();
	const authored = createStylesheet(preset, { tokenVariableNames: "authored" }).gen.tokens();

	expect(hashed).toContain("--");
	expect(hashed).not.toContain("--brand: red");
	expect(authored).toContain("--brand: red");
	const collisionPreset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
		strict: true,
		tokens: { colors: { $brand: "red", $other: "blue" } },
		tokenVariables: { colors: { $brand: "brand", $other: "brand" } },
	} as never;
	expect(() => createStylesheet(collisionPreset, { tokenVariableNames: "authored" })).toThrow(
		"Ambiguous authored token variable",
	);
});

test("authored token names preserve dashed and escaped punctuation across build and runtime", () => {
	const preset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "custom" } },
		strict: true,
		tokens: {
			custom: {
				"$gray.700": "#374151",
				"$space-2": "0.5rem",
				$10px: "10px",
				"$slash/name": "value",
			},
		},
		tokenVariables: {
			custom: {
				"$gray.700": "gray.700",
				"$space-2": "space-2",
				$10px: "10px",
				"$slash/name": "slash/name",
			},
		},
	} as never;

	const build = createStylesheet(preset, { tokenVariableNames: "authored" }).gen.tokens();
	const runtime = createRuntimeStylesheet(preset, { tokenVariableNames: "authored" }).gen.tokens();
	const runtimeSheet = createRuntimeSheet({ autoMount: false });
	const runtimeCss = createRuntimeCss(preset, {
		sheet: runtimeSheet,
		tokenVariableNames: "authored",
	});
	for (const token of ["$gray.700", "$space-2", "$10px", "$slash/name"]) {
		runtimeCss.class({ color: token });
	}

	for (const name of ["gray\\.700", "space-2", "\\31 0px", "slash\\/name"]) {
		expect(build).toContain(`--${name}:`);
		expect(runtime).toContain(`--${name}:`);
		expect(runtimeSheet.css()).toContain(`var(--${name})`);
	}
});

test("malformed authored token variable names fail closed", () => {
	const invalidNames = ["", "has space", "--already-prefixed", "has\u0000nul", null];

	for (const name of invalidNames) {
		const preset = {
			conditions: {},
			properties: { $all: true },
			strict: true,
			tokens: { custom: { $value: "red" } },
			tokenVariables: { custom: { $value: name } },
		} as never;

		expect(() => createStylesheet(preset, { tokenVariableNames: "authored" })).toThrow(
			"Invalid authored token variable name",
		);
	}
});

test("css gen simple prop", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });
	const rules = sheet.process([css.raw({ color: "$red-700" })]);
	expect(rules.get("color__$red-700")?.css).toContain("/* substituted */");
});

test("css gen prop in known pseudo selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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

test("css gen prop supports self selectors inside zero-specificity functions", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });
	const rules = sheet.process([
		css.raw({
			":where(&)": {
				color: "$red-800",
			},
		}),
	]);

	expect([...rules.values()][0]?.css).toMatchInlineSnapshot(
		`":where(.\\31 yu2dzo){color:#822727}"`,
	);
});

test("css gen prop in arbitrary descendant selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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
      "sm__color__$red-800" => {
        "css": "@media (min-width: 640px){.i4ah8r{color:#822727}}",
        "id": "sm__color__$red-800",
        "priority": 3200,
      },
    }
  `,
	);
});

test("css gen prop in unknown at rule", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });

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

test("css gen prop in a container at rule", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });
	const rules = sheet.process([
		css.raw({
			"@container (min-width: 28rem)": {
				color: "$red-800",
			},
		}),
	]);
	const rule = rules.values().next().value;

	expect(rule?.css).toContain("@container (min-width: 28rem){");
	expect(rule?.css).toContain("{color:#822727}");
	expect(rule?.priority).toBe(3300);
});

test("css gen prop in unknown at rule in pseudo selector", () => {
	const sheet = createStylesheet(examplePreset, { debug: false });
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: false });

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
	const css = createUnsafeCss({ debug: true });

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

test("processKeyframes emits one deterministic rule per canonical body", () => {
	const sheet = createStylesheet(examplePreset, {}, { tokens: "used" });
	const name = sheet.processKeyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

	expect(name.startsWith("pw-kf-")).toBe(true);
	expect(sheet.processKeyframes({ "0%": { opacity: 0 }, "100%": { opacity: 1 } })).toBe(name);
	expect(sheet.processKeyframes({ to: { opacity: 1 }, from: { opacity: 0 } })).toBe(name);
	expect(sheet.gen.keyframesEntries()).toHaveLength(1);
	expect(sheet.gen.keyframes()).toMatchInlineSnapshot(
		`"@keyframes pw-kf-8ozw3w{0%{opacity:0}100%{opacity:1}}"`,
	);
});

test("keyframe steps resolve preset tokens into the used token set", () => {
	const preset = {
		conditions: {},
		properties: { $all: true, color: { $tokens: "colors" } },
		strict: true,
		tokens: { colors: { $brand: "#123456", $accent: "#654321", $unused: "#abcdef" } },
	} as never;
	const sheet = createStylesheet(preset, {}, { tokens: "used" });
	sheet.processKeyframes({ from: { color: "$brand" }, to: { color: "$accent" } });

	const keyframes = sheet.gen.keyframes();
	const referenced = keyframes.match(/var\(--[^)]+\)/g) ?? [];
	expect(referenced).toHaveLength(2);

	const tokens = sheet.gen.tokens();
	for (const reference of new Set(referenced)) {
		expect(tokens).toContain(reference.slice(4, -1));
	}
	expect(tokens).toContain("#123456");
	expect(tokens).toContain("#654321");
	// Only the referenced tokens are emitted, not the whole palette.
	expect(tokens).not.toContain("#abcdef");
});

test("keyframe steps reject nested conditions instead of dropping them", () => {
	const sheet = createStylesheet(examplePreset, {});

	expect(() => sheet.processKeyframes({ from: { _hover: { opacity: 1 } } })).toThrow(
		"a keyframe step has no selector",
	);
});
