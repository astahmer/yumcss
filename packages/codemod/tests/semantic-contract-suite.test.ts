import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	StyleProgramCompositionKind,
	createBuiltinCodemodCatalog,
	createSemanticContractSuite,
	styleProgramFromRules,
	styleProgramFromSourceObject,
} from "../src/swap/index.ts";

const literal = (property: string, value: string) => ({
	conditions: [],
	property,
	value: { kind: "literal" as const, value },
});

const fixtures = [
	{
		name: "rule-level constructs",
		program: styleProgramFromRules([
			{
				kind: "global" as const,
				selector: ":root",
				conditions: [],
				declarations: [literal("color", "red")],
				children: [],
			},
			{
				kind: "keyframes" as const,
				name: "fade",
				conditions: [],
				declarations: [],
				children: [
					{
						kind: "style" as const,
						selector: "from",
						conditions: [],
						declarations: [literal("opacity", "0")],
						children: [],
						order: 0,
					},
				],
			},
			{
				kind: "layer" as const,
				name: "components",
				conditions: [],
				declarations: [literal("color", "blue")],
				children: [],
			},
		]),
	},
	{
		name: "conditions and named map",
		program: styleProgramFromSourceObject(
			"button: { color: 'red', hover: { color: 'blue' }, '@media (min-width: 40rem)': { padding: '1rem' } }",
			{ namedRuleObjects: true },
		),
	},
	{
		name: "dynamic semantic context",
		program: styleProgramFromSourceObject(
			"color: (props) => props.color, padding: theme.space.md",
			{
				source: {
					file: "Card.tsx",
					adapter: CodemodAdapterId.StyledComponents,
					framework: "react",
				},
				themes: [{ path: "space.md", authored: "theme.space.md" }],
				compositions: [{ kind: StyleProgramCompositionKind.Mixin, reference: "surface" }],
				runtime: { phase: "render", framework: "react", dependencies: ["props", "theme"] },
				plugins: [{ id: "resolve-theme", input: "theme.space.md", output: "theme.spacing.md" }],
			},
		),
	},
] as const;

describe("semantic capability contract suite", () => {
	test("gives every registered target either validation or explicit residual evidence", () => {
		const catalog = createBuiltinCodemodCatalog();
		const report = createSemanticContractSuite(catalog.registry).run(fixtures);
		expect(report.cases).toHaveLength(fixtures.length * catalog.adapters.length * 2);
		expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
		expect(report.validated).toBeGreaterThan(0);
		expect(report.explicitResiduals).toBeGreaterThan(0);
	});
});
