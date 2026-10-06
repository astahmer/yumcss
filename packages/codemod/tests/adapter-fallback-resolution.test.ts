import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createYumCSSAdapter,
	createStyleAdapterRegistry,
	createTailwindAdapter,
	createUnoCssAdapter,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

function parseFallback(
	adapter: ReturnType<typeof createTailwindAdapter> | ReturnType<typeof createUnoCssAdapter>,
	source: string,
) {
	return adapter.parse(source, {
		file: "src/App.tsx",
		source,
		config: adapter.loadConfig({ file: "src/App.tsx", source }),
	});
}

describe("adapter fallback resolution", () => {
	test("Tailwind resolves only syntax-level arbitrary utilities without project evidence", () => {
		const source = '<div className="hover:[color:red] custom-button" />';
		const result = parseFallback(createTailwindAdapter({ moduleLoader: null }), source);
		const program = result.matches[0]?.program;

		expect(result.matches).toHaveLength(1);
		expect(program?.residuals).toEqual([
			expect.objectContaining({ kind: "unknown-utility", text: "custom-button" }),
		]);
		expect(program?.declarations).toEqual([
			expect.objectContaining({
				property: "color",
				value: { kind: "literal", value: "red" },
				conditions: [{ kind: "named", name: "hover" }],
			}),
		]);
		expect(program?.declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [
			      {
			        "kind": "named",
			        "name": "hover",
			      },
			    ],
			    "property": "color",
			    "value": {
			      "kind": "literal",
			      "value": "red",
			    },
			  },
			]
		`);
	});

	test("UnoCSS preserves arbitrary utilities without generator evidence", () => {
		const source = '<div class="midnight:[color:var(--brand)] project-shortcut" />';
		const result = parseFallback(createUnoCssAdapter({ moduleLoader: null }), source);
		const program = result.matches[0]?.program;
		expect(result.matches).toHaveLength(1);
		expect(program?.residuals).toEqual([
			expect.objectContaining({ kind: "unknown-utility", text: "midnight:[color:var(--brand)]" }),
			expect.objectContaining({ kind: "unknown-utility", text: "project-shortcut" }),
		]);
		expect(program?.declarations).toEqual([]);
	});

	test("official Tailwind loading requires the shared file-discovery port", async () => {
		let imports = 0;
		const loader: ProjectModuleLoader = {
			async importPackage() {
				imports++;
				return {
					__unstable__loadDesignSystem: async () => ({ candidatesToCss: () => [] }),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const source = '<div className="custom-button" />';
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Tailwind,
			to: CodemodAdapterId.YumCSS,
			file: "src/App.tsx",
			root: "/project",
			readFile: () => '@import "tailwindcss";',
			adapterRegistry: createStyleAdapterRegistry([
				createTailwindAdapter({ moduleLoader: loader }),
				createYumCSSAdapter({ moduleLoader: null }),
			]),
		});

		expect(imports).toBe(1);
		expect(result.converted).toBe(0);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "configuration", text: "Tailwind project CSS graph" }),
		]);
		expect(result.code).toContain(source);
		expect(result.code).toMatchInlineSnapshot(`
			"// yumcss:migrate-skip (configuration-residual: configuration)
			<div className="custom-button" />"
		`);
	});
});
