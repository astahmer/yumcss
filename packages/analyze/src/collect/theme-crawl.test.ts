import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { crawlCssImports } from "./theme-crawl.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
	const root = mkdtempSync(join(tmpdir(), "yumcss-theme-crawl-"));
	roots.push(root);
	return root;
}

function write(root: string, path: string, content: string): string {
	const file = join(root, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

describe("crawlCssImports", () => {
	test("follows relative imports in source order and remains cycle safe", () => {
		const root = project();
		const entry = write(
			root,
			"src/styles.css",
			'@import "./base.css";\n@theme { --color-entry: red; }',
		);
		write(root, "src/base.css", '@import "./nested.css";\n@theme { --color-base: blue; }');
		write(root, "src/nested.css", '@import "./base.css";\n@theme { --color-nested: green; }');

		const result = crawlCssImports([entry], root);

		expect(result.files).toHaveLength(3);
		expect(result.contents.map(({ path }) => path)).toEqual([
			join(root, "src/styles.css"),
			join(root, "src/base.css"),
			join(root, "src/nested.css"),
		]);
		expect(result.unresolved).toEqual([]);
		expect(result.contents.map(({ content }) => content)).toMatchInlineSnapshot(`
			[
			  "@import "./base.css";
			@theme { --color-entry: red; }",
			  "@import "./nested.css";
			@theme { --color-base: blue; }",
			  "@import "./base.css";
			@theme { --color-nested: green; }",
			]
		`);
	});

	test("resolves scoped package exports for imported theme CSS", () => {
		const root = project();
		const entry = write(root, "src/styles.css", '@import "@acme/theme/tailwind.css";');
		write(
			root,
			"node_modules/@acme/theme/package.json",
			JSON.stringify({ exports: { "./tailwind.css": "./dist/tailwind.css" } }),
		);
		write(
			root,
			"node_modules/@acme/theme/dist/tailwind.css",
			"@theme { --color-brand: rebeccapurple; }",
		);

		const result = crawlCssImports([entry], root);

		expect(result.files).toEqual([
			join(root, "src/styles.css"),
			join(root, "node_modules/@acme/theme/dist/tailwind.css"),
		]);
		expect(result.unresolved).toEqual([]);
	});

	test("reports unresolved local imports without dropping reachable files", () => {
		const root = project();
		const entry = write(
			root,
			"src/styles.css",
			'@import "./missing.css";\n@theme { --color-entry: red; }',
		);

		const result = crawlCssImports([entry], root);

		expect(result.files).toEqual([entry]);
		expect(result.unresolved).toEqual([{ from: entry, specifier: "./missing.css" }]);
	});
});
