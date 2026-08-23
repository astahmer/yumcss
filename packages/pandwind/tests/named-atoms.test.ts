/**
 * Named-atoms class-name strategy — the second `ClassNameStrategy` consumer.
 *
 * Proves that the same `css()` app code can switch output modes via config:
 * default (hashed atoms) vs named-atoms (readable, sheet-backed classes).
 * The engine contract under test:
 *
 * - switching modes is a one-option change, no call-site edits;
 * - named classes are registered in the atom registry, so cx() merging
 *   keeps working exactly like the default mode;
 * - runtime-emitted names and generated stylesheet selectors derive from
 *   the same canonicalization and match byte-for-byte;
 * - condition nesting (`_hover` in either nesting order) collapses to one
 *   canonical class with its rule attached.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, type Rule, type Root } from "postcss";
import { describe, expect, test } from "vitest";
import { ATOM_REGISTRY } from "../src/css/atoms.ts";
import { createCss } from "../src/css/create-css.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createCx } from "../src/cx/index.ts";
import { createDesignCss } from "../src/design/index.ts";
import { examplePreset } from "../src/preset/example-preset.ts";
import { extractTwConfig } from "../src/vite/inline.ts";

const strategy = createNamedAtomsStrategy();

/** Default-mode engine — the control group. */
const hashed = createDesignCss(examplePreset);

function stylesheet(styles: Array<Record<string, unknown>>): Root {
	const sheet = createStylesheet(examplePreset, { className: strategy });
	sheet.process(styles as never);
	return parse(sheet.gen.atomic());
}

function rulesFor(root: Root, className: string): Rule[] {
	return root.nodes
		.filter((node): node is Rule => node.type === "rule")
		.filter((rule) => rule.selector.split(",").some((s) => s.trim().includes(className)));
}

describe("mode switch via config", () => {
	test("default mode still emits opaque hashes", () => {
		const out = hashed({ $text: { color: "$red-500" } }) as Record<string, string>;
		const atom = Object.values(out)[0]!;
		expect(atom.startsWith("pw-")).toBe(false);
	});

	test("named-atoms mode emits readable classes for identical calls", () => {
		const css = createDesignCss(examplePreset, { className: strategy });
		const out = css({ $text: { color: "$red-500" } }) as Record<string, string>;
		const atom = Object.values(out)[0]!;
		expect(atom.startsWith("pw-")).toBe(true);
	});
});

describe("sheet-backed contract", () => {
	test("runtime class has a matching stylesheet rule", () => {
		const css = createDesignCss(examplePreset, { className: strategy });
		const out = css({ $text: { color: "$red-500" } }) as Record<string, string>;
		const atom = Object.values(out)[0]!;

		const root = stylesheet([css.raw({ $text: { color: "$red-500" } }) as never]);
		const rules = rulesFor(root, atom);
		expect(rules.length).toBe(1);
		expect(rules[0]!.toString()).toContain(`.${atom}`);
	});

	test("token values resolve in the declaration and the emitted name", () => {
		const css = createDesignCss(examplePreset, { className: strategy });
		const out = css({ $text: { color: "$blue-500" } }) as Record<string, string>;
		const atom = Object.values(out)[0]!;
		// The design layer resolves tokens before registration, so the name
		// carries the concrete value (`#` escaped as `\#` in CSS identifiers).
		expect(atom).toContain("3182ce");

		const root = stylesheet([css.raw({ $text: { color: "$blue-500" } }) as never]);
		const rules = rulesFor(root, atom);
		expect(rules.length).toBe(1);
		expect(rules[0]!.toString()).toContain("#3182ce");
	});

	test("condition nesting order collapses to one canonical class", () => {
		// Raw-engine level: both nesting orders flatten to different part
		// orders, the strategy's canonicalization must collapse them.
		const css = createCss({ className: strategy });
		const a = css.class({ _hover: { color: "red" } });
		const b = css.class({ color: { _hover: "red" } });
		expect(a).toBe(b);

		const sheet = createStylesheet(examplePreset, { className: strategy });
		sheet.process([{ _hover: { color: "red" } }] as never);
		const root = parse(sheet.gen.atomic());
		const rules = rulesFor(root, a);
		expect(rules.length).toBe(1);
		expect(rules[0]!.selector).toContain(":hover");
	});

	test("design-layer hover conditions keep their rule", () => {
		const css = createDesignCss(examplePreset, { className: strategy });
		const out = css({ _hover: { $text: { color: "$red-500" } } }) as Record<string, string>;
		const atom = Object.values(out)[0]!;

		const root = stylesheet([css.raw({ _hover: { $text: { color: "$red-500" } } }) as never]);
		const rules = rulesFor(root, atom);
		expect(rules.length).toBe(1);
		expect(rules[0]!.selector).toContain(":hover");
	});
});

describe("cx() merging survives the mode switch", () => {
	const css = createDesignCss(examplePreset, { className: strategy });
	const real = extractTwConfig(
		readFileSync(resolve(import.meta.dirname, "../../../apps/example/src/tw.ts"), "utf8"),
	)!;
	const cx = createCx({
		css,
		variants: real.variants,
		conflicts: real.conflicts,
		compose: real.compose,
	});

	test("named atoms join the registry", () => {
		const registry = (css as never as { [ATOM_REGISTRY]?: Map<string, string> })[ATOM_REGISTRY]!;
		const out = css({ $text: { color: "$red-500" } }) as Record<string, string>;
		const atom = Object.values(out)[0]!;
		expect(registry.get(atom)).toBe("color");
	});

	test("later tw class wins over an earlier named atom on the same property", () => {
		// cx must consult the SAME engine instance the atom came from.
		const atom = Object.values(css({ $text: { color: "$red-500" } }) as Record<string, string>)[0]!;
		expect(cx(atom, "text-blue-500")).toBe("text-blue-500");
		expect(cx("text-blue-500", atom)).toBe(atom);
	});
});

test("plain engine (createCss) supports the strategy too", () => {
	const css = createCss({ className: strategy });
	expect(css.class({ color: "red", backgroundColor: "$blue-500" })).toBe(
		"pw-color-red pw-backgroundColor-\\$blue-500",
	);
});
