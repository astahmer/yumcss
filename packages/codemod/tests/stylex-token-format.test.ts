import { describe, expect, test } from "vitest";
import { tokenDocumentCodec as tokens } from "../src/swap/token-document-codec.ts";

describe("StyleX defineVars token format", () => {
	test("imports scalar variables from named and namespace bindings", () => {
		const document = tokens.fromText(
			"stylex",
			`
// stylex.defineVars({ ignored: "comment" });
import * as stylex from "@stylexjs/stylex";
import { defineVars as vars } from "@stylexjs/stylex";
export const colors = stylex.defineVars({ blue: "#3182ce" /* keep */, white: "#fff" });
export const spacing = vars({ sm: 4, md: "8px", dark: { default: "4px", "@media (min-width: 1px)": "8px" } });
`,
		);

		expect(document.root.children).toMatchObject({
			colors: {
				kind: "group",
				children: {
					blue: { kind: "token", value: { kind: "string", value: "#3182ce" } },
					white: { kind: "token", value: { kind: "string", value: "#fff" } },
				},
			},
			spacing: {
				kind: "group",
				children: {
					sm: { kind: "token", value: { kind: "string", value: "4" } },
					md: { kind: "token", value: { kind: "string", value: "8px" } },
				},
			},
		});
		expect(document.sourceLosses).toEqual([
			{
				path: "/spacing/sm",
				feature: "number value",
				reason: "importer stores scalar values as strings",
			},
			{
				path: "/spacing/dark",
				feature: "dynamic value",
				reason: "StyleX importer preserves static values only",
			},
		]);
	});

	test("supports default StyleX imports and round-trips static values", () => {
		const document = tokens.fromText(
			"stylex",
			`
import stylex from "@stylexjs/stylex";
export const radii = stylex.defineVars({ sm: "4px" });
`,
		);
		const output = tokens.to("stylex", document).text;
		expect(output).toContain("export const radii = defineVars");
		expect(output).toContain('"sm": "4px"');
	});

	test("fails clearly when only conditional values are present", () => {
		expect(() =>
			tokens.fromText(
				"stylex",
				`
import { defineVars } from "@stylexjs/stylex";
export const colors = defineVars({ brand: { default: "red", dark: "blue" } });
`,
			),
		).toThrow("no static scalar values");
	});
});
