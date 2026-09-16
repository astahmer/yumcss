import { describe, expect, test } from "vitest";
import { EDITOR_TYPE_LIBRARIES, PANDWIND_EDITOR_MODULE_PATHS } from "./editor-types.ts";

describe("playground editor declarations", () => {
	test("mounts the generated public Pandwind declaration graph", () => {
		const cssTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/css/index.d.ts"),
		);
		const unsafeCssTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/unsafe/css.d.ts"),
		);
		const cxTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/cx/index.d.ts"),
		);
		const presetTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/preset/index.d.ts"),
		);
		const basePresetTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/preset/base.d.ts"),
		);
		const defaultPresetTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/preset/default.d.ts"),
		);
		const defineTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/types/define-preset.d.ts"),
		);
		const selectorTypes = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/pandwind/types/selectors.d.ts"),
		);
		const modules = EDITOR_TYPE_LIBRARIES.find(
			(library) => library.filePath === "file:///pandwind/playground/modules.d.ts",
		);

		expect(cssTypes?.content).toContain('export { createCss } from "./create-css.d.ts";');
		expect(unsafeCssTypes?.content).toContain(
			'export { createUnsafeCss } from "../css/create-css.d.ts";',
		);
		expect(cxTypes?.content).toContain("export interface CxFn");
		expect(presetTypes?.content).toContain('export * from "../types/typings.d.ts";');
		expect(presetTypes?.content).toContain('export { define } from "../types/define-preset.d.ts";');
		expect(basePresetTypes?.content).toContain("export const basePreset");
		expect(defaultPresetTypes?.content).toContain("export const defaultPreset");
		expect(defineTypes?.content).toContain("define");
		expect(selectorTypes?.content).toContain("AnySelector");
		expect(PANDWIND_EDITOR_MODULE_PATHS["pandwind/css"]).toBe("generated/pandwind/css/index.d.ts");
		expect(PANDWIND_EDITOR_MODULE_PATHS["pandwind/unsafe/css"]).toBe(
			"generated/pandwind/unsafe/css.d.ts",
		);
		expect(PANDWIND_EDITOR_MODULE_PATHS["pandwind/preset"]).toBe(
			"generated/pandwind/preset/index.d.ts",
		);
		expect(PANDWIND_EDITOR_MODULE_PATHS["pandwind/preset/base"]).toBe(
			"generated/pandwind/preset/base.d.ts",
		);
		expect(PANDWIND_EDITOR_MODULE_PATHS["pandwind/preset/default"]).toBe(
			"generated/pandwind/preset/default.d.ts",
		);
		expect(modules?.content).toContain("interface PlaygroundStyledFactory");
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
		const dependencyModules = EDITOR_TYPE_LIBRARIES.find((library) =>
			library.filePath.endsWith("/generated/dependencies/modules.d.ts"),
		)?.content;

		expect(dependencyPaths).toContain(
			"file:///pandwind/playground/generated/dependencies/csstype/index.d.ts",
		);
		expect(dependencyPaths).toContain(
			"file:///pandwind/playground/generated/dependencies/postcss/lib/postcss.d.ts",
		);
		expect(dependencyModules).toContain('declare module "@chakra-ui/react"');
		expect(dependencyModules).toContain('declare module "@mantine/core"');
		expect(dependencyModules).toContain('declare module "tailwindcss"');
		expect(dependencyModules).toContain('declare module "@unocss/core"');
		expect(dependencyModules).toContain('declare module "jss"');
		expect(dependencyModules).toContain('declare module "@tokenami/config"');
		// The generator silently skips adapter packages that are not installed
		// anywhere in the workspace graph; a pruned dependency must not resurrect.
		expect(dependencyModules).not.toContain('declare module "@emotion/react"');
		expect(dependencyModules).not.toContain('declare module "styled-components"');
		const mountedModules = EDITOR_TYPE_LIBRARIES.map((library) => library.content).join("\n");
		expect(mountedModules).not.toContain(
			'declare module "@chakra-ui/react" { export const Box: PlaygroundComponent; }',
		);
		expect(mountedModules).not.toContain(
			'declare module "@mantine/core" { export const Box: PlaygroundComponent; }',
		);
	});
});
