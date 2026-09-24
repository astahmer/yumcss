import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import typescript from "typescript-language-service";
import { expect, test } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const tsconfigPath = resolve(packageRoot, "tsconfig.json");
const fixturePath = resolve(packageRoot, "tests/fixtures/tsc/raw-style-completions.fixture.ts");

const markedFixture = [
	'import { createCss } from "pandwind/css";',
	'import type { TypedStyleObject } from "pandwind/types/typings";',
	'import { csstypePreset } from "pandwind/preset/csstype";',
	'import { realWorldPreset } from "./real-world-theme.ts";',
	"const css = createCss(realWorldPreset);",
	"const cssWithoutPalette = createCss(csstypePreset);",
	"const outside: TypedStyleObject<typeof realWorldPreset, never> = {",
	'\tdisplay: "inline-flex",',
	'\talignItems: "center",',
	"\tregularStyleCursor",
	"};",
	"css.class({",
	"\t$raw: {",
	'\t\tjustifyContent: "center",',
	'\t\ttransition: "background-color, border-color, color",',
	"\t\tregularRawCursor",
	"\t},",
	"});",
	"const outsideWithoutPalette: TypedStyleObject<typeof csstypePreset, never> = {",
	"\tnoPaletteStyleCursor",
	"};",
	"cssWithoutPalette.class({",
	"\t$raw: {",
	"\t\tnoPaletteRawCursor",
	"\t},",
	"});",
].join("\n");

const regularStyleCursor = markedFixture.indexOf("regularStyleCursor");
const regularRawCursor = markedFixture.indexOf("regularRawCursor") - "regularStyleCursor".length;
const noPaletteStyleCursor =
	markedFixture.indexOf("noPaletteStyleCursor") -
	"regularStyleCursor".length -
	"regularRawCursor".length;
const noPaletteRawCursor =
	markedFixture.indexOf("noPaletteRawCursor") -
	"regularStyleCursor".length -
	"regularRawCursor".length -
	"noPaletteStyleCursor".length;
const fixtureSource = markedFixture
	.replace("regularStyleCursor", "")
	.replace("regularRawCursor", "")
	.replace("noPaletteStyleCursor", "")
	.replace("noPaletteRawCursor", "");

test("raw property completions exactly match normal CSS property completions", () => {
	const parsedConfig = typescript.getParsedCommandLineOfConfigFile(
		tsconfigPath,
		{},
		{
			...typescript.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new Error(typescript.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
			},
		},
	);

	if (parsedConfig === undefined) {
		throw new Error(`Could not load ${tsconfigPath}`);
	}

	const languageServiceHost: typescript.LanguageServiceHost = {
		getCompilationSettings: () => parsedConfig.options,
		getScriptFileNames: () => [fixturePath],
		getScriptVersion: () => "0",
		getScriptSnapshot: (fileName) => {
			const source =
				resolve(fileName) === fixturePath ? fixtureSource : typescript.sys.readFile(fileName);
			return source === undefined ? undefined : typescript.ScriptSnapshot.fromString(source);
		},
		getCurrentDirectory: () => workspaceRoot,
		getDefaultLibFileName: typescript.getDefaultLibFilePath,
		fileExists: typescript.sys.fileExists,
		readFile: typescript.sys.readFile,
		readDirectory: typescript.sys.readDirectory,
	};

	const languageService = typescript.createLanguageService(languageServiceHost);

	try {
		const entriesAt = (position: number) => {
			const completions = languageService.getCompletionsAtPosition(fixturePath, position, {});
			if (completions === undefined) {
				throw new Error(`No completions at position ${position}`);
			}
			return completions.entries;
		};
		const expectMatchingPropertyCompletions = (
			outsidePosition: number,
			rawPosition: number,
			outsideAlreadyUsed: readonly string[],
			rawAlreadyUsed: readonly string[],
		) => {
			const outsideEntries = entriesAt(outsidePosition);
			const rawEntries = entriesAt(rawPosition);
			const outsideProperties = [
				...outsideEntries.map((entry) => entry.name),
				...outsideAlreadyUsed,
			];
			const rawProperties = [...rawEntries.map((entry) => entry.name), ...rawAlreadyUsed];

			expect(outsideEntries.every((entry) => entry.kind === "property")).toBe(true);
			expect(rawEntries.every((entry) => entry.kind === "property")).toBe(true);
			expect(rawProperties.toSorted()).toEqual(
				outsideProperties.filter((name) => name !== "$raw").toSorted(),
			);
			expect(rawProperties).toContain("justifyContent");
			expect(rawProperties).toContain("transition");
			expect(rawProperties).toContain("colorPalette");
		};

		expectMatchingPropertyCompletions(
			regularStyleCursor,
			regularRawCursor,
			["display", "alignItems"],
			["justifyContent", "transition"],
		);
		expectMatchingPropertyCompletions(noPaletteStyleCursor, noPaletteRawCursor, [], []);
		expect(
			languageService
				.getSemanticDiagnostics(fixturePath)
				.map((diagnostic) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, " ")),
		).toEqual([]);
	} finally {
		languageService.dispose();
	}
});
