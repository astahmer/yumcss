import { describe, expect, test } from "vitest";
import type { AdapterGeneratedFile, StyleAdapter } from "../src/swap/index.ts";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const emotion = catalog.registry.get(CodemodAdapterId.Emotion)!;
const panda = catalog.registry.get(CodemodAdapterId.Panda)!;
const pandwind = catalog.registry.get(CodemodAdapterId.Pandwind)!;
const generatedTargetId = "test-generated-target";

function targetWithGeneratedFile(
	createFile: (index: number) => AdapterGeneratedFile,
): StyleAdapter {
	return {
		...pandwind,
		id: generatedTargetId,
		emit(program, context) {
			const emitted = pandwind.emit(program, context);
			return {
				...emitted,
				generatedFiles: [createFile(context.index)],
			};
		},
	};
}

function migrate(source: string, target: StyleAdapter): ReturnType<typeof runAdapterMigration> {
	const registry = createStyleAdapterRegistry([emotion, target]);
	return runAdapterMigration(source, {
		from: CodemodAdapterId.Emotion,
		to: generatedTargetId,
		file: "src/Card.tsx",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: registry,
	});
}

describe("generated target files", () => {
	test("moves the recipe runtime into one project-owned generated module", () => {
		const result = runAdapterMigration(
			'import { cva } from "styled-system/recipes";\n' +
				'export const button = cva({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });\n',
			{
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.Pandwind,
				file: "/project/src/recipes.ts",
				root: "/project",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: createStyleAdapterRegistry([panda, pandwind]),
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('from "../__pandwind/recipe"');
		expect(result.code).not.toContain('from "pandwind/recipe"');
		expect(result.generatedFiles).toEqual([
			expect.objectContaining({
				path: "__pandwind/recipe.ts",
				purpose: "shared recipe runtime used by migrated source",
			}),
		]);
		expect(result.generatedFiles[0]?.content).toContain("export const createRecipe");
		expect(result.generatedFiles[0]?.content).toContain("export const createSlotRecipe");
	});

	test("keeps generated imports outside multiline imports and declarations", () => {
		const source = [
			'import { css } from "styled-system/css";',
			"import {",
			"  Box,",
			"  Stack,",
			'} from "styled-system/jsx";',
			"",
			'export const card = css({ color: "red" });',
		].join("\n");
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: "src/Card.tsx",
			root: "/project",
			mode: "safe",
			readFile: () => undefined,
			adapterRegistry: createStyleAdapterRegistry([panda, pandwind]),
		});

		expect(result.residuals).toEqual([]);
		expect(result.validations.every((validation) => validation.valid)).toBe(true);
		expect(result.code).toContain("export const card = css.class");
		expect(result.code).not.toMatch(/from "styled-system\/jsx";export const card/u);
		expect(result.code).not.toMatch(/;export const card/u);
	});

	test("emits an expert target expression and one reusable file for one occurrence", () => {
		const source = 'import { css } from "@emotion/css";\nconst card = css({ color: "red" });\n';
		const result = migrate(
			source,
			targetWithGeneratedFile(() => ({
				path: "src/styles/migration-theme.ts",
				purpose: "shared migration theme",
				content: 'export const migrationTheme = { brand: "#0ea5e9" } as const;\n',
			})),
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles).toMatchInlineSnapshot(`
			[
			  {
			    "content": "export const migrationTheme = { brand: "#0ea5e9" } as const;
			",
			    "path": "src/styles/migration-theme.ts",
			    "purpose": "shared migration theme",
			  },
			]
		`);
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red" });
			"
		`);
		expect(result.code).toContain("css.class");
		expect(result.generatedFiles).toHaveLength(1);
	});

	test("deduplicates the same reusable file across multiple occurrences", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			'const card = css({ color: "red" });\n' +
			'const panel = css({ backgroundColor: "white" });\n';
		const result = migrate(
			source,
			targetWithGeneratedFile(() => ({
				path: "src/styles/migration-theme.ts",
				content: "export const migrationTheme = {};\n",
			})),
		);

		expect(result.converted).toBe(2);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles).toHaveLength(1);
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red" });
			const panel = css.class({ backgroundColor: "white" });
			"
		`);
		expect(result.generatedFiles[0]?.path).toBe("src/styles/migration-theme.ts");
	});

	test("preserves the source when repeated occurrences conflict on one generated file", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			'const card = css({ color: "red" });\n' +
			'const panel = css({ color: "blue" });\n';
		const result = migrate(
			source,
			targetWithGeneratedFile((index) => ({
				path: "src/styles/migration-theme.ts",
				content: `export const migrationTheme = ${index};\n`,
			})),
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.generatedFiles).toEqual([]);
		expect(result.residuals).toEqual([
			expect.objectContaining({
				kind: "generated-file",
				hint: "multiple target emissions produced conflicting content for one generated file",
			}),
		]);
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (route: emotion -> test-generated-target | lowering-residual: generated-file)
			import { css } from "@emotion/css";
			const card = css({ color: "red" });
			const panel = css({ color: "blue" });
			"
		`);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("@emotion/css");
	});

	test("rejects an artifact that escapes the project root", () => {
		const source = 'import { css } from "@emotion/css";\nconst card = css({ color: "red" });\n';
		const result = migrate(
			source,
			targetWithGeneratedFile(() => ({
				path: "../shared/theme.ts",
				content: "export const theme = {};\n",
			})),
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.generatedFiles).toEqual([]);
		expect(result.residuals).toEqual([
			expect.objectContaining({
				kind: "generated-file",
				text: "../shared/theme.ts",
				hint: "generated file paths must be non-empty project-relative paths",
			}),
		]);
		expect(result.code).toMatchInlineSnapshot(`
		"// pandwind:migrate-skip (route: emotion -> test-generated-target | lowering-residual: generated-file)
		import { css } from "@emotion/css";
		const card = css({ color: "red" });
		"
	`);
		expect(result.code).toContain("@emotion/css");
	});
});
