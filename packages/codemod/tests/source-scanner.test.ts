import { describe, expect, test } from "vitest";
import {
	SOURCE_SCANNER_SCHEMA,
	createSourceScannerRegistry,
	type SourceLanguageAdapter,
} from "../src/swap/index.ts";

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
});
