/**
 * css() ↔ tw() declaration parity — the "same logical style, same CSS"
 * proof. css() emits its own hashed classes while tw() emits literal
 * Tailwind utilities, so the class names can never be identical; what must
 * be identical is the resolved CSS each engine produces for the same
 * intent. This suite compiles both sides with independent engines and
 * compares (property → resolved value) byte-for-byte:
 *
 * - css(): the atomic engine + example preset (values emitted literally).
 * - tw(): the real tailwindcss compiler with a matching @theme (values
 *   emitted as var() and resolved against the theme block).
 *
 * Variants are compared by selector tail (`:hover`, `:focus`, ...): both
 * engines attach the same pseudo-classes. Breakpoint syntax intentionally
 * differs (Tailwind v4 emits `@media (width >= 40rem)` range queries,
 * presets write `(min-width: 640px)`) — semantically equivalent, not
 * byte-identical, so those are documented rather than asserted.
 */
import { parse, type Root } from "postcss";
import { describe, expect, test } from "vitest";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createDesignCss } from "../src/design/index.ts";
import { examplePreset } from "@pandwind/example-preset";
import {
	compileClasses,
	resolveVar,
	rulesForClass,
	selectorTail,
} from "./helpers/tailwind-proof.ts";

/** Theme tokens mirrored from the example preset so values compare equal. */
const THEME_ENTRY = `
@import "tailwindcss";
@theme {
  --color-blue-500: #3182ce;
  --color-blue-400: #4299e1;
  --color-red-500: #E53E3E;
  --radius-md: 0.375rem;
  --text-sm: 0.875rem;
}
`;

const css = createDesignCss(examplePreset);
const sheet = createStylesheet(examplePreset);

/** Resolved (property → value) map for one css() style object. */
function cssDeclarations(style: Record<string, unknown>): Map<string, string> {
	const atoms = css(style as never) as Record<string, string>;
	// The stylesheet engine works on the resolved raw style (design modules
	// like $text are translated to concrete properties/values first).
	sheet.process([css.raw(style as never) as never]);
	const root = parse(sheet.gen.atomic());
	const resolved = new Map<string, string>();

	for (const [key, atom] of Object.entries(atoms)) {
		const rules = rulesForClass(root, atom);
		expect(rules.length, `atom ${atom} (${key}) should have exactly one rule`).toBe(1);
		rules[0]!.walkDecls((decl) => {
			if (!decl.prop.startsWith("--")) resolved.set(`${key}|${decl.prop}`, decl.value);
		});
	}
	return resolved;
}

/** Resolved (property → value) map for one tw() class string. */
async function twDeclarations(classes: string[]): Promise<Map<string, string>> {
	const { root, vars } = await compileClasses(THEME_ENTRY, classes);
	const resolved = new Map<string, string>();
	for (const className of classes) {
		for (const rule of rulesForClass(root, className)) {
			rule.walkDecls((decl) => {
				if (!decl.prop.startsWith("--")) {
					resolved.set(`${className}|${decl.prop}`, resolveVar(decl.value, vars));
				}
			});
		}
	}
	return resolved;
}

describe("css() and tw() emit the same resolved declarations", () => {
	const pairs: Array<{
		name: string;
		cssStyle: Record<string, unknown>;
		twClasses: string[];
		/** css properties that must match tw's resolved values byte-for-byte. */
		props: Array<{ css: string; tw: string }>;
	}> = [
		{
			name: "color",
			cssStyle: { color: "$blue-500" },
			twClasses: ["text-blue-500"],
			props: [{ css: "color|color", tw: "text-blue-500|color" }],
		},
		{
			name: "background-color",
			cssStyle: { backgroundColor: "$red-500" },
			twClasses: ["bg-red-500"],
			props: [{ css: "backgroundColor|background-color", tw: "bg-red-500|background-color" }],
		},
		{
			name: "border-radius",
			cssStyle: { borderRadius: "md" },
			twClasses: ["rounded-md"],
			props: [{ css: "borderRadius|border-radius", tw: "rounded-md|border-radius" }],
		},
		{
			name: "display",
			cssStyle: { display: "flex" },
			twClasses: ["flex"],
			props: [{ css: "display|display", tw: "flex|display" }],
		},
		{
			name: "arbitrary width",
			cssStyle: { width: "3.5rem" },
			twClasses: ["w-[3.5rem]"],
			props: [{ css: "width|width", tw: "w-[3.5rem]|width" }],
		},
		{
			name: "font-size (tw also emits line-height — subset match)",
			cssStyle: { $text: { size: "sm" } },
			twClasses: ["text-sm"],
			props: [{ css: "fontSize|font-size", tw: "text-sm|font-size" }],
		},
	];

	for (const entry of pairs) {
		test(entry.name, async () => {
			const cssProps = cssDeclarations(entry.cssStyle);
			const twProps = await twDeclarations(entry.twClasses);

			for (const pair of entry.props) {
				expect(cssProps.get(pair.css), `css() should emit ${pair.css}`).toBeDefined();
				expect(twProps.get(pair.tw), `tw() should emit ${pair.tw}`).toBeDefined();
				expect(cssProps.get(pair.css)).toBe(twProps.get(pair.tw));
			}
		});
	}

	test("hover variant attaches the same pseudo-class and value", async () => {
		const cssProps = cssDeclarations({ _hover: { color: "$blue-400" } });
		const twProps = await twDeclarations(["hover:text-blue-400"]);

		expect(cssProps.get("_hover__color|color")).toBe(twProps.get("hover:text-blue-400|color"));

		const root = parse(sheet.gen.atomic());
		const hoverAtoms = css({ _hover: { color: "$blue-400" } } as never) as Record<string, string>;
		const hoverAtom = hoverAtoms._hover__color!;
		const cssSelector = rulesForClass(root, hoverAtom)[0]!.selector;
		const { root: twRoot } = await compileClasses(THEME_ENTRY, ["hover:text-blue-400"]);
		const twSelector = rulesForClass(twRoot, "hover:text-blue-400")[0]!.selector;

		expect(selectorTail(cssSelector, hoverAtom)).toBe(
			selectorTail(twSelector, "hover:text-blue-400"),
		);
		expect(selectorTail(twSelector, "hover:text-blue-400")).toBe(":hover");
	});
});

describe("generated stylesheet validity", () => {
	test("the atomic output parses as valid CSS with standard properties only", () => {
		sheet.process([
			{
				color: "$blue-500",
				backgroundColor: "$red-500",
				borderRadius: "md",
				display: "flex",
				_focus: { color: "$blue-400" },
			} as never,
		]);
		const output = [sheet.gen.tokens(), sheet.gen.atomic()].filter(Boolean).join("\n");

		let parsed: Root;
		expect(() => {
			parsed = parse(output);
		}).not.toThrow();
		expect(parsed!).toBeDefined();

		const props = new Set<string>();
		parsed!.walkRules((rule) => {
			// Token variables live in dedicated carrier rules (`:root`, plus
			// condition-bound semantic-token overrides like `.dark`) — custom
			// properties by design. A rule that ONLY declares custom props is
			// such a carrier and is skipped; any rule mixing standard CSS
			// properties must not leak custom properties into them.
			const decls: Array<{ prop: string }> = [];
			rule.walkDecls((decl) => {
				decls.push(decl);
			});
			if (decls.length > 0 && decls.every((d) => d.prop.startsWith("--"))) return;
			for (const decl of decls) {
				props.add(decl.prop);
			}
		});
		for (const prop of props) {
			expect(prop.startsWith("--"), `${prop} should be a standard property`).toBe(false);
		}
	});
});
