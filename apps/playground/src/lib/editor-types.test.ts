import { describe, expect, test } from "vitest";
import { EDITOR_TYPE_LIBRARIES } from "./editor-types.ts";

describe("playground editor declarations", () => {
	test("mounts the generated public Pandwind declaration graph", () => {
		const cssTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/css/index.d.ts"),
		);
		const cxTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/cx/index.d.ts"),
		);
		const selectorTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/types/selectors.d.ts"),
		);
		const modules = EDITOR_TYPE_LIBRARIES.find(
			(library) => library.filePath === "file:///pandwind/playground/modules.d.ts",
		);

		expect(cssTypes?.content).toContain('export * from "./create-css.d.ts";');
		expect(cxTypes?.content).toContain("export interface CxFn");
		expect(selectorTypes?.content).toContain("AnySelector");
		expect(modules?.content).toContain('declare module "pandwind/css"');
		expect(modules?.content).toContain('export * from "./generated/pandwind/css/index.d.ts";');
	});

	test("does not reintroduce a hand-maintained Pandwind API shadow", () => {
		const allDeclarations = EDITOR_TYPE_LIBRARIES.map((library) => library.content).join("\n");

		expect(allDeclarations).not.toContain("interface PlaygroundCss");
		expect(allDeclarations).not.toContain("type PlaygroundStylePrimitive");
		expect(allDeclarations).toContain('declare const css: import("pandwind/css").CssFn;');
		expect(allDeclarations).toContain('declare const cx: import("pandwind").CxFn;');
	});

	test("keeps generated relative declaration imports mounted", () => {
		const mountedPaths = new Set(EDITOR_TYPE_LIBRARIES.map((library) => library.filePath));

		for (const library of EDITOR_TYPE_LIBRARIES.filter((entry) =>
			entry.filePath.includes("/generated/pandwind/"),
		)) {
			const declarationCode = library.content
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/\/\/.*$/gm, "");
			for (const match of declarationCode.matchAll(
				/(?:from|import\()\s*["'](\.\.?\/[^"']+)["']/g,
			)) {
				const importedPath = new URL(match[1]!, library.filePath).toString();
				expect(mountedPaths, `${library.filePath} imports ${match[1]}`).toContain(importedPath);
			}
		}
	});

	test("mounts external declaration dependencies from the installed graph", () => {
		const dependencyPaths = EDITOR_TYPE_LIBRARIES.map((library) => library.filePath);

		expect(dependencyPaths).toContain(
			"file:///pandwind/playground/generated/dependencies/csstype/index.d.ts",
		);
		expect(dependencyPaths).toContain(
			"file:///pandwind/playground/generated/dependencies/postcss/lib/postcss.d.ts",
		);
	});
});
