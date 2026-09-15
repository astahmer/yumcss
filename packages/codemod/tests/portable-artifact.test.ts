import { describe, expect, test } from "vitest";
import { PortableStyleArtifact } from "../src/swap/portable-artifact.ts";
import { styleProgramFromRules, styleProgramFromSourceObject } from "../src/swap/semantic-ir.ts";

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

	test("emits static artifacts through css.class and dynamic artifacts through css.vars", () => {
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
		const staticEmission = PortableStyleArtifact.emission(staticProgram);
		expect(staticEmission).toEqual({
			text: 'css.class({ "color": "red" })',
			imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
		});

		const dynamicEmission = PortableStyleArtifact.emission(
			PortableStyleArtifact.restoreDynamicValues(program, [
				{ kind: "dynamic-custom-property", text: "theme.foreground" },
			]),
		);
		expect(dynamicEmission.text).toContain("css.vars");
		expect(dynamicEmission.imports).toContain('import { createCss } from "pandwind/css";');
		expect(dynamicEmission.imports).not.toContain(
			'import { createRuntimeCss } from "pandwind/css/runtime";',
		);
	});

	test("keeps finite literal conditionals on the static class path", () => {
		const conditionalProgram = styleProgramFromSourceObject(
			'color: noHistoricalData ? "fg.muted" : "red"',
			{ source: { file: "SyncCell.tsx", adapter: "chakra" } },
		);

		const emission = PortableStyleArtifact.emission(conditionalProgram);

		expect(emission.text).toContain("css.class");
		expect(emission.text).not.toContain("css.vars");
	});
});
