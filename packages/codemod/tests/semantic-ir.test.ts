import { describe, expect, test } from "vitest";
import {
	STYLE_PROGRAM_SCHEMA,
	inferSemanticConditionKind,
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	swapIRFromStyleProgram,
} from "../src/swap/semantic-ir.ts";

describe("versioned semantic style-program IR", () => {
	test("lifts flat declarations without changing their lossless representation", () => {
		const ir = {
			entries: [
				{ conditions: ["hover", "sm"], prop: "color", value: "$blue-500" },
				{ conditions: [], prop: "opacity", value: 0.5 },
			],
			residuals: [{ kind: "unknown-value" as const, text: "custom-utility", hint: "bridge miss" }],
		};

		const program = styleProgramFromSwapIR(ir, {
			conditionKinds: { hover: "pseudo", sm: "media" },
			source: { file: "Card.tsx", start: 10, end: 80, adapter: "pandwind" },
		});

		expect(program.schema).toBe(STYLE_PROGRAM_SCHEMA);
		expect(program.declarations[0]).toEqual({
			conditions: [
				{ kind: "pseudo", name: "hover" },
				{ kind: "media", name: "sm" },
			],
			property: "color",
			value: { kind: "token", ref: "blue-500", authored: "$blue-500" },
		});
		expect(program.source?.file).toBe("Card.tsx");
		expect(swapIRFromStyleProgram(program)).toEqual(ir);
	});

	test("keeps dynamic semantic declarations as explicit residuals for legacy emitters", () => {
		const program = styleProgramFromSwapIR({ entries: [], residuals: [] });
		const dynamic = {
			...program,
			declarations: [
				{
					conditions: [],
					property: "color",
					value: { kind: "dynamic" as const, expression: "theme.foreground" },
				},
			],
		};

		expect(swapIRFromStyleProgram(dynamic).residuals).toEqual([
			{
				kind: "dynamic",
				text: "theme.foreground",
				hint: "dynamic semantic declaration requires a target runtime",
			},
		]);
	});

	test("preserves dynamic source expressions and richer condition data", () => {
		const body = `color: theme.foreground, _hover: { backgroundColor: palette.accent }, "@media (min-width: 40rem)": { opacity: 0.8 }`;
		const program = styleProgramFromSourceObject(body, {
			source: { file: "Card.tsx", adapter: "css" },
			sourceOffset: 20,
			conditionValues: { hover: ":hover", "@media (min-width: 40rem)": "(min-width: 40rem)" },
		});

		expect(program.declarations).toHaveLength(3);
		expect(program.declarations[0]).toMatchObject({
			property: "color",
			value: {
				kind: "dynamic",
				expression: "theme.foreground",
				lowering: "residual",
				source: { file: "Card.tsx", start: 27, end: 43 },
			},
		});
		expect(program.declarations[1]).toMatchObject({
			conditions: [{ kind: "pseudo", name: "hover", value: ":hover" }],
			value: { kind: "dynamic", expression: "palette.accent" },
		});
		expect(program.declarations[2]).toMatchObject({
			conditions: [
				{ kind: "media", name: "@media (min-width: 40rem)", value: "(min-width: 40rem)" },
			],
			value: { kind: "literal", value: 0.8 },
		});
		expect(program.residuals).toEqual([]);
		expect(inferSemanticConditionKind("@supports (display: grid)")).toBe("supports");
	});
});
