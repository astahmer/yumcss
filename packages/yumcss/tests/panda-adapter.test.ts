import { describe, expect, test } from "vitest";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { pandaOracle } from "./helpers/panda-oracle.ts";
import { createPandaAdapter } from "../src/css/panda-adapter.ts";
import { examplePreset } from "@yumcss/example-preset";

const propClasses = { backgroundColor: "bg", color: "text", width: "w", display: "d", margin: "m" };

describe("Panda class-name adapter", () => {
	test("matches the real Panda runtime class formula", async () => {
		const oracle = await pandaOracle();
		const adapter = createPandaAdapter({ propClasses: oracle.propClasses });
		for (const [prop, value] of [
			["color", "red.500"],
			["backgroundColor", "red.500"],
			["display", "flex"],
			["width", "calc(100% - 20px)"],
			["borderRadius", "lg"],
			["padding", "4"],
			["fontSize", "lg"],
			["scrollbarWidth", "thin"],
		] as const) {
			expect(adapter.toClassName(prop, value)).toBe(oracle.css({ [prop]: value }));
		}
	});

	test("matches generated conditions, prefixes, custom utilities and disabled presets", async () => {
		for (const config of [
			{ prefix: "ui", utilities: { extend: { color: { className: "ink" } } } },
			{ presets: [], prefix: "ui" },
		]) {
			const oracle = await pandaOracle(config);
			const adapter = createPandaAdapter({
				propClasses: oracle.propClasses,
				prefix: "ui",
				conditions: examplePreset.conditions,
			});
			expect(adapter.toClassName("color", "red.500")).toBe(oracle.css({ color: "red.500" }));
			expect(adapter.toClassName("&:focus__color", "red.500")).toBe(
				oracle.css({ "&:focus": { color: "red.500" } }),
			);
		}
		const oracle = await pandaOracle();
		const adapter = createPandaAdapter({
			propClasses: oracle.propClasses,
			conditions: examplePreset.conditions,
		});
		expect(adapter.toClassName("_hover__backgroundColor", "red.500")).toBe(
			oracle.css({ _hover: { backgroundColor: "red.500" } }),
		);
	});

	test("matches generated whitespace and important value handling", async () => {
		const oracle = await pandaOracle();
		const adapter = createPandaAdapter({ propClasses: oracle.propClasses });
		for (const value of ["red.500 !important", "red.500!", "calc(100%\t-\n20px)"]) {
			expect(adapter.toClassName("color", value)).toBe(oracle.css({ color: value }));
		}
	});

	test("hyphenates props outside the shorthand map like Panda", () => {
		const adapter = createPandaAdapter({ propClasses });
		expect(adapter.toClassName("borderRadius", "8px")).toBe("border-radius_8px");
	});

	test("joins configured conditions with : and finalizes selectors", () => {
		const adapter = createPandaAdapter({
			propClasses,
			conditions: examplePreset.conditions,
		});
		expect(adapter.toClassName("_hover__backgroundColor", "red.500")).toBe("hover:bg_red.500");
		expect(adapter.toClassName("_dark___hover__color", "red.500")).toBe("dark:hover:text_red.500");
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
			"supportHover:text_red.500",
		);
		// Raw &/at-rule paths (not in the condition map) are bracketed.
		expect(adapter.toClassName("&:focus__color", "red.500")).toBe("[&:focus]:text_red.500");
	});

	test("prepends an optional prefix with -", () => {
		const adapter = createPandaAdapter({ propClasses, prefix: "ui" });
		expect(adapter.toClassName("backgroundColor", "red.500")).toBe("ui-bg_red.500");
	});

	test("an empty prefix matches Panda's unprefixed output", async () => {
		const oracle = await pandaOracle({ prefix: "" });
		const adapter = createPandaAdapter({ propClasses: oracle.propClasses, prefix: "" });
		expect(adapter.toClassName("color", "red.500")).toBe(oracle.css({ color: "red.500" }));
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
		const css = createUnsafeCss({ className: adapter });
		expect(css.class({ color: "red.500", margin: "8px" })).toBe("text_red.500 m_8px");
	});
});
