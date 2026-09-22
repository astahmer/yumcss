import { describe, expect, test } from "vitest";
import { tokenSetCodec as tokens } from "../src/swap/token-set.ts";

describe("StyleX defineVars token format", () => {
	test("imports scalar variables from named and namespace bindings", () => {
		const set = tokens.fromStylexVars(`
// stylex.defineVars({ ignored: "comment" });
import * as stylex from "@stylexjs/stylex";
import { defineVars as vars } from "@stylexjs/stylex";
export const colors = stylex.defineVars({ blue: "#3182ce" /* keep */, white: "#fff" });
export const spacing = vars({ sm: 4, md: "8px", dark: { default: "4px", "@media (min-width: 1px)": "8px" } });
`);

		expect(set.groups).toEqual({
			colors: { blue: "#3182ce", white: "#fff" },
			spacing: { sm: "4", md: "8px" },
		});
	});

	test("supports default StyleX imports and round-trips static values", () => {
		const set = tokens.fromStylexVars(`
import stylex from "@stylexjs/stylex";
export const radii = stylex.defineVars({ sm: "4px" });
`);
		const output = tokens.toStylexVars(set);
		expect(output).toContain("export const radii = defineVars");
		expect(output).toContain('"sm": "4px"');
	});

	test("fails clearly when only conditional values are present", () => {
		expect(() =>
			tokens.fromStylexVars(`
import { defineVars } from "@stylexjs/stylex";
export const colors = defineVars({ brand: { default: "red", dark: "blue" } });
`),
		).toThrow("no static scalar values");
	});
});
