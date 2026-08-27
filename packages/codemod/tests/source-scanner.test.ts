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
			const result = registry.scan({ file, source: `// tw({ color: \"red\" })\ntw({ color: \"blue\" })` });
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
});
