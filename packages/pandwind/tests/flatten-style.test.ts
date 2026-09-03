import { describe, expect, test } from "vitest";
import { flatten, flattenStyle } from "../src/lib/utils.ts";

describe("owned style flattener", () => {
	test("keeps flat declarations on the fast path", () => {
		const style = { color: "red", padding: 4 };

		expect(flattenStyle(style)).toBe(style);
		expect(flattenStyle(style)).toMatchInlineSnapshot(`
			{
			  "color": "red",
			  "padding": 4,
			}
		`);
	});

	test("flattens nested objects and arrays with the style separator", () => {
		expect(
			flattenStyle({
				_hover: { _dark: { color: "green" } },
				font: ["sans", "serif"],
			} as never),
		).toMatchInlineSnapshot(`
			{
			  "_hover___dark__color": "green",
			  "font__0": "sans",
			  "font__1": "serif",
			}
		`);
	});

	test("omits nullish leaves but preserves false, zero, and empty strings", () => {
		expect(
			flattenStyle({
				nullValue: null,
				undefinedValue: undefined,
				falseValue: false,
				zeroValue: 0,
				emptyValue: "",
			} as never),
		).toMatchInlineSnapshot(`
			{
			  "emptyValue": "",
			  "falseValue": false,
			  "zeroValue": 0,
			}
		`);
	});

	test("preserves array positions while omitting holes and nullish values", () => {
		const values = ["first", null, undefined, undefined, "last"];

		expect(flatten({ values })).toMatchInlineSnapshot(`
			{
			  "values__0": "first",
			  "values__4": "last",
			}
		`);
	});

	test("returns an empty object for non-object roots", () => {
		expect(flatten("not-a-style")).toEqual({});
		expect(flatten(null)).toEqual({});
	});
});
