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

test("Pandwind emission uses target project condition catalogs", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ _brand: { color: "red.300" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.Pandwind,
			file: "styles.ts",
			mode: "safe",
			project: {
				conditionCatalog: { _brand: "[data-brand=brand] &" },
			},
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_brand: { color: "red.300" }');
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

test("Pandwind emission reuses preset condition keys for stylesheet sources", () => {
	const media = runAdapterMigration(
		"@media (prefers-color-scheme: dark) { .card { color: white; } }",
		{
			from: CodemodAdapterId.AuthoredCss,
			to: CodemodAdapterId.Pandwind,
			file: "card.css",
			mode: "safe",
		},
	);
	const pseudo = runAdapterMigration(".card:hover { color: red; }", {
		from: CodemodAdapterId.CssModules,
		to: CodemodAdapterId.Pandwind,
		file: "Card.module.css",
		mode: "safe",
	});

	expect(media.residuals).toEqual([]);
	expect(media.code).toContain('_osDark: { color: "white" }');
	expect(pseudo.residuals).toEqual([]);
	expect(pseudo.code).toContain('_hover: { color: "red" }');
});

test("Panda emission keeps Pandwind preset condition keys", () => {
	const result = runAdapterMigration(
		'import { createCss } from "pandwind/css";\n' +
			"const css = createCss();\n" +
			'export const card = css.class({ _hover: { color: "blue.300" } });',
		{
			from: CodemodAdapterId.Pandwind,
			to: CodemodAdapterId.Panda,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_hover: { color: "blue.300" }');
	expect(result.code).not.toContain('"&:is(:hover');
});
