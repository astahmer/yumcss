/**
 * Non-happy-path robustness — "everything must ALWAYS work".
 *
 * The happy paths are covered everywhere else; this suite throws garbage at
 * every surface (tw(), css(), cx(), the tailwind adapter and the static
 * extractors) and asserts three invariants:
 *
 * 1. Nothing crashes: empty, nullish, unknown, weird inputs produce output.
 * 2. Nothing is silently dropped: unknown classes survive cx(), arbitrary
 *    values compile through real Tailwind, unrepresentable declarations
 *    throw a clear error instead of producing CSS-less classes.
 * 3. Static extraction survives real-world code (JSX, spreads, template
 *    literals, optional chaining) without breaking the source.
 */
import { describe, expect, test } from "vitest";
import { createCx } from "../src/cx/index.ts";
import { createCss } from "../src/css/index.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "../src/preset/example-preset.ts";
import { createTwAdapter } from "../src/tw/adapter.ts";
import { compileStyles, type TwConflictsMeta, type TwNestedStyles } from "../src/tw/compile.ts";
import { compileClasses, rulesForClass } from "./helpers/tailwind-proof.ts";

const css = createCss();
const cx = createCx({ css });
const tw = (styles: TwNestedStyles) => compileStyles(styles, {});

describe("tw() never crashes and only emits class strings", () => {
	// Garbage on purpose: the type system would reject these, the runtime must
	// not. Casting keeps the honesty (these are invalid inputs) explicit.
	const cases: Array<[string, Record<string, unknown>]> = [
		["empty object", {}],
		["nullish values", { bg: null, p: undefined, flex: false }],
		["unknown keys", { madeUp: "whatever", anotherOne: { nested: "deep" } }],
		["arrays", { text: ["2xl", "gray-900"] }],
		["negatives", { "-translateX": "1/2", "-top": "4" }],
		["numbers", { p: 4, z: 10 }],
		["booleans", { flex: true, hidden: true }],
		["deep nesting", { group: { hover: { focus: { bg: "red-500" } } } }],
		["weird strings", { content: "['hello']", bg: "[" }],
	];

	for (const [name, styles] of cases) {
		test(name, () => {
			let out: string;
			expect(() => {
				out = tw(styles as TwNestedStyles);
			}).not.toThrow();
			expect(out!).toBeTypeOf("string");
		});
	}

	test("every emitted class compiles through real Tailwind", async () => {
		const classes = tw({
			bg: "red-500",
			p: "4",
			text: ["2xl", "gray-900"],
			"-translateX": "1/2",
			hover: { bg: "blue-600" },
			sm: { p: "6" },
		}).split(" ");
		const { root } = await compileClasses('@import "tailwindcss";', classes);
		for (const cls of classes) {
			expect(rulesForClass(root, cls).length, `${cls} must compile`).toBeGreaterThan(0);
		}
	});
});

describe("css() never crashes and the sheet stays valid CSS", () => {
	const cases: Array<[string, Record<string, unknown>]> = [
		["empty object", {}],
		["nullish values", { color: null, backgroundColor: undefined, display: false }],
		["unknown tokens", { color: "not-a-color" }],
		["numbers", { opacity: 0.5, zIndex: 10 }],
		["conditions", { _hover: { color: "red" }, sm: { color: "blue" } }],
		["weird values", { content: "']'", width: "calc(100% - 2rem)" }],
	];

	for (const [name, styles] of cases) {
		test(name, () => {
			let atoms: Record<string, string>;
			expect(() => {
				atoms = css(styles as never);
			}).not.toThrow();
			const sheet = createStylesheet(examplePreset);
			expect(() => sheet.process([styles as never])).not.toThrow();
			expect(() => sheet.gen.atomic()).not.toThrow();
			expect(Object.values(atoms!).every((atom) => /^[\w-]+$/.test(atom))).toBe(true);
		});
	}
});

