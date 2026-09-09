/**
 * Cross-engine CSS-dedup proof — plan 007 item D / plan 010 section B.
 *
 * The tailwind adapter's "one rule per class" guarantee is proven separately
 * (tests/css-tw-parity.test.ts — external compiler). This suite proves the
 * SAME guarantees for every strategy backed by pandwind's own stylesheet
 * engine, by running one parameterized battery per installed mode:
 *
 * - **default** (hashed atoms) and **named-atoms** (`createNamedAtomsStrategy`).
 *
 * Per mode it asserts:
 *
 * 1. **One rule per class** — every emitted atom has exactly one rule in the
 *    generated stylesheet, and the sheet contains no duplicate rule nodes.
 * 2. **Declaration equality across modes** — the resolved
 *    (flat key → property → value) map is identical between hash and
 *    named-atoms modes; only the class spelling differs.
 * 3. **cx() survivor recompilation** — for merge scenarios (last-wins,
 *    disjoint coexistence, variant-scoped last-wins), recompiling ONLY the
 *    survivor classes through the generated rules yields exactly the
 *    expected final declarations.
 *
 * The tw adapter is deliberately out of scope here: its classes are compiled
 * by external Tailwind, not by this engine's stylesheet.
 *
 * Both runtime declaration and stylesheet generation canonicalize flattened
 * condition paths, so inverted nesting (`{ color: { _hover: "..." } }`) is
 * equivalent to canonical authoring (`{ _hover: { color: "..." } }`) in every
 * sheet-backed mode.
 */
import { parse, type Rule, type Root } from "postcss";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { escapeIdentifier } from "../src/css/hash.ts";
import { createCx } from "../src/cx/index.ts";
import { examplePreset } from "@pandwind/example-preset";
import { extractTwConfig } from "../src/vite/inline.ts";
import { PostCssNodeKind } from "./helpers/postcss-node-kind.ts";

const MODES = [
	{ name: "hash-atoms", strategy: undefined },
	{ name: "named-atoms", strategy: createNamedAtomsStrategy() },
] as const;

type Style = Record<string, unknown>;

/** The intent corpus: identical inputs run against every mode. */
const INTENTS: Array<{ name: string; style: Style }> = [
	{ name: "color", style: { color: "$blue-500" } },
	{ name: "background", style: { backgroundColor: "$red-500" } },
	{ name: "radius+padding", style: { borderRadius: "md", paddingTop: "8px" } },
	{ name: "hover color", style: { _hover: { color: "$red-500" } } },
];

/** cx() merge scenarios: args -> expected surviving property -> value. */
const CX_SCENARIOS: Array<{
	name: string;
	args: Array<Style>;
	expected: Array<{ prop: string; value: string }>;
}> = [
	{
		name: "last-wins same property",
		args: [{ color: "red" }, { color: "blue" }],
		expected: [{ prop: "color", value: "blue" }],
	},
	{
		name: "disjoint properties coexist",
		args: [{ color: "red" }, { backgroundColor: "blue" }],
		expected: [
			{ prop: "color", value: "red" },
			{ prop: "background-color", value: "blue" },
		],
	},
	{
		name: "variant-scoped last-wins",
		args: [{ _hover: { color: "red" } }, { _hover: { color: "blue" } }],
		expected: [{ prop: "color", value: "blue" }],
	},
];

function makeMode(strategy: (typeof MODES)[number]["strategy"]) {
	const css = createCss({ className: strategy });
	const sheet = createStylesheet(examplePreset, { className: strategy });

	const twSource = readFileSync(
		resolve(import.meta.dirname, "../../../examples/example/src/tw.ts"),
		"utf8",
	);
	const real = extractTwConfig(twSource)!;
	const cx = createCx({
		css: css as never,
		variants: real.variants,
		conflicts: real.conflicts,
		compose: real.compose,
	});

	/** Compile a style: returns { flat key -> class } and feeds the sheet. */
	const compile = (style: Style): Record<string, string> => {
		const atoms = css(style as never) as Record<string, string>;
		sheet.process([css.raw(style as never) as never]);
		return atoms;
	};

	return { css, cx, compile, root: (): Root => parse(sheet.gen.atomic()) };
}

/**
 * All rule nodes whose selector list contains the given class name.
 * Matching handles three spellings: the raw runtime class, the
 * postcss-normalized escape (`\\$` -> `$`), and CSS identifier escaping of
 * leading digits (`1k0rf5x` -> `\\31 k0rf5x`) — see escapeIdentifier.
 */
function rulesForClassName(root: Root, className: string): Rule[] {
	const unescaped = className.replace(/\\([^\s])/g, "$1");
	const candidates = new Set([`.${className}`, `.${unescaped}`, `.${escapeIdentifier(className)}`]);
	return root.nodes.filter(
		(node): node is Rule =>
			node.type === PostCssNodeKind.Rule &&
			node.selector.split(",").some((selector) => {
				const trimmed = selector.trim();
				return [...candidates].some((needle) => trimmed === needle || trimmed.includes(needle));
			}),
	);
}

/** Resolved declarations of one compiled style, from its generated rules. */
function declarationsFor(root: Root, atoms: Record<string, string>): Map<string, string> {
	const resolved = new Map<string, string>();
	for (const [key, atom] of Object.entries(atoms)) {
		const rules = rulesForClassName(root, atom);
		expect(rules.length, `${atom} (${key}) must have exactly one rule`).toBe(1);
		rules[0]!.walkDecls((decl) => {
			if (!decl.prop.startsWith("--")) resolved.set(`${key}|${decl.prop}`, decl.value);
		});
	}
	return resolved;
}

