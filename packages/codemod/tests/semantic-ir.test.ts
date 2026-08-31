import { describe, expect, test } from "vitest";
import {
	STYLE_PROGRAM_SCHEMA,
	inferSemanticConditionKind,
	styleProgramFromRules,
	styleProgramFromSourceObject,
	styleProgramFromSwapIR,
	styleProgramToCanonicalCss,
	swapIRFromStyleProgram,
} from "../src/swap/semantic-ir.ts";

describe("versioned semantic style-program IR", () => {
	test("folds literal arithmetic and conditional expressions before lowering", () => {
		const program = styleProgramFromSourceObject(
			"padding: 2 + 2, color: true ? 'red' : 'blue', opacity: 1 / 2, width: `calc(${2 + 2}px)`",
		);

		expect(program.residuals).toEqual([]);
		expect(program.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ property: "padding", value: { kind: "literal", value: 4 } }),
				expect.objectContaining({ property: "color", value: { kind: "literal", value: "red" } }),
				expect.objectContaining({ property: "opacity", value: { kind: "literal", value: 0.5 } }),
				expect.objectContaining({
					property: "width",
					value: { kind: "literal", value: "calc(4px)" },
				}),
			]),
		);
	});

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
		expect(program.rules[0]).toMatchObject({ kind: "style", order: 0 });
		expect(program.declarations[0]).toEqual({
			conditions: [
				{ kind: "pseudo", name: "hover" },
				{ kind: "media", name: "sm" },
			],
			property: "color",
			value: { kind: "token", ref: "blue-500", authored: "$blue-500" },
		});
		expect(program.source?.file).toBe("Card.tsx");
		expect(program.sourceMap).toContainEqual(program.source);
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
			rules: [
				{
					...program.rules[0]!,
					declarations: [
						{
							conditions: [],
							property: "color",
							value: { kind: "dynamic" as const, expression: "theme.foreground" },
						},
					],
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
		expect(program.sourceMap?.some((source) => source.start !== undefined)).toBe(true);
		expect(inferSemanticConditionKind("@supports (display: grid)")).toBe("supports");
		expect(styleProgramToCanonicalCss(program)).toBe(
			"&{color:theme.foreground}&:hover{backgroundColor:palette.accent}@media (min-width: 40rem){&{opacity:0.8}}",
		);
	});

	test("folds statically-known CSS variable references in source templates", () => {
		const program = styleProgramFromSourceObject(
			"color: `color-mix(in srgb, ${vars['--foreground']} 80%, transparent)`, background: vars['--background']",
		);

		expect(program.residuals).toEqual([]);
		expect(program.declarations.map((declaration) => declaration.value)).toEqual([
			{ kind: "literal", value: "color-mix(in srgb, var(--foreground) 80%, transparent)" },
			{ kind: "literal", value: "var(--background)" },
		]);
	});

	test("accepts TypeScript-asserted literal computed keys", () => {
		const program = styleProgramFromSourceObject("['--layout-offset' as any]: '8px'");

		expect(program.residuals).toEqual([]);
		expect(program.declarations[0]).toMatchObject({
			property: "--layout-offset",
			value: { kind: "literal", value: "8px" },
		});
	});

	test("resolves computed condition identifiers supplied by a source adapter", () => {
		const program = styleProgramFromSourceObject(
			"card: { display: { [TABLET_BREAK]: 'block', default: 'none' } }",
			{
				conditionValues: { TABLET_BREAK: "@media (max-width: 768px)" },
				propertyValueConditions: true,
				nestedObjectKind: "named",
			},
		);

		expect(program.residuals).toEqual([]);
		expect(program.declarations).toMatchObject([
			{
				property: "display",
				value: { kind: "literal", value: "block" },
				conditions: [{ name: "card" }, { name: "@media (max-width: 768px)" }],
			},
			{
				property: "display",
				value: { kind: "literal", value: "none" },
				conditions: [{ name: "card" }],
			},
		]);
	});

	test("recognizes the base branch in property-value conditions", () => {
		const program = styleProgramFromSourceObject("gap: { base: 12, lg: 20 }", {
			conditionKinds: { lg: "named" },
			propertyValueConditions: true,
		});

		expect(program.residuals).toEqual([]);
		expect(program.declarations).toMatchObject([
			{ property: "gap", value: { kind: "literal", value: 12 }, conditions: [{ name: "base" }] },
			{ property: "gap", value: { kind: "literal", value: 20 }, conditions: [{ name: "lg" }] },
		]);
	});

	test("treats signed numeric literals as static values", () => {
		const program = styleProgramFromSourceObject("marginTop: -2");

		expect(program.residuals).toEqual([]);
		expect(program.declarations[0]).toMatchObject({
			property: "marginTop",
			value: { kind: "literal", value: -2 },
		});
	});

	test("lifts StyleX property-value conditions at the root of a named style", () => {
		const program = styleProgramFromSourceObject(
			"card: { boxShadow: { default: 'none', ':focus-visible': '0 0 0 2px red' } }",
			{ nestedObjectKind: "named", propertyValueConditions: true, preserveDefaultGroup: true },
		);

		expect(program.residuals).toEqual([]);
		expect(program.declarations).toMatchObject([
			{
				property: "boxShadow",
				value: { kind: "literal", value: "none" },
				conditions: [{ name: "card" }],
			},
			{
				property: "boxShadow",
				value: { kind: "literal", value: "0 0 0 2px red" },
				conditions: [{ name: "card" }, { kind: "selector", name: ":focus-visible" }],
			},
		]);
	});

	test("preserves rule-level CSS constructs and canonical ordering", () => {
		const program = styleProgramFromRules([
			{
				kind: "global",
				selector: "body",
				conditions: [],
				declarations: [
					{ conditions: [], property: "margin", value: { kind: "literal", value: 0 } },
				],
				order: 2,
			},
			{
				kind: "keyframes",
				name: "fade",
				conditions: [],
				declarations: [],
				children: [
					{
						kind: "style",
						selector: "from",
						conditions: [],
						declarations: [
							{ conditions: [], property: "opacity", value: { kind: "literal", value: 0 } },
						],
						children: [],
						order: 0,
					},
				],
				order: 1,
			},
		]);

		expect(program.rules.map((rule) => rule.kind)).toEqual(["keyframes", "global"]);
		expect(styleProgramToCanonicalCss(program)).toBe(
			"@keyframes fade{from{opacity:0}}body{margin:0}",
		);
	});

	test("does not flatten selectors or nested rules through the legacy bridge", () => {
		const program = styleProgramFromRules([
			{
				kind: "style",
				selector: "&",
				conditions: [],
				declarations: [
					{ conditions: [], property: "color", value: { kind: "literal", value: "red" } },
				],
				children: [
					{
						kind: "style",
						selector: "&:hover",
						conditions: [],
						declarations: [
							{ conditions: [], property: "color", value: { kind: "literal", value: "blue" } },
						],
						children: [],
						order: 0,
					},
				],
				order: 0,
			},
		]);

		const lowered = swapIRFromStyleProgram(program);
		expect(lowered.entries).toEqual([]);
		expect(lowered.residuals).toEqual([
			{
				kind: "unrepresentable",
				text: "&",
				hint: "rich semantic structure requires a rule-capable target",
			},
		]);
	});

	test("unwraps adapter-owned object containers without inventing conditions", () => {
		const program = styleProgramFromSourceObject(
			`color: "red", selectors: { "&:hover": { color: "blue" } }`,
			{ unwrapNestedObjectKeys: ["selectors"] },
		);

		expect(program.residuals).toEqual([]);
		expect(program.declarations.map((declaration) => declaration.conditions[0]?.name)).toEqual([
			undefined,
			"&:hover",
		]);
	});
});
