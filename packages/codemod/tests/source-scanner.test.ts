import { describe, expect, test } from "vitest";
import {
	SOURCE_SCANNER_SCHEMA,
	SourceScannerContractSuite,
	createSourceScannerRegistry,
	type SourceLanguageAdapter,
} from "pandwind/source";

describe("language-neutral source scanner registry", () => {
	test("scans TSX, Vue, Svelte, and Astro through one document contract", () => {
		const registry = createSourceScannerRegistry();
		for (const file of ["Card.tsx", "Card.vue", "Card.svelte", "Card.astro"]) {
			const result = registry.scan({
				file,
				source: '// tw({ color: "red" })\ntw({ color: "blue" })',
			});
			expect(result.language).not.toBe("unknown");
			expect(result.excluded.length).toBeGreaterThan(0);
			expect(result.isExcluded(8)).toBe(true);
			expect(result.isExcluded(result.document.source.lastIndexOf("tw({"))).toBe(false);
		}
	});

	test("accepts a project-defined file language without changing scanner callers", () => {
		const markdown = {
			schema: SOURCE_SCANNER_SCHEMA,
			id: "markdown",
			languages: ["mdx"],
			detect: (document) => document.file.endsWith(".mdx"),
			scan: (document) => ({
				document,
				language: "mdx",
				excluded: [],
				isExcluded: () => false,
				diagnostics: [],
			}),
		} satisfies SourceLanguageAdapter;
		const registry = createSourceScannerRegistry().register(markdown);
		expect(registry.scan({ file: "README.mdx", source: "tw({})" }).language).toBe("mdx");
	});

	test("exposes language adapters through a plugin composition boundary", () => {
		const registry = createSourceScannerRegistry();
		expect(registry.plugins.map((plugin) => plugin.id)).toEqual(["pandwind-source-languages"]);
		const custom = {
			schema: "pandwind.source-scanner-plugin/1",
			id: "custom-source-plugin",
			adapters: [
				{
					schema: "pandwind.source-scanner/2",
					id: "custom-source",
					languages: ["custom"],
					extensions: [".custom"],
					detect: (document: { file: string }) => document.file.endsWith(".custom"),
					scan: (document: { file: string; source: string }) => ({
						document,
						language: "custom",
						excluded: [],
						diagnostics: [],
						isExcluded: () => false,
					}),
				},
			],
		} as const;
		registry.registerPlugin(custom);
		expect(registry.languageForFile("Card.custom")).toBe("custom");
	});

	test("uses built-in MDX and framework adapters", () => {
		const registry = createSourceScannerRegistry();
		const mdx = registry.scan({
			file: "Card.mdx",
			source: "# Card\n\n<Card />\n\n{tw({ color: 'red' })}",
		});
		expect(mdx.language).toBe("mdx");
		expect(mdx.framework).toBeUndefined();
		expect(mdx.isExcluded(0)).toBe(true);
		expect(mdx.isExcluded(mdx.document.source.lastIndexOf("tw("))).toBe(false);

		const react = registry.scan({
			file: "Card.tsx",
			source: 'import React from "react";\nconst card = css({ color: "red" });',
		});
		expect(react.framework).toBe("react");
		const solid = registry.scan({
			file: "Card.tsx",
			source: 'import { createSignal } from "solid-js";\nconst card = css({ color: "red" });',
		});
		expect(solid.framework).toBe("solid");
	});

	test("keeps supported tagged-template call sites actionable", () => {
		const result = createSourceScannerRegistry().scan({
			file: "styles.tsx",
			source: "const card = css`color: red;`;",
		});
		expect(result.isExcluded(result.document.source.indexOf("css`"))).toBe(false);
	});

	test("applies one contract suite to every registered scanner adapter", () => {
		for (const report of SourceScannerContractSuite.inspect(createSourceScannerRegistry()))
			SourceScannerContractSuite.assert(report);
	});
});