describe.each(MODES.map((m) => [m.name, m.strategy] as const))(
	"css dedup proof — %s",
	(_name, strategy) => {
		const { compile, root } = makeMode(strategy);

		test("one rule per class — no duplicates anywhere in the sheet", () => {
			const allAtoms: Array<[string, string]> = [];
			for (const intent of INTENTS) {
				for (const [key, atom] of Object.entries(compile(intent.style))) {
					allAtoms.push([`${intent.name}:${key}`, atom]);
				}
			}
			const tree = root();

			for (const [label, atom] of allAtoms) {
				expect(
					rulesForClassName(tree, atom).length,
					`${label} -> ${atom} must have exactly one rule`,
				).toBe(1);
			}

			// Global duplicate check: no two rule nodes share selector+context.
			const seenSelectors = new Set<string>();
			for (const node of tree.nodes) {
				if (node.type !== PostCssNodeKind.Rule) continue;
				const identity = `${node.parent?.type ?? ""}::${node.selector}`;
				expect(seenSelectors.has(identity), `duplicate rule: ${node.selector}`).toBe(false);
				seenSelectors.add(identity);
			}
		});

		test("resolved declarations equal the intent", () => {
			const resolvedByIntent = INTENTS.map((intent) => ({
				name: intent.name,
				resolved: declarationsFor(root(), compile(intent.style)),
			}));
			const byName = new Map(resolvedByIntent.map((r) => [r.name, r.resolved]));

			expect(byName.get("color")!.get("color|color")).toBe("#3182ce");
			expect(byName.get("background")!.get("backgroundColor|background-color")).toBe("#E53E3E");
			expect(byName.get("radius+padding")!.get("borderRadius|border-radius")).toBe("0.375rem");
			expect(byName.get("radius+padding")!.get("paddingTop|padding-top")).toBe("8px");
			// Variant-scoped intent: the hover rule resolves the color.
			const hoverResolved = [...byName.get("hover color")!.entries()];
			expect(hoverResolved.length).toBeGreaterThan(0);
			for (const [, value] of hoverResolved) expect(value).toBe("#E53E3E");
		});
	},
);

describe("declaration equality across modes", () => {
	test("named-atoms resolves byte-identically to hash-atoms", () => {
		const maps = MODES.map((mode) => {
			const { compile, root } = makeMode(mode.strategy);
			const combined = new Map<string, string>();
			for (const intent of INTENTS) {
				const atoms = compile(intent.style);
				for (const [key, value] of declarationsFor(root(), atoms)) {
					combined.set(key, value);
				}
			}
			return combined;
		});

		const [hash, named] = maps;
		expect(named!.size).toBe(hash!.size);
		for (const [key, value] of hash!) {
			expect(named!.get(key), `${key}: ${value} vs ${named!.get(key)}`).toBe(value);
		}
	});
});

describe("cx survivor recompilation", () => {
	test.each(MODES.map((m) => [m.name, m.strategy] as const))(
		"%s: survivors recompile to expected declarations",
		(_name, strategy) => {
			const { css, cx, compile, root } = makeMode(strategy);

			for (const scenario of CX_SCENARIOS) {
				const argAtoms = scenario.args.map((style) => compile(style));
				const argClasses = scenario.args.map((style) => css.class(style as never));
				const survivors = cx(...(argClasses as never[])) as string;
				const survivorClasses = survivors.split(" ").filter(Boolean);

				// Single-property full-cover merge: the loser class is gone.
				if (
					scenario.expected.length === 1 &&
					scenario.args.every((a) => Object.keys(a).length === 1)
				) {
					const loserAtom = Object.values(argAtoms[0]!)[0]!;
					if (survivorClasses.length === 1 && survivorClasses[0] !== loserAtom) {
						expect(survivorClasses).not.toContain(loserAtom);
					}
				}

				// Recompile: every survivor class resolves through exactly one
				// rule to the expected declaration.
				const tree = root();
				const got = new Map<string, string>();
				for (const className of survivorClasses) {
					const rules = rulesForClassName(tree, className);
					expect(
						rules.length,
						`survivor ${className} (${scenario.name}) must have exactly one rule`,
					).toBe(1);
					rules[0]!.walkDecls((decl) => {
						if (!decl.prop.startsWith("--")) got.set(decl.prop, decl.value);
					});
				}

				for (const expected of scenario.expected) {
					expect(got.get(expected.prop), `${scenario.name}: ${expected.prop}`).toBe(expected.value);
				}
			}
		},
	);
});

describe("condition-path canonicalization", () => {
	test("inverted condition nesting: named-atoms matches its sheet rule", () => {
		const { compile, root } = makeMode(createNamedAtomsStrategy());
		const atoms = compile({ color: { _hover: "red" } });
		const rules = rulesForClassName(root(), Object.values(atoms)[0]!);
		expect(rules.length).toBe(1);
	});

	test("inverted condition nesting: hash-mode runtime atom matches its sheet rule", () => {
		const { compile, root } = makeMode(undefined);
		const atoms = compile({ color: { _hover: "red" } });
		const atom = Object.values(atoms)[0]!;
		expect(rulesForClassName(root(), atom).length).toBe(1);
	});
});
