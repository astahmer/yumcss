import { describe, expect, test } from "vitest";
import { StyleProgramAnalysis } from "../src/swap/style-program-analysis.ts";
import { styleProgramFromRules, styleProgramFromSourceObject } from "../src/swap/semantic-ir.ts";

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

	test("distinguishes scalar dynamic values from function values", () => {
		const program = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [
					{
						conditions: [],
						property: "color",
						value: { kind: "dynamic", expression: "theme.color" },
					},
				],
			},
		]);

		expect(StyleProgramAnalysis.hasScalarDynamic(program)).toBe(true);
		expect(StyleProgramAnalysis.hasFunctionDynamic(program)).toBe(false);
	});

	test("keeps finite literal conditional values out of the runtime carrier", () => {
		const program = styleProgramFromSourceObject('color: noHistoricalData ? "fg.muted" : "red"', {
			source: { file: "SyncCell.tsx", adapter: "chakra" },
		});

		expect(program.declarations[0]?.value).toMatchObject({ expressionKind: "conditional" });
		expect(StyleProgramAnalysis.hasDynamic(program)).toBe(true);
		expect(StyleProgramAnalysis.hasRuntimeDynamic(program)).toBe(false);
	});

	test("keeps finite literal object values out of the runtime carrier", () => {
		const program = styleProgramFromSourceObject('minWidth: { base: "full", md: "260px" }', {
			source: { file: "Filters.tsx", adapter: "chakra" },
		});

		expect(program.declarations[0]?.value).toMatchObject({ expressionKind: "object" });
		expect(StyleProgramAnalysis.hasDynamic(program)).toBe(true);
		expect(StyleProgramAnalysis.hasRuntimeDynamic(program)).toBe(false);
	});

	test("keeps unresolved values inside literal objects on the runtime path", () => {
		const program = styleProgramFromSourceObject('minWidth: { base: theme.width, md: "260px" }', {
			source: { file: "Filters.tsx", adapter: "chakra" },
		});

		expect(program.declarations[0]?.value).toMatchObject({ expressionKind: "object" });
		expect(StyleProgramAnalysis.hasRuntimeDynamic(program)).toBe(true);
	});

	test("keeps non-condition objects and arrays on the runtime path", () => {
		for (const body of [
			'fontFace: { fontFamily: "Inter", src: "url(inter.woff2)" }',
			'style: [{ padding: 8 }, { backgroundColor: "red" }]',
		]) {
			const program = styleProgramFromSourceObject(body, {
				source: { file: "Styles.tsx", adapter: "source" },
			});

			expect(StyleProgramAnalysis.hasRuntimeDynamic(program)).toBe(true);
		}
	});

	test("keeps the root declaration projection for rule-less programs", () => {
		const program = styleProgramFromRules([]);
		const declaration = {
			conditions: [],
			property: "color",
			value: { kind: "dynamic" as const, expression: "theme.color" },
		};
		const flatProjection = { ...program, declarations: [declaration] };

		expect(StyleProgramAnalysis.declarations(flatProjection)).toEqual([declaration]);
		expect(StyleProgramAnalysis.hasDynamic(flatProjection)).toBe(true);
	});
});
