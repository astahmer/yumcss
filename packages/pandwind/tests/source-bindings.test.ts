import { describe, expect, test } from "vitest";
import { SourceBindingKind, SourceCallSiteKind, SourceBindings } from "pandwind/source";

describe("source binding index", () => {
	test("resolves named aliases, default imports, and namespace imports", () => {
		const index = SourceBindings.fromDocument({
			file: "styles.tsx",
			source: [
				'import { css as makeCss, keyframes as motion } from "@emotion/react";',
				'import styledFactory from "@emotion/styled";',
				'import * as emotion from "@emotion/css";',
			].join("\n"),
		});

		expect(index.bindings).toEqual([
			expect.objectContaining({
				localName: "makeCss",
				importedName: "css",
				source: "@emotion/react",
				kind: SourceBindingKind.Named,
			}),
			expect.objectContaining({
				localName: "motion",
				importedName: "keyframes",
				source: "@emotion/react",
				kind: SourceBindingKind.Named,
			}),
			expect.objectContaining({
				localName: "styledFactory",
				importedName: "default",
				source: "@emotion/styled",
				kind: SourceBindingKind.Default,
			}),
			expect.objectContaining({
				localName: "emotion",
				importedName: "*",
				source: "@emotion/css",
				kind: SourceBindingKind.Namespace,
			}),
		]);
		expect(index.isImportedFrom("makeCss", "@emotion/react", "css")).toBe(true);
		expect(index.isImportedFrom("styledFactory", "@emotion/styled", "default")).toBe(true);
		expect(index.isImportedFrom("emotion", "@emotion/css", "*")).toBe(true);
		expect(index.fromModule("@emotion/react")).toHaveLength(2);
	});

	test("records re-exported names without confusing them with local imports", () => {
		const index = SourceBindings.fromDocument({
			file: "index.ts",
			source: 'export { css as makeCss, default as styled } from "@emotion/react";',
		});

		expect(index.reexports).toEqual([
			expect.objectContaining({
				exportedName: "makeCss",
				importedName: "css",
				source: "@emotion/react",
			}),
			expect.objectContaining({
				exportedName: "styled",
				importedName: "default",
				source: "@emotion/react",
			}),
		]);
		expect(index.bindings).toEqual([]);
	});

	test("rejects an imported spelling when a local declaration shadows it", () => {
		const index = SourceBindings.fromDocument({
			file: "shadowed.tsx",
			source: [
				'import { css as makeCss } from "@emotion/react";',
				"function render(makeCss: unknown) { return makeCss; }",
				'const card = makeCss({ color: "red" });',
			].join("\n"),
		});

		expect(index.isShadowed("makeCss")).toBe(true);
		expect(index.isImportedFrom("makeCss", "@emotion/react", "css")).toBe(false);
	});

	test("limits shadowing to the nested function scope", () => {
		const source = [
			'import { css as makeCss } from "@emotion/react";',
			"function render(makeCss: unknown) { return makeCss({ color: 'blue' }); }",
			'const card = makeCss({ color: "red" });',
		].join("\n");
		const index = SourceBindings.fromDocument({ file: "scoped.tsx", source });
		const nestedCall = source.indexOf("makeCss({ color: 'blue' })");
		const outerCall = source.indexOf('makeCss({ color: "red" })');

		expect(index.isShadowedAt("makeCss", nestedCall)).toBe(true);
		expect(index.isShadowedAt("makeCss", outerCall)).toBe(false);
		expect(index.isImportedFrom("makeCss", "@emotion/react", "css")).toBe(false);
	});

	test("indexes imported calls and tagged templates with exact AST ranges", () => {
		const source = [
			'import { css as makeCss } from "@emotion/react";',
			'const card = makeCss({ color: "red" });',
			"const label = makeCss`color: blue;`;",
		].join("\n");
		const index = SourceBindings.fromDocument({ file: "calls.tsx", source });

		expect(index.callSites).toHaveLength(2);
		expect(
			index.callSites.map(({ kind, binding, start, end }) => ({
				kind,
				localName: binding?.localName,
				text: source.slice(start, end),
			})),
		).toEqual([
			{
				kind: SourceCallSiteKind.Call,
				localName: "makeCss",
				text: 'makeCss({ color: "red" })',
			},
			{
				kind: SourceCallSiteKind.TaggedTemplate,
				localName: "makeCss",
				text: "makeCss`color: blue;`",
			},
		]);
	});
});
