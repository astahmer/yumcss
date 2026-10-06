import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { examplePreset } from "@yumcss/example-preset";
import { define } from "yumcss/preset";
import { DEFAULT_CSS_TYPES_OUTPUT, createCssCli, parseCssCommand } from "../src/css/cli.ts";
import { GENERATED_CSS_TYPES_HEADER, generateCssTypes } from "../src/css/generate-types.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("yumcss-codemod css", () => {
	test("parses a deterministic generation command", () => {
		expect(
			parseCssCommand(
				[
					"generate",
					"packages/ui",
					"generated/css.ts",
					"--preset-import",
					"./src/preset.ts",
					"--preset-export",
					"preset",
				],
				"/project",
			),
		).toEqual({
			command: "generate",
			root: "/project/packages/ui",
			outFile: "/project/packages/ui/generated/css.ts",
			presetImport: "./src/preset.ts",
			presetExport: "preset",
			check: false,
		});
		expect(parseCssCommand([], "/project")).toEqual({
			command: "generate",
			root: "/project",
			outFile: `/project/${DEFAULT_CSS_TYPES_OUTPUT}`,
			presetImport: "./src/preset.ts",
			presetExport: "preset",
			check: false,
		});
		expect(
			parseCssCommand(["generate", "--token-variable-names", "authored"], "/project"),
		).toMatchObject({ tokenVariableNames: "authored" });
		expect(() =>
			parseCssCommand(["generate", "--token-variable-names", "invalid"], "/project"),
		).toThrow("--token-variable-names must be 'hashed' or 'authored'");
	});

	test("generates a package-bound facade and verifies freshness", async () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-css-types-"));
		temporaryDirectories.push(root);
		const output = join(root, "src/css.generated.ts");
		const cli = createCssCli(
			{
				moduleLoader: {
					importPackage: async <T>() => ({ preset: examplePreset }) as T,
					importFile: async () => undefined,
				},
			},
			root,
		);

		await cli.run([
			"generate",
			".",
			"src/css.generated.ts",
			"--preset-import",
			"@acme/preset",
			"--preset-export",
			"preset",
		]);
		const source = readFileSync(output, "utf8");
		expect(source).toContain("/* @__PURE__ */ createGeneratedCss<");
		expect(source).toContain("GeneratedStyle");
		expect(source).toContain("GeneratedDynamicStyle");
		expect(source).toContain("FirstThatWorksValue");
		expect(source).toContain(
			"export type GeneratedCss = CssFn<GeneratedStyle, GeneratedDynamicStyle>",
		);
		expect(source).toBe(
			generateCssTypes(examplePreset, {
				presetImport: "@acme/preset",
				presetExport: "preset",
			}).source,
		);
		expect(source.startsWith(`${GENERATED_CSS_TYPES_HEADER}\n`)).toBe(true);

		await expect(
			cli.run([
				"generate",
				".",
				"src/css.generated.ts",
				"--preset-import",
				"@acme/preset",
				"--preset-export",
				"preset",
				"--check",
			]),
		).resolves.toBeUndefined();
		writeFileSync(output, `${source}\n`);
		await expect(
			cli.run([
				"generate",
				".",
				"src/css.generated.ts",
				"--preset-import",
				"@acme/preset",
				"--preset-export",
				"preset",
				"--check",
			]),
		).rejects.toThrow("generated CSS types are stale");
	});

	test("uses an output-relative import for a local preset", async () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-css-types-"));
		temporaryDirectories.push(root);
		const output = join(root, "src/css.generated.ts");
		const cli = createCssCli(
			{
				moduleLoader: {
					importPackage: async () => undefined,
					importFile: async <T>() => ({ preset: examplePreset }) as T,
				},
			},
			root,
		);

		await cli.run([
			"generate",
			".",
			"src/css.generated.ts",
			"--preset-import",
			"./src/preset.ts",
			"--preset-export",
			"preset",
		]);
		expect(readFileSync(output, "utf8")).toBe(
			generateCssTypes(examplePreset, {
				presetImport: "./preset",
				presetExport: "preset",
			}).source,
		);
	});

	test("keeps the committed example facade fresh", () => {
		const output = resolve(import.meta.dirname, "../../yumcss/tests/fixtures/generated-css.ts");
		expect(readFileSync(output, "utf8")).toBe(
			generateCssTypes(examplePreset, {
				presetImport: "@yumcss/example-preset",
				presetExport: "examplePreset",
			}).source,
		);
	});

	test("reserves colorPalette when the preset has no palette catalog", () => {
		const tokens = define.tokens({ colors: { "$blue-500": "#2563eb" } });
		const preset = define.preset(
			{ config: {}, tokens },
			{
				strict: true,
				conditions: { base: "" },
				properties: define.properties({ $all: true }),
			},
		);
		const source = generateCssTypes(preset, {
			presetImport: "./preset",
			presetExport: "preset",
		}).source;

		expect(source).toContain("readonly colorPalette?: never;");
		expect(source).not.toContain("colorPalette.solid");
	});

	test("derives virtual roles from a color subtree palette source", () => {
		const tokens = define.tokens({
			colors: {
				brand: "#2563eb",
				"brand.500": "#3b82f6",
			},
		});
		const colorPalettes = tokens.defineColorPalettes({ brand: "colors.brand" });
		const preset = define.preset(
			{ config: {}, tokens },
			{
				strict: true,
				conditions: { base: "" },
				properties: define.properties({ color: { $tokens: "colors" } }),
				colorPalettes,
			},
		);
		const source = generateCssTypes(preset, {
			presetImport: "./preset",
			presetExport: "preset",
		}).source;

		expect(source).toContain('"colorPalette"');
		expect(source).toContain('"colorPalette.500"');
	});

	test("passes authored token-variable naming through the generated factory", () => {
		const source = generateCssTypes(examplePreset, {
			presetImport: "./preset",
			presetExport: "preset",
			tokenVariableNames: "authored",
		}).source;

		expect(source).toContain("createGeneratedCss<");
		expect(source).toContain('>(preset, { tokenVariableNames: "authored" });');
		expect(source).toContain('"$blue-500"');
	});
});
