import { describe, expect, test } from "vitest";
import {
	StyleProgramBuilder,
	styleProgramFromRules,
	styleProgramToCanonicalCss,
} from "../src/swap/index.ts";

describe("semantic cascade conformance", () => {
	test("canonical CSS resolves shorthand groups independently of authored order", () => {
		const declarations = [
			{ conditions: [], property: "marginTop", value: StyleProgramBuilder.literal("2px") },
			{ conditions: [], property: "margin", value: StyleProgramBuilder.literal("1px") },
			{ conditions: [], property: "paddingInline", value: StyleProgramBuilder.literal("4px") },
			{ conditions: [], property: "padding", value: StyleProgramBuilder.literal("3px") },
		] as const;
		const reverse = declarations.toReversed();
		const forwardProgram = styleProgramFromRules([
			{ kind: "style", conditions: [], declarations, children: [], order: 0 },
		]);
		const reverseProgram = styleProgramFromRules([
			{ kind: "style", conditions: [], declarations: reverse, children: [], order: 0 },
		]);

		const forward = styleProgramToCanonicalCss(forwardProgram);
		const backward = styleProgramToCanonicalCss(reverseProgram);
		expect(forward).toBe(backward);
		expect(forward).toMatchInlineSnapshot(
			`"&{margin:1px;padding:3px;paddingInline:4px;marginTop:2px}"`,
		);
		expect(forward).toContain("margin:1px");
		expect(forward).toContain("marginTop:2px");
		expect(forward).toContain("padding:3px");
		expect(forward).toContain("paddingInline:4px");
		expect(forward.indexOf("margin:1px")).toBeLessThan(forward.indexOf("marginTop:2px"));
		expect(forward.indexOf("padding:3px")).toBeLessThan(forward.indexOf("paddingInline:4px"));
	});

	test("same-property declarations retain authored last-wins order", () => {
		const program = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [
					{ conditions: [], property: "color", value: { kind: "literal", value: "red" } },
					{ conditions: [], property: "color", value: { kind: "literal", value: "blue" } },
				],
				children: [],
				order: 0,
			},
		]);

		const css = styleProgramToCanonicalCss(program);
		expect(css).toMatchInlineSnapshot(`"&{color:red;color:blue}"`);
		expect(css.endsWith("color:blue}"), css).toBe(true);
	});
});
