import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

describe("Tamagui adapter", () => {
	test("converts a documented static styled definition without inventing defaults", () => {
		const source = [
			'import { View, styled } from "@tamagui/core";',
			'export const Card = styled(View, { color: "red", padding: 16 });',
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tamagui,
			to: CodemodAdapterId.Pandwind,
			file: "Card.tsx",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ padding: 16, color: "red" })');
		expect(result.code).not.toContain('from "@tamagui/core"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const Card = css.class({ padding: 16, color: "red" });"
		`);
	});

	test("keeps runtime theme callbacks visible as residuals", () => {
		const source = [
			'import { View, styled } from "tamagui";',
			"export const Card = styled(View, ({ theme }) => ({ color: theme.color }));",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tamagui,
			to: CodemodAdapterId.Pandwind,
			file: "Card.tsx",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});
		expect(result.changed).toBe(true);
		expect(result.code).not.toBe(source);
		expect(result.residuals.length).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "function-dynamic" })]),
		);
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { View, styled } from "tamagui";
			export const Card = // pandwind:migrate-skip (route: tamagui -> pandwind | parse-residual: function-dynamic | available: named-map, residual)
			styled(View, ({ theme }) => ({ color: theme.color }));",
			  "converted": 0,
			  "dependencies": [
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			  ],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [
			        "dynamic-and-theme",
			      ],
			      "availableRepresentations": [
			        "named-map",
			        "residual",
			      ],
			      "program": {
			        "canonicalization": undefined,
			        "compositions": [],
			        "declarations": [],
			        "emissionHints": [],
			        "plugins": [],
			        "residuals": [
			          {
			            "hint": "Tamagui function-valued styles require a theme/props wrapper",
			            "kind": "function-dynamic",
			            "text": "({ theme }) => ({ color: theme.color })",
			          },
			        ],
			        "rules": [],
			        "runtime": undefined,
			        "schema": "pandwind.style-program/4",
			        "source": {
			          "adapter": "tamagui",
			          "end": 113,
			          "file": "Card.tsx",
			          "start": 60,
			          "subject": "View",
			        },
			        "sourceMap": [
			          {
			            "adapter": "tamagui",
			            "end": 113,
			            "file": "Card.tsx",
			            "start": 60,
			            "subject": "View",
			          },
			        ],
			        "themes": undefined,
			      },
			      "representation": "residual",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "detail": "semantic residual remains after lowering",
			      "outcome": "residual",
			      "representation": "residual",
			      "sourceStart": 60,
			      "sourceText": "styled(View, ({ theme }) => ({ color: theme.color }))",
			    },
			  ],
			  "reports": [
			    {
			      "adapter": "pandwind",
			      "blockers": [],
			      "convertible": true,
			      "exact": [
			        {
			          "blocking": false,
			          "capability": "components",
			          "detail": "component subject: View",
			          "level": "exact",
			        },
			      ],
			      "mode": "safe",
			      "partial": [],
			      "requirements": [
			        {
			          "capability": "components",
			          "detail": "component subject: View",
			        },
			      ],
			      "unsupported": [],
			    },
			  ],
			  "residuals": [
			    {
			      "hint": "Tamagui function-valued styles require a theme/props wrapper",
			      "kind": "function-dynamic",
			      "text": "({ theme }) => ({ color: theme.color })",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("does not detect unrelated styled functions", () => {
		const source = 'const styled = (value: unknown) => value; styled({ color: "red" });';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tamagui,
			to: CodemodAdapterId.Pandwind,
			file: "unrelated.ts",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		expect(result.code).toBe(source);
	});

	test("reports project token configuration instead of pretending defaults are complete", () => {
		const source = [
			'import { createTamagui, createTokens } from "tamagui";',
			'const tokens = createTokens({ color: { brand: "#07c" } });',
			"export const config = createTamagui({ tokens });",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tamagui,
			to: CodemodAdapterId.Pandwind,
			file: "tamagui.config.ts",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "configuration",
					text: expect.stringContaining("createTokens"),
				}),
			]),
		);
		expect(result.code).toContain('color: { brand: "#07c" }');
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "// pandwind:migrate-skip (route: tamagui -> pandwind | parse-residual: configuration)
			import { createTamagui, createTokens } from "tamagui";
			const tokens = createTokens({ color: { brand: "#07c" } });
			export const config = createTamagui({ tokens });",
			  "converted": 0,
			  "dependencies": [
			    {
			      "packages": [
			        {
			          "kind": "runtime",
			          "name": "pandwind",
			        },
			      ],
			    },
			  ],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [],
			  "outcomes": [
			    {
			      "detail": "source parser produced an unpreserved residual",
			      "outcome": "residual",
			      "representation": "residual",
			      "sourceStart": 0,
			      "sourceText": "import { createTamagui, createTokens } from "tamagui";
			const tokens = createTokens({ color: { brand: "#07c" } });
			export const config = createTamagui({ tokens });",
			    },
			  ],
			  "reports": [],
			  "residuals": [
			    {
			      "hint": "Tamagui tokens and compiler configuration require official project context",
			      "kind": "configuration",
			      "text": "createTamagui({ tokens })",
			    },
			    {
			      "hint": "Tamagui tokens and compiler configuration require official project context",
			      "kind": "configuration",
			      "text": "createTokens({ color: { brand: "#07c" } })",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});
});
