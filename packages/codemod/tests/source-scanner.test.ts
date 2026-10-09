import { describe, expect, test } from "vitest";
import {
	SOURCE_SCANNER_SCHEMA,
	SourceLanguageAdapterId,
	SourceRuntimeBoundary,
	SourceBindings,
	createSourceScannerContractSuite,
	createSourceScannerRegistry,
	type SourceLanguageAdapter,
} from "yumcss/source";

describe("language-neutral source scanner registry", () => {
	test("proves every built-in language/framework adapter through one contract", () => {
		const fixtures = [
			[SourceLanguageAdapterId.ReactJsx, "Card.tsx", 'import React from "react";', "tsx", "react"],
			[
				SourceLanguageAdapterId.PreactJsx,
				"Card.tsx",
				'import { h } from "preact";',
				"tsx",
				"preact",
			],
			[
				SourceLanguageAdapterId.SolidJsx,
				"Card.tsx",
				'import { createSignal } from "solid-js";',
				"tsx",
				"solid",
			],
			[
				SourceLanguageAdapterId.QwikJsx,
				"Card.tsx",
				'import { component$ } from "@builder.io/qwik";',
				"tsx",
				"qwik",
			],
			[SourceLanguageAdapterId.Mdx, "Card.mdx", "# Card", "mdx", undefined],
			[
				SourceLanguageAdapterId.EcmaScript,
				"tokens.ts",
				"export const color = 'red';",
				"typescript",
				undefined,
			],
			[SourceLanguageAdapterId.Vue, "Card.vue", "<template><div /></template>", "vue", "vue"],
			[SourceLanguageAdapterId.Svelte, "Card.svelte", "<div />", "svelte", "svelte"],
			[SourceLanguageAdapterId.Astro, "Card.astro", "<div />", "astro", "astro"],
		] as const;
		const result = createSourceScannerContractSuite().run(
			createSourceScannerRegistry(),
			fixtures.map(([adapter, file, source, language, framework]) => ({
				adapter,
				document: { file, source },
				language,
				...(framework === undefined ? {} : { framework }),
			})),
		);
		expect(result.valid).toBe(true);
		expect(result.failures).toEqual([]);
	});

	test("keeps React server/client boundaries in the shared document result", () => {
		const registry = createSourceScannerRegistry();
		expect(
			registry.scan({ file: "Client.tsx", source: '"use client"; export const C = () => null;' })
				.runtimeBoundary,
		).toBe(SourceRuntimeBoundary.Client);
		expect(
			registry.scan({ file: "Server.tsx", source: '"use server"; export const C = () => null;' })
				.runtimeBoundary,
		).toBe(SourceRuntimeBoundary.Server);
	});

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

	test("parses Svelte scripts and Astro frontmatter without scanning their markup", () => {
		const registry = createSourceScannerRegistry();
		const vueSource = [
			'<script lang="ts">',
			'import { css } from "yumcss/css";',
			'const card = css({ color: "red" });',
			"</script>",
			"<template><div title=\"css({ color: 'blue' })\" /></template>",
		].join("\n");
		const svelteSource = [
			'<script lang="ts">',
			'import { css } from "yumcss/css";',
			'const card = css({ color: "red" });',
			"</script>",
			'<div title="css({ color: \'blue\' })">css({ color: "green" })</div>',
		].join("\n");
		const astroSource = [
			"---",
			'import { css } from "yumcss/css";',
			"if (!Astro.props.active) return null;",
			'const card = css({ color: "red" });',
			"---",
			'<div title="css({ color: \'blue\' })">css({ color: "green" })</div>',
		].join("\n");

		for (const [file, source, framework] of [
			["Card.vue", vueSource, "vue"],
			["Card.svelte", svelteSource, "svelte"],
			["Card.astro", astroSource, "astro"],
		] as const) {
			const result = registry.scan({ file, source });
			const bindings = SourceBindings.fromDocument(result.document);
			expect(result.framework).toBe(framework);
			expect(result.program?.type).toBe("Program");
			expect(result.diagnostics).toEqual([]);
			expect(bindings.callSites.map((site) => source.slice(site.start, site.end))).toEqual([
				'css({ color: "red" })',
			]);
		}
	});

	test("reports malformed Astro frontmatter without aborting the source scan", () => {
		const result = createSourceScannerRegistry().scan({
			file: "Broken.astro",
			source: "---\nconst card: =;\n---\n<div />",
		});

		expect(result.program?.type).toBe("Program");
		expect(result.diagnostics).toEqual([expect.objectContaining({ kind: "parse" })]);
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
		expect(registry.plugins.map((plugin) => plugin.id)).toEqual(["yumcss-source-languages"]);
		const custom = {
			schema: "yumcss.source-scanner-plugin/1",
			id: "custom-source-plugin",
			adapters: [
				{
					schema: "yumcss.source-scanner/1",
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

	test("detects frameworks from real package imports only", () => {
		const registry = createSourceScannerRegistry();
		const solidWithReactComment = registry.scan({
			file: "solid.tsx",
			source: '// import React from "react";\nimport { createSignal } from "solid-js";',
		});
		const solidWithReactText = registry.scan({
			file: "solid.tsx",
			source: 'const note = `from "react"`;\nimport { createSignal } from "solid-js";',
		});
		const packageLookalike = registry.scan({
			file: "preact.tsx",
			source: 'import { h } from "preact-not-a-framework";',
		});
		const preactSubpath = registry.scan({
			file: "preact.tsx",
			source: 'import { h } from "preact/compat";',
		});

		expect([
			solidWithReactComment.framework,
			solidWithReactText.framework,
			packageLookalike.framework,
			preactSubpath.framework,
		]).toEqual(["solid", "solid", undefined, "preact"]);
	});

	test("preserves valid Astro property names and nested returns", () => {
		const source = [
			"---",
			'import { css } from "yumcss/css";',
			"const object = { return: 1 };",
			"const readValue = () => { return object.return; };",
			"if (Astro.props.active) return css({ color: 'red' });",
			"---",
			"<div />",
		].join("\n");
		const result = createSourceScannerRegistry().scan({ file: "probe.astro", source });

		expect(result.diagnostics).toEqual([]);
		expect(result.program).toMatchObject({
			type: "Program",
			body: expect.arrayContaining([
				expect.objectContaining({
					type: "VariableDeclaration",
					declarations: expect.arrayContaining([
						expect.objectContaining({
							init: expect.objectContaining({
								type: "ArrowFunctionExpression",
								body: expect.objectContaining({
									type: "BlockStatement",
									body: expect.arrayContaining([
										expect.objectContaining({ type: "ReturnStatement" }),
									]),
								}),
							}),
						}),
					]),
				}),
			]),
		});
		const bindings = SourceBindings.fromDocument(result.document);
		expect(bindings.callSites.map((site) => source.slice(site.start, site.end))).toContain(
			"css({ color: 'red' })",
		);
	});

	test("reports adapter detection exceptions as contract failures", () => {
		const adapter: SourceLanguageAdapter = {
			schema: SOURCE_SCANNER_SCHEMA,
			id: "detect-throws",
			languages: ["custom"],
			detect: () => {
				throw new Error("detect failed");
			},
			scan: (document) => ({
				document,
				language: "custom",
				excluded: [],
				diagnostics: [],
				isExcluded: () => false,
			}),
		};
		const result = createSourceScannerContractSuite().run(createSourceScannerRegistry([adapter]), [
			{ adapter: adapter.id, document: { file: "probe.custom", source: "" } },
		]);

		expect(result.valid).toBe(false);
		expect(result.failures).toEqual([
			{ adapter: adapter.id, phase: "detection", message: "detect failed" },
		]);
	});

	test("keeps supported tagged-template call sites actionable", () => {
		const result = createSourceScannerRegistry().scan({
			file: "styles.tsx",
			source: "const card = css`color: red;`;",
		});
		expect(result.isExcluded(result.document.source.indexOf("css`"))).toBe(false);
	});
});
