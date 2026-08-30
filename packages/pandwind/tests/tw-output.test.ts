import type { StandardProperties } from "csstype";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet, decodeAtomicPath } from "../src/css/create-stylesheet.ts";
import { pairs } from "../src/lib/utils.ts";
import { definePreset, defineTokens } from "../src/types/define-preset.ts";

const utilities: Record<string, string> = {
	// Colors and Background
	color: "text-",
	backgroundColor: "bg-",

	// Typography
	fontSize: "text-",
	fontWeight: "font-",
	lineHeight: "leading-",
	letterSpacing: "tracking-",
	textColor: "text-",
	textAlign: "text-",

	// Spacing
	margin: "m-",
	marginTop: "mt-",
	marginRight: "mr-",
	marginBottom: "mb-",
	marginLeft: "ml-",
	padding: "p-",
	paddingTop: "pt-",
	paddingRight: "pr-",
	paddingBottom: "pb-",
	paddingLeft: "pl-",

	// Sizing
	width: "w-",
	height: "h-",
	minWidth: "min-w-",
	minHeight: "min-h-",
	maxWidth: "max-w-",
	maxHeight: "max-h-",

	// Borders
	borderWidth: "border-",
	borderColor: "border-",
	borderRadius: "rounded-",

	// Flexbox and Grid
	flexDirection: "flex-",
	justifyContent: "justify-",
	alignItems: "items-",
	alignSelf: "self-",
	gap: "gap-",
	gridTemplateColumns: "grid-cols-",
	gridColumn: "col-",
	gridColumnStart: "col-start-",
	gridColumnEnd: "col-end-",
	gridTemplateRows: "grid-rows-",
	gridRow: "row-",
	gridRowStart: "row-start-",
	gridRowEnd: "row-end-",

	// Position
	position: "",
	top: "top-",
	right: "right-",
	bottom: "bottom-",
	left: "left-",
	zIndex: "z-",

	// Display
	display: "",
	overflow: "overflow-",
	visibility: "visibility-",

	// Others
	opacity: "opacity-",
	boxShadow: "shadow-",
	transition: "transition-",
	transform: "transform-",
};

// https://github.com/tailwindlabs/tailwindcss/blob/next/packages/tailwindcss/src/utilities.ts#L361
// https://github.com/tailwindlabs/tailwindcss/blob/next/packages/tailwindcss/src/utilities.test.ts#L13507
// https://tailwindcss.com/docs/configuration#core-plugins

