import { expect, test } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

test("Pandwind emission keeps built-in condition keys", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ color: "red.300", _hover: { color: "blue.300" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_hover: { color: "blue.300" }');
	expect(result.code).not.toContain('"&:hover"');
});

test("Pandwind emission keeps authored preset condition keys", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ _focus: { color: "blue.300" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_focus: { color: "blue.300" }');
	expect(result.code).not.toContain('"&:focus"');
});

test("Pandwind emission preserves undeclared condition residuals", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ _brand: { color: "red.300" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.skipped).toBe(1);
	expect(result.residuals).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: "capability",
				text: "_brand",
				hint: expect.stringContaining("not declared"),
			}),
		]),
	);
	expect(result.code).toContain("_brand");
	expect(result.code).not.toContain("&:brand");
});

test("Pandwind emission maps common raw pseudo selectors to preset keys", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ "&:hover": { color: "blue.300" }, "&::before": { content: "" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_hover: { color: "blue.300" }');
	expect(result.code).toContain('_before: { content: "" }');
	expect(result.code).not.toContain('"&:hover"');
	expect(result.code).not.toContain('"&::before"');
});
