import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { pandaShared } from "./helpers/panda-oracle.ts";
import { createPandaAdapter } from "../src/css/panda-adapter.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

/** Panda example-preset shorthand map (mirrors the generated classNameByProp). */
const propClasses = { backgroundColor: "bg", color: "text", width: "w", display: "d", margin: "m" };

/**
 * Oracle for the class formula: the real @pandacss/shared createCss runtime
 * in its default non-hash shape (verified against the generator artifact;
 * see the module doc). The adapter must produce byte-identical classes for
 * the same (prop, value, conditions) inputs.
 */
const pandaOracle = async () => {
	const { createCss: pandaCreateCss, hypenateProperty, withoutSpace } = await pandaShared();
	const classNameByProp = new Map(Object.entries(propClasses));
	return pandaCreateCss({
		conditions: {
			shift: (p: string[]) => p,
			finalize: (p: string[]) => p,
			breakpoints: { keys: [] },
		},
		utility: {
			transform: (key: string, value: string) => ({
				className: (classNameByProp.get(key) ?? hypenateProperty(key)) + "-" + withoutSpace(value),
			}),
			hasShorthand: false,
			resolveShorthand: (p: string) => p,
		},
	});
};

describe("Panda class-name adapter", () => {
	test("matches the real Panda runtime class formula", async () => {
		const adapter = createPandaAdapter({ propClasses });
		const oracle = await pandaOracle();
		for (const [prop, value] of [
			["color", "red.500"],
			["backgroundColor", "red.500"],
			["display", "flex"],
			["width", "calc(100% - 20px)"],
		] as const) {
			expect(adapter.toClassName(prop, value)).toBe(oracle({ [prop]: value }));
		}
	});

	test("hyphenates props outside the shorthand map like Panda", () => {
		const adapter = createPandaAdapter({ propClasses });
		expect(adapter.toClassName("borderRadius", "8px")).toBe("border-radius-8px");
	});

	test("joins configured conditions with : and finalizes selectors", () => {
		const adapter = createPandaAdapter({
			propClasses,
			conditions: examplePreset.conditions,
		});
		expect(adapter.toClassName("_hover__backgroundColor", "red.500")).toBe("hover:bg-red.500");
		expect(adapter.toClassName("_dark___hover__color", "red.500")).toBe("dark:hover:text-red.500");
	});

	test("strips configured keys and brackets raw selector keys like finalizeConditions", () => {
		const adapter = createPandaAdapter({
			propClasses,
			conditions: {
				supportHover: examplePreset.conditions._supportHover as string[],
			},
		});
		// Configured keys are underscore-stripped (the selector only decides
		// the CSS, not the class — real finalizeConditions).
		expect(adapter.toClassName("_supportHover__color", "red.500")).toBe(
			"supportHover:text-red.500",
		);
		// Raw &/at-rule paths (not in the condition map) are bracketed.
		expect(adapter.toClassName("&:focus__color", "red.500")).toBe("[&:focus]:text-red.500");
	});

	test("prepends an optional prefix with -", () => {
		const adapter = createPandaAdapter({ propClasses, prefix: "ui" });
		expect(adapter.toClassName("backgroundColor", "red.500")).toBe("ui-bg-red.500");
	});

	test("throws for unknown conditions instead of emitting a dead class", () => {
		const adapter = createPandaAdapter({ propClasses });
		expect(() => adapter.toClassName("_hover__color", "red")).toThrowError(
			/unknown conditions cannot be emitted/u,
		);
	});

	test("throws for $input dynamics like the tailwind adapter", () => {
		const adapter = createPandaAdapter({ propClasses });
		expect(() => adapter.toClassName("color", "input>$blue")).toThrowError(/does not support/u);
	});

	test("integrates with the css() engine", () => {
		const adapter = createPandaAdapter({ propClasses });
		const css = createCss({ className: adapter });
		expect(css.class({ color: "red.500", margin: 8 })).toBe("text-red.500 m-8px");
	});
});
