import { describe, expect, test } from "vitest";
import { StyleProgramAnalysis } from "../src/swap/style-program-analysis.ts";
import { styleProgramFromRules } from "../src/swap/semantic-ir.ts";

describe("StyleProgramAnalysis", () => {
	test("answers dynamic queries across nested rules without a bound receiver", () => {
		const program = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [],
				children: [
					{
						kind: "style",
						conditions: [],
						declarations: [
							{
								conditions: [],
								property: "color",
								value: { kind: "dynamic", expression: "(props) => props.color" },
							},
						],
						children: [],
						order: 0,
					},
				],
			},
		]);

		const hasDynamic = StyleProgramAnalysis.hasDynamic;
		const hasFunctionDynamic = StyleProgramAnalysis.hasFunctionDynamic;
		expect(hasDynamic(program)).toBe(true);
		expect(hasFunctionDynamic(program)).toBe(true);
		expect(StyleProgramAnalysis.rules(program)).toHaveLength(2);
	});

	test("does not classify a static program as dynamic", () => {
		const program = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [
					{
						conditions: [],
						property: "color",
						value: { kind: "literal", value: "red" },
					},
				],
			},
		]);

		expect(StyleProgramAnalysis.hasDynamic(program)).toBe(false);
		expect(StyleProgramAnalysis.hasFunctionDynamic(program)).toBe(false);
	});

	test("keeps the root declaration projection for rule-less programs", () => {
		const program = styleProgramFromRules([]);
		const declaration = {
			conditions: [],
			property: "color",
			value: { kind: "dynamic" as const, expression: "theme.color" },
		};
		const legacyProjection = { ...program, declarations: [declaration] };

		expect(StyleProgramAnalysis.declarations(legacyProjection)).toEqual([declaration]);
		expect(StyleProgramAnalysis.hasDynamic(legacyProjection)).toBe(true);
	});
});