describe("css with custom tailwind hashFn", () => {
	const tokens = defineTokens({
		colors: {
			"sky-600": "#0284C7",
			"red-500": "#E53E3E",
		},
		spacing: {
			"1": "1px",
			"2": "2px",
			"3": "3px",
			"4": "4px",
			"6": "6px",
			"8": "8px",
			"12": "12px",
			"16": "16px",
			"20": "20px",
			"24": "24px",
		},
	});

	const preset = definePreset(
		{
			config: {} as StandardProperties,
			tokens: tokens,
		},
		{
			strict: true,
			properties: {
				$all: true,
				color: { $tokens: "colors" },
				padding: { $tokens: "spacing" },
				paddingTop: { $tokens: "spacing" },
			},
			conditions: {
				base: "",
				hover: "&:hover",
				dark: "@media (prefers-color-scheme: dark)",
				md: "@media (min-width: 640px)",
			},
		},
	);

	function tailwindHashFn(key: string, value: string | true): string {
		const parts = pairs.split(key);

		const prop = decodeAtomicPath(preset.conditions, pairs.join([key, String(value)])).prop;
		const conds = parts.filter((part) => part !== prop);

		return conds.reduceRight(
			(acc, part) => {
				return `${part}:${acc}`;
			},
			utilities[prop as string]! + value,
		);
	}

	test("sandbox", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});

		const styles = css.raw({
			color: "sky-600",
			hover: {
				color: "red-500",
			},
		});

		expect(
			css({
				color: "sky-600",
				hover: {
					color: "red-500",
				},
			}),
		).toMatchInlineSnapshot(`
      {
        "color": "text-sky-600",
        "hover__color": "hover:text-red-500",
      }
    `);

		expect(sheet.generate([styles])).toMatchInlineSnapshot(`
			":root {--colors__red-500: #E53E3E;}
			:root {--colors__sky-600: #0284C7;}
			:root {--spacing__1: 1px;}
			:root {--spacing__12: 12px;}
			:root {--spacing__16: 16px;}
			:root {--spacing__2: 2px;}
			:root {--spacing__20: 20px;}
			:root {--spacing__24: 24px;}
			:root {--spacing__3: 3px;}
			:root {--spacing__4: 4px;}
			:root {--spacing__6: 6px;}
			:root {--spacing__8: 8px;}
			.text-sky-600{color:var(--colors__sky-600)}
			.hover\\:text-red-500:hover{color:var(--colors__red-500)}"
		`);

		expect(createStylesheet(preset, { debug: false }).generate([styles])).toMatchInlineSnapshot(`
			":root {--\\31 01f8i4: 8px;}
			:root {--\\31 45nsom: 4px;}
			:root {--\\31 4tkj9n: 1px;}
			:root {--\\31 9bfonp: 3px;}
			:root {--\\31 dacso9: 16px;}
			:root {--\\31 j1b588: 12px;}
			:root {--\\31 jajvoj: 24px;}
			:root {--\\31 p1d4j8: 20px;}
			:root {--\\31 pk9ax3: #E53E3E;}
			:root {--\\31 ur0fic: 6px;}
			:root {--eiqbvd: 2px;}
			:root {--fz3vmc: #0284C7;}
			.mh21yw{color:var(--fz3vmc)}
			.\\31 rj13sn:hover{color:var(--\\31 pk9ax3)}"
		`);
	});

	test("utilities.color", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});
		const styles = css.raw({ color: "sky-600" });

		expect(css(styles as never)).toMatchInlineSnapshot(`
      {
        "color": "text-sky-600",
      }
    `);

		sheet.process([styles]);
		expect(sheet.gen.atomic()).toMatchInlineSnapshot(
			`".text-sky-600{color:var(--colors__sky-600)}"`,
		);
	});

	test("utilities.color + hover", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});
		const styles = css.raw({ hover: { color: "sky-600" } });

		expect(css(styles as never)).toMatchInlineSnapshot(`
      {
        "hover__color": "hover:text-sky-600",
      }
    `);

		sheet.process([styles]);
		expect(sheet.gen.atomic()).toMatchInlineSnapshot(
			`".hover\\:text-sky-600:hover{color:var(--colors__sky-600)}"`,
		);
	});

	test("utilities.color + dark + md + hover", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});
		const styles = css.raw({
			dark: { md: { hover: { color: "sky-600" } } },
		});

		expect(css(styles as never)).toMatchInlineSnapshot(`
			{
			  "dark__md__hover__color": "dark:hover:md:text-sky-600",
			}
		`);

		sheet.process([styles]);
		expect(sheet.gen.atomic()).toMatchInlineSnapshot(
			`"@media (min-width: 640px){@media (prefers-color-scheme: dark){.dark\\:hover\\:md\\:text-sky-600:hover{color:var(--colors__sky-600)}}}"`,
		);
	});

	test.skip("utilities.color + color opacity modifier", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});
		// @ts-expect-error TODO
		const styles = css.raw({ color: "sky-600/50" });

		expect(css(styles as never)).toMatchInlineSnapshot(`
      {
        "color": "text-sky-600",
      }
    `);

		sheet.process([styles]);
		expect(sheet.gen.atomic()).toMatchInlineSnapshot(
			`
      ".text-sky-600{color:var(--colors__sky-600)}
      .hover:text-red-500:hover{color:var(--colors__red-500)}"
    `,
		);
	});

	test("utilities.padding", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});
		const styles = css.raw({ padding: "4", paddingTop: "6" });

		expect(css(styles as never)).toMatchInlineSnapshot(`
      {
        "padding": "p-4",
        "paddingTop": "pt-6",
      }
    `);

		sheet.process([styles]);
		expect(sheet.gen.atomic()).toMatchInlineSnapshot(
			`
      ".p-4{padding:var(--spacing__4)}
      .pt-6{padding-top:var(--spacing__6)}"
    `,
		);
	});

	test("utilities.flex", () => {
		const sheet = createStylesheet(preset, {
			debug: true,
			hashFn: tailwindHashFn,
		});
		const css = createCss<typeof preset>({
			debug: true,
			hashFn: tailwindHashFn,
		});
		const styles = css.raw({ display: "flex" });

		expect(css(styles as never)).toMatchInlineSnapshot(`
      {
        "display": "flex",
      }
    `);

		sheet.process([styles]);
		expect(sheet.gen.atomic()).toMatchInlineSnapshot(`".flex{display:flex}"`);
	});
});
