import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createTamaguiAdapter,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

describe("Tamagui adapter", () => {
	test.each([
		{
			name: "missing compiler",
			compiler: undefined,
			hint: "the official @tamagui/static compiler is unavailable for a discovered config",
		},
		{
			name: "compiler without project evaluation",
			compiler: {},
			hint: "the official Tamagui compiler was detected but did not evaluate the discovered project config",
		},
	] as const)("fails closed for a discovered config with $name", async ({ compiler, hint }) => {
		const adapter = createTamaguiAdapter({
			moduleLoader: {
				async importPackage<T>() {
					return compiler as T | undefined;
				},
				async importFile() {
					return undefined;
				},
			},
		});
		const config = await adapter.loadConfigAsync?.({
			file: "src/App.tsx",
			source: "",
			root: "/project",
			readFile: (file) => (file.endsWith("tamagui.config.ts") ? "export default {};" : undefined),
			listFiles: () => ["/project/tamagui.config.ts"],
		});

		expect(config?.values.officialCompiler).toBe(
			compiler === undefined ? "unavailable" : "available",
		);
		expect(config?.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				text: "Tamagui project configuration",
				hint,
			}),
		]);
	});

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
		expect(result.code).toContain('style: css.class({ color: "red", padding: 16 })');
		expect(result.code).toContain('import { View } from "@tamagui/core";');
		expect(result.code).toMatchInlineSnapshot(`
			"import { View } from "@tamagui/core";
			import { createUnsafeCss } from "pandwind/unsafe/css";
			import { createCx } from "pandwind/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __pandwindSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, filteredPropPrefixes, attrs, joinClass }) => { const component = (props) => { const Component = attrs.as ?? props.as ?? defaultComponent; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = filteredPropPrefixes.length === 0 ? { ...rest, ...attrsProps } : Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !filteredPropPrefixes.some((prefix) => key.startsWith(prefix)))); return <Component {...forwarded} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, attrs[classAttribute], props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };
			export const Card = __pandwindSlot({ defaultComponent: (View), style: css.class({ color: "red", padding: 16 }), stableClass: "pw-1fn70s4", inheritedClass: undefined, classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx });"
		`);
	});

	test("hoists one reusable slot helper for multiple static components", () => {
		const source = [
			'import { View, styled } from "@tamagui/core";',
			'export const Card = styled(View, { color: "red" });',
			"export const Panel = styled(View, { padding: 16 });",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tamagui,
			to: CodemodAdapterId.Pandwind,
			file: "components.tsx",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code.match(/const __pandwindSlot\s*=/gu)).toHaveLength(1);
		expect(result.code.match(/__pandwindSlot\(/gu)).toHaveLength(2);
		expect(result.code).toContain("export const Card = __pandwindSlot(");
		expect(result.code).toContain("export const Panel = __pandwindSlot(");
		expect(result.code).not.toContain("export const Card = (() =>");
	});

	test("shares a generated slot module across migrated files", () => {
		const migrate = (file: string, source: string) =>
			runAdapterMigration(source, {
				from: CodemodAdapterId.Tamagui,
				to: CodemodAdapterId.Pandwind,
				file,
				root: "/project",
				mode: "safe",
				adapterRegistry: catalog.registry,
			});
		const card = migrate(
			"src/Card.tsx",
			'import { View, styled } from "@tamagui/core";\nexport const Card = styled(View, { color: "red" });',
		);
		const panel = migrate(
			"src/components/Panel.tsx",
			'import { View, styled } from "@tamagui/core";\nexport const Panel = styled(View, { padding: 16 });',
		);

		expect(card.code).toContain('import { __pandwindSlot } from "../__pandwind/slot";');
		expect(panel.code).toContain('import { __pandwindSlot } from "../../__pandwind/slot";');
		expect(card.code).not.toContain("const __pandwindSlot =");
		expect(panel.code).not.toContain("const __pandwindSlot =");
		expect(card.code).toContain(
			'__pandwindSlot({ defaultComponent: (View), style: css.class({ color: "red" }),',
		);
		expect(panel.code).toContain(
			"__pandwindSlot({ defaultComponent: (View), style: css.class({ padding: 16 }),",
		);
		expect(card.generatedFiles).toEqual(panel.generatedFiles);
		expect(card.generatedFiles).toHaveLength(1);
		expect(card.generatedFiles[0]).toMatchObject({
			path: "__pandwind/slot.tsx",
			purpose: "shared static component slot helper",
		});
		expect(card.generatedFiles[0]?.content).toContain(
			"export const __pandwindSlot = <DefaultComponent extends ElementType",
		);
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
			// pandwind:migrate-skip (route: tamagui -> pandwind | parse-residual: function-dynamic | available: named-map, residual)
			export const Card = styled(View, ({ theme }) => ({ color: theme.color }));",
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
			      "applied": [],
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
			        "schema": "pandwind.style-program/5",
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
			        "themes": [],
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
