import { expect, test } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

test("YumCSS emission keeps built-in condition keys", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ color: "red", _hover: { color: "blue" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.YumCSS,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_hover: { color: "blue" }');
	expect(result.code).not.toContain('"&:hover"');
});

test("YumCSS emission keeps authored preset condition keys", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ _focus: { color: "blue" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.YumCSS,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_focus: { color: "blue" }');
	expect(result.code).not.toContain('"&:focus"');
});

test("YumCSS emission preserves undeclared condition residuals", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ _brand: { color: "red" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.YumCSS,
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

test("YumCSS emission uses target project condition catalogs", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ _brand: { color: "red" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.YumCSS,
			file: "styles.ts",
			mode: "safe",
			project: {
				conditionCatalog: { _brand: "[data-brand=brand] &" },
			},
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_brand: { color: "red" }');
});

test("YumCSS emission maps common raw pseudo selectors to preset keys", () => {
	const result = runAdapterMigration(
		'import { css } from "styled-system/css";\n' +
			'export const card = css({ "&:hover": { color: "blue" }, "&::before": { content: "" } });',
		{
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.YumCSS,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_hover: { color: "blue" }');
	expect(result.code).toContain('_before: { content: "" }');
	expect(result.code).not.toContain('"&:hover"');
	expect(result.code).not.toContain('"&::before"');
});

test("YumCSS emission reuses preset condition keys for stylesheet sources", () => {
	const media = runAdapterMigration(
		"@media (prefers-color-scheme: dark) { .card { color: white; } }",
		{
			from: CodemodAdapterId.CssModules,
			to: CodemodAdapterId.YumCSS,
			file: "Card.module.css",
			root: "/project",
			readFile: () => undefined,
			listFiles: () => [],
			mode: "safe",
		},
	);
	const pseudo = runAdapterMigration(".card:hover { color: red; }", {
		from: CodemodAdapterId.CssModules,
		to: CodemodAdapterId.YumCSS,
		file: "Card.module.css",
		root: "/project",
		readFile: () => undefined,
		listFiles: () => [],
		mode: "safe",
	});

	expect(media.residuals).toEqual([]);
	expect(media.code).toContain('_osDark: { color: "white" }');
	expect(pseudo.residuals).toEqual([]);
	expect(pseudo.code).toContain('_hover: { color: "red" }');
});

test("Panda emission keeps YumCSS preset condition keys", () => {
	const result = runAdapterMigration(
		'import { createUnsafeCss } from "yumcss/unsafe/css";\n' +
			"const css = createUnsafeCss();\n" +
			'export const card = css.class({ _hover: { color: "blue.300" } });',
		{
			from: CodemodAdapterId.YumCSS,
			to: CodemodAdapterId.Panda,
			file: "styles.ts",
			mode: "safe",
		},
	);

	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('_hover: { color: "blue.300" }');
	expect(result.code).not.toContain('"&:is(:hover');
});
