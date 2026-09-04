import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

describe("non-CSS-in-JS source adapter contract", () => {
	test("registers each source family through the shared adapter boundary", () => {
		const adapters = [
			CodemodAdapterId.Tamagui,
			CodemodAdapterId.CssModules,
			CodemodAdapterId.Sass,
			CodemodAdapterId.Less,
			CodemodAdapterId.AuthoredCss,
			CodemodAdapterId.VanillaExtract,
		].map((id) => catalog.registry.get(id));

		expect(adapters.every((adapter) => adapter !== undefined)).toBe(true);
		expect(adapters.map((adapter) => adapter?.id)).toEqual([
			CodemodAdapterId.Tamagui,
			CodemodAdapterId.CssModules,
			CodemodAdapterId.Sass,
			CodemodAdapterId.Less,
			CodemodAdapterId.AuthoredCss,
			CodemodAdapterId.VanillaExtract,
		]);
	});

	test("preserves authored CSS when the target is the platform stylesheet", () => {
		const source = [
			"@layer components {",
			"  .card { color: red; }",
			"}",
			"@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.AuthoredCss,
			to: CodemodAdapterId.AuthoredCss,
			file: "styles.css",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toBe(source);
	});

	test("fails closed for CSS Module globals instead of pretending they are local classes", () => {
		const source = ":global(.reset) { margin: 0; } .card { color: red; }";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.CssModules,
			to: CodemodAdapterId.Pandwind,
			file: "styles.module.css",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		// Global-selector rules fail closed, so the whole file is skipped:
		// preserved source under the visible marker plus the capability
		// residual naming the offending selector.
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain(":global(.reset) { margin: 0; } .card { color: red; }");
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": false,
			  "code": "// pandwind:migrate-skip (lowering-residual: capability)
			:global(.reset) { margin: 0; } .card { color: red; }",
			  "converted": 0,
			  "dependencies": [],
			  "fileChanges": [],
			  "generatedFiles": [],
			  "loweringPlans": [],
			  "outcomes": [],
			  "reports": [],
			  "residuals": [
			    {
			      "hint": "stylesheet migration requires a single local class selector",
			      "kind": "capability",
			      "text": ":global(.reset)",
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);
	});

	test("emits a target-owned class map when a CSS Module has only local rules", () => {
		const source = ".card { color: red; }";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.CssModules,
			to: CodemodAdapterId.Pandwind,
			file: "styles.module.css",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"card": css.class({ color: "red" })');
		expect(result).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { createCss } from "pandwind/css";
			const css = createCss();
			export const styles = { "card": css.class({ color: "red" }) };
			export default styles;",
			  "converted": 1,
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
			  "outcomes": [],
			  "outputExtension": ".ts",
			  "reports": [],
			  "residuals": [],
			  "skipped": 0,
			  "validations": [
			    {
			      "canonicalSource": "&{color:red}",
			      "canonicalTarget": "&{color:red}",
			      "differences": [],
			      "lossiness": "lossless",
			      "residuals": [],
			      "valid": true,
			    },
			  ],
			}
		`);
	});
});
