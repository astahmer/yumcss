import { describe, expect, test } from "vitest";
import { PortableStyleArtifact } from "../src/swap/portable-artifact.ts";
import { styleProgramFromRules } from "../src/swap/semantic-ir.ts";

const program = styleProgramFromRules([
	{
		kind: "style",
		conditions: [],
		declarations: [
			{
				conditions: [],
				property: "color",
				value: { kind: "literal", value: "var(--pandwind-dynamic-5qa8dh)" },
			},
		],
		children: [
			{
				kind: "style",
				selector: "&:hover",
				conditions: [],
				declarations: [
					{
						conditions: [],
						property: "background",
						value: { kind: "literal", value: "var(--unowned-dynamic)" },
					},
				],
				children: [],
				order: 0,
			},
		],
		order: 0,
	},
]);

describe("PortableStyleArtifact", () => {
	test("restores only Pandwind-owned dynamic placeholders, including nested rules", () => {
		const restored = PortableStyleArtifact.restoreDynamicValues(program, [
			{ kind: "dynamic-custom-property", text: "theme.foreground" },
		]);

		expect(restored.rules[0]?.declarations[0]?.value).toEqual({
			kind: "dynamic",
			expression: "theme.foreground",
			lowering: "runtime",
		});
		expect(restored.rules[0]?.children[0]?.declarations[0]?.value).toEqual({
			kind: "literal",
			value: "var(--unowned-dynamic)",
		});
		expect(PortableStyleArtifact.containsDynamicValues(restored)).toBe(true);
	});

	test("does not claim static programs are dynamic", () => {
		const staticProgram = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [
					{ conditions: [], property: "color", value: { kind: "literal", value: "red" } },
				],
				children: [],
				order: 0,
			},
		]);
		expect(PortableStyleArtifact.containsDynamicValues(staticProgram)).toBe(false);
	});
});