describe("cx() never crashes and never drops unknown classes", () => {
	test("nullish and empty inputs are ignored", () => {
		expect(cx(null, undefined, false, "", "flex")).toBe("flex");
	});

	test("unknown classes are kept verbatim, duplicates dedupe", () => {
		expect(cx("not-a-real-class", "flex", "not-a-real-class", "hover:x")).toBe(
			"not-a-real-class flex hover:x",
		);
	});

	test("weird strings survive untouched", () => {
		const weird = 'a:["x,y] b{c} d\u00e9j\u00e0';
		expect(cx(weird)).toContain("d\u00e9j\u00e0");
	});

	test("adapter css + tw merge still resolves conflicts", () => {
		const variants = { hover: { join: ":" } } as const;
		const conflicts: TwConflictsMeta = {
			"bg-red-500": { "*": ["background-color"] },
			"bg-blue-500": { "*": ["background-color"] },
		};
		const compose = [] as const;
		const adapter = createTwAdapter({
			preset: examplePreset,
			variants,
			bridge: {
				"background-color": { "#3182ce": "bg-blue-500", "#E53E3E": "bg-red-500" },
			},
		});
		const twCss = createCss({ className: adapter });
		const cxAdapter = createCx({ css: twCss, variants, conflicts, compose });
		const merged = cxAdapter(
			compileStyles({ bg: "red-500" }, variants, conflicts, compose),
			twCss.class({ backgroundColor: "$blue-500" }),
		);
		expect(merged).toContain("bg-blue-500");
		expect(merged).not.toContain("bg-red-500");
	});
});

describe("tailwind adapter arbitrary fallbacks always compile", () => {
	const adapter = createTwAdapter({
		preset: examplePreset,
		variants: { hover: { join: ":" }, sm: { join: ":" } },
		bridge: {},
	});
	const twCss = createCss({ className: adapter });

	test("unmatched values become valid arbitrary-property classes", async () => {
		const classes = [
			twCss.class({ color: "#123456" }),
			twCss.class({ width: "13px" }),
			twCss.class({ marginTop: "7px" }),
			twCss.class({ backgroundColor: "rgb(1, 2, 3)" }),
			twCss.class({ opacity: "0.35" }),
			twCss.class({ gridTemplateColumns: "1fr 2fr" }),
			twCss.class({ _hover: { color: "#abcdef" } }),
		];
		const all = classes.join(" ");
		const { root } = await compileClasses('@import "tailwindcss";', all.split(" "));
		for (const cls of classes) {
			expect(rulesForClass(root, cls).length, `${cls} must compile`).toBeGreaterThan(0);
		}
	});

	test("space-heavy values get underscores, still compile", async () => {
		const cls = twCss.class({ gridTemplateColumns: "1fr 2fr" });
		expect(cls).toBe("[grid-template-columns:1fr_2fr]");
		const { root } = await compileClasses('@import "tailwindcss";', [cls]);
		expect(rulesForClass(root, cls).length).toBeGreaterThan(0);
	});
});

describe("static extractors survive real-world code", () => {
	test("css() calls are found in JSX-heavy modules", async () => {
		const { extractCssStyles } = await import("../src/vite/css-extract.ts");
		const code = `
			import { css } from "./design";
			export function Card({ title, color }) {
				return (
					<section className={css.class({ $text: { color: "$blue-500" } })}>
						<h2>{title}</h2>
						<p style={{ color }}>spread: {color}</p>
					</section>
				);
			}
		`;
		const styles = extractCssStyles(code, "card.tsx", new Set(["css"]), examplePreset);
		expect(styles).toEqual([{ color: "#3182ce" }]);
	});

	test("template literals, spreads and optional chaining never break extraction", async () => {
		const { extractCssStyles } = await import("../src/vite/css-extract.ts");
		const code = `
			import { css } from "./design";
			const base = { $text: { color: "$gray-900" } };
			const dyn = \`\${color}\`;
			const a = css.class({ ...base, $text: { size: "sm" } });
			const b = css.class(theme?.dark ? { $text: { color: "$white" } } : base);
			export const c = [a, b, dyn].join(" ");
		`;
		expect(() => extractCssStyles(code, "app.ts", new Set(["css"]), examplePreset)).not.toThrow();
	});

	test("tw() inlining leaves dynamic calls untouched", async () => {
		const { inlineTwCalls } = await import("../src/vite/inline.ts");
		const config = { variants: {} };
		const code = `
			import { tw } from "./tw";
			const color = getColor();
			const a = tw({ bg: "red-500" });
			const b = tw({ bg: color });
		`;
		const result = inlineTwCalls(code, "app.ts", config, new Set(["tw"]));
		expect(result.inlined).toBe(1);
		expect(result.code).toContain('const a = "bg-red-500";');
		expect(result.code).toContain("const b = tw({ bg: color });");
	});
});
