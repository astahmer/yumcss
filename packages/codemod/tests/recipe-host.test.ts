import { describe, expect, test } from "vitest";
import {
	detectHostFramework,
	getHostFrameworkAdapter,
	resolveStyleRecipe,
	STYLE_PROGRAM_SCHEMA,
	STYLE_RECIPE_SCHEMA,
	type StyleRecipeProgram,
} from "../src/swap/index.ts";
import type { StyleProgram } from "../src/swap/semantic-ir.ts";

const style = (property: string, value: string): StyleProgram => ({
	schema: STYLE_PROGRAM_SCHEMA,
	rules: [
		{
			kind: "style",
			conditions: [],
			declarations: [{ conditions: [], property, value: { kind: "literal", value } }],
			children: [],
			order: 0,
		},
	],
	declarations: [{ conditions: [], property, value: { kind: "literal", value } }],
	residuals: [],
});

describe("recipe and host-framework pivot semantics", () => {
	test("resolves recipe defaults and compound variants into slot programs", () => {
		const recipe: StyleRecipeProgram = {
			schema: STYLE_RECIPE_SCHEMA,
			base: style("display", "flex"),
			slots: { root: style("padding", "2"), label: style("fontSize", "1") },
			variants: [{ name: "size", values: { lg: style("padding", "6") } }],
			defaultVariants: { size: "lg" },
			compoundVariants: [{ conditions: { size: "lg" }, program: style("fontWeight", "bold")! }],
		};
		const resolved = resolveStyleRecipe(recipe);
		expect(resolved.selection).toEqual({ size: "lg" });
		expect(resolved.base?.declarations.map((declaration) => declaration.property)).toEqual([
			"display",
			"padding",
			"fontWeight",
		]);
	});

	test("adapts class bindings across host syntax families", () => {
		expect(detectHostFramework("import { createSignal } from 'solid-js'", "Card.tsx")?.id).toBe(
			"solid",
		);
		expect(detectHostFramework("<template></template>", "Card.vue")?.id).toBe("vue");
		expect(getHostFrameworkAdapter("react")?.mergeClass("existing", "generated")).toBe(
			'className={cx("existing", generated)}',
		);
		expect(getHostFrameworkAdapter("svelte")?.classBinding("generated")).toBe("class={generated}");
	});
});
