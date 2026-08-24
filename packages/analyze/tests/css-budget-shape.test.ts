/** Stylesheet shape: category/byte/specificity distributions over parsed rules. */
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { sheetShapeFromRoot } from "../src/css-budget.ts";

const css = `
.a { color: red; padding: 4px; }
.b { color: blue; }
.c:hover { color: green; }
#d.e { display: flex; border-radius: 3px; }
`;

describe("sheetShapeFromRoot", () => {
	const shape = sheetShapeFromRoot(parse(css));

	test("counts total rules and bytes", () => {
		expect(shape.totalRules).toBe(4);
		expect(shape.totalBytes).toBeGreaterThan(0);
	});

	test("categorizes declarations by property family with byte weights", () => {
		const colors = shape.categories.find((c) => c.category === "colors");
		expect(colors?.rules).toBe(3);
		const spacing = shape.categories.find((c) => c.category === "spacing");
		expect(spacing?.rules).toBe(1);
		expect(shape.categories.some((c) => c.category === "layout")).toBe(true);
		expect(shape.categories.some((c) => c.category === "borders")).toBe(true);
		// categories sorted by byte weight descending
		for (let i = 1; i < shape.categories.length; i++) {
			expect(shape.categories[i - 1]!.bytes).toBeGreaterThanOrEqual(shape.categories[i]!.bytes);
		}
	});

	test("top values per category are counted", () => {
		const colors = shape.categories.find((c) => c.category === "colors");
		expect(colors?.topValues).toContainEqual({ value: "red", count: 1 });
	});

	test("specificity histogram labels id-class-pseudo triples", () => {
		expect(shape.specificity).toContainEqual({ label: "0-1-0", rules: 2 });
		expect(shape.specificity).toContainEqual({ label: "0-1-1", rules: 1 });
		expect(shape.specificity).toContainEqual({ label: "1-1-0", rules: 1 });
	});
});
