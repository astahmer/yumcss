import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/index.ts";
import { createRecipe, createSlotRecipe } from "../src/recipe/index.ts";

describe("runtime recipes and slots", () => {
	const css = createCss();

	test("resolves base, defaults, selected variants, compounds, and className", () => {
		const button = createRecipe(css, {
			base: { display: "flex" },
			variants: {
				size: { sm: { padding: "2" }, lg: { padding: "6" } },
				kind: { primary: { color: "blue" }, quiet: { color: "gray" } },
			},
			defaultVariants: { size: "sm", kind: "primary" },
			compoundVariants: [{ when: { size: "lg", kind: "primary" }, style: { fontWeight: "bold" } }],
		});

		const defaultClass = button();
		const large = button({ size: "lg", kind: "primary", className: "external" });
		expect(defaultClass.split(" ")).toHaveLength(3);
		expect(large.split(" ")).toHaveLength(5);
		expect(large).not.toBe(defaultClass);
		expect(large).toContain("external");
	});

	test("returns stable independent slot classes", () => {
		const card = createSlotRecipe(css, {
			slots: { root: { display: "flex" }, title: { fontSize: "2" } },
			variants: { tone: { loud: { color: "red" } } },
			slotVariants: {
				tone: { loud: { root: { borderWidth: "1" }, title: { fontWeight: "bold" } } },
			},
		});
		const result = card({ tone: "loud" });
		expect(Object.keys(result)).toEqual(["root", "title"]);
		expect(result.root).not.toBe(result.title);
	});
});
