import { resolve } from "node:path";
import { expect, test } from "vitest";
import * as ts from "typescript";

const fixtureSource = [
	'import { createCss } from "pandwind/css";',
	'import { define } from "pandwind/preset";',
	'const explicitPreset = define.preset({ config: {}, tokens: {} }, { properties: { color: true, "--app-tone": true } });',
	'const explicitCss = createCss(explicitPreset);',
	'explicitCss.class({ $raw: { __EXPLICIT_CURSOR__ } });',
	'const configuredPreset = define.preset({ config: {} as { display: string; padding: string }, tokens: {} }, { properties: { $all: true } });',
	'const configuredCss = createCss(configuredPreset);',
	'configuredCss.class({ $raw: { __CONFIGURED_CURSOR__ } });',
].join("\n");

test("$raw completions include explicit and configured preset properties", () => {
	const currentDirectory = process.cwd();
	const fileName = resolve(currentDirectory, "tests/fixtures/raw-style-completions.ts");
	const explicitPosition = fixtureSource.indexOf("__EXPLICIT_CURSOR__");
	const configuredPosition = fixtureSource.indexOf("__CONFIGURED_CURSOR__");
	const source = fixtureSource.replace("__EXPLICIT_CURSOR__", "").replace("__CONFIGURED_CURSOR__", "");
	const compilerOptions: ts.CompilerOptions = {
		allowImportingTsExtensions: true,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		target: ts.ScriptTarget.ESNext,
		noEmit: true,
		skipLibCheck: true,
		strict: true,
	};
	const languageServiceHost: ts.LanguageServiceHost = {
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => currentDirectory,
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		getScriptFileNames: () => [fileName],
		getScriptSnapshot: (scriptFileName) => {
			if (resolve(scriptFileName) === fileName) return ts.ScriptSnapshot.fromString(source);
			const content = ts.sys.readFile(scriptFileName);
			return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
		},
		getScriptVersion: () => "1",
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		realpath: ts.sys.realpath,
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
	};
	const languageService = ts.createLanguageService(languageServiceHost);

	try {
		const explicitProperties = languageService.getCompletionsAtPosition(fileName, explicitPosition, {});
		const configuredProperties = languageService.getCompletionsAtPosition(fileName, configuredPosition - "__EXPLICIT_CURSOR__".length, {});

		expect(explicitProperties?.entries.map((entry) => entry.name)).toContain("color");
		expect(explicitProperties?.entries.map((entry) => entry.name)).toContain("--app-tone");
		expect(configuredProperties?.entries.map((entry) => entry.name)).toContain("display");
		expect(configuredProperties?.entries.map((entry) => entry.name)).toContain("padding");
	} finally {
		languageService.dispose();
	}
});
