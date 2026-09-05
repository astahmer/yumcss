import { describe, expect, test } from "vitest";
import { SourceBindingKind, SourceCallSiteKind, SourceBindings } from "../src/source-bindings.ts";

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
		expect(
			index.callSites.map(({ kind, localName, assignedBinding }) => ({
				kind,
				localName,
				assignedBinding,
			})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "assignedBinding": "card",
			    "kind": "call",
			    "localName": "makeCss",
			  },
			  {
			    "assignedBinding": "label",
			    "kind": "tagged-template",
			    "localName": "makeCss",
			  },
			]
		`);
		expect(index.callSites.map(({ assignedBinding }) => assignedBinding)).toEqual([
			"card",
			"label",
		]);
	});

	test("resolves assignments through generic call expressions", () => {
		const source = [
			'import { styled } from "solid-styled-components";',
			'const Card = styled(Base)<{ color: string }>(({ color }) => ({ color }));',
		].join("\n");
		const index = SourceBindings.fromDocument({ file: "Card.tsx", source });
		const call = index.callSites.find((site) => site.assignedBinding === "Card");

		expect(call).toEqual(
			expect.objectContaining({
				kind: SourceCallSiteKind.Call,
				localName: "styled",
				assignedBinding: "Card",
			}),
		);
		expect(source.slice(call!.start, call!.end)).toBe(
			' styled(Base)<{ color: string }>(({ color }) => ({ color }))'.trimStart(),
		);
	});

	test("recovers the valid prefix when a later statement is malformed", () => {
		const source = [
			'import { css } from "@emotion/css";',
			'const card = css({ color: "red" });',
			"const unfinished = {",
		].join("\n");
		const index = SourceBindings.fromDocument({ file: "malformed.tsx", source });

		expect(index.isImportedFrom("css", "@emotion/css", "css")).toBe(true);
		expect(index.callSites.map(({ start, end }) => source.slice(start, end))).toEqual([
			'css({ color: "red" })',
		]);
	});

	test("indexes JSX component and attribute uses without spelling heuristics", () => {
		const source = [
			'import { css as makeCss } from "@emotion/react";',
			'const Card = makeCss({ color: "red" });',
			"export const App = () => <Card className={Card} css={Card} />;",
		].join("\n");
		const index = SourceBindings.fromDocument({ file: "hosts.tsx", source });

		expect(index.hostUses).toMatchInlineSnapshot(`
			[
			  {
			    "end": 150,
			    "kind": "component",
			    "localName": "Card",
			    "start": 114,
			  },
			  {
			    "end": 136,
			    "kind": "attribute",
			    "localName": "Card",
			    "start": 120,
			  },
			  {
			    "end": 147,
			    "kind": "attribute",
			    "localName": "Card",
			    "start": 137,
			  },
			]
		`);
		expect(index.hasComponentUse("Card")).toBe(true);
		expect(index.hasAttributeUse("Card")).toBe(true);
		expect(index.hasInlineAttributeUse(source.indexOf("Card} />"))).toBe(true);
	});

	test("indexes script bindings and template hosts in a Vue SFC", () => {
		const source = [
			"<script setup>",
			'import { css as makeCss } from "@emotion/react";',
			'const Card = makeCss({ color: "red" });',
			"</script>",
			'<template><Card :class="Card" /></template>',
		].join("\n");
		const index = SourceBindings.fromDocument({ file: "Card.vue", source });

		expect(index.bindings).toMatchInlineSnapshot(`
			[
			  {
			    "importedName": "css",
			    "kind": "named",
			    "localName": "makeCss",
			    "range": {
			      "end": 38,
			      "start": 24,
			    },
			    "source": "@emotion/react",
			  },
			]
		`);
		expect(
			index.callSites.map(({ localName, assignedBinding }) => ({ localName, assignedBinding })),
		).toEqual([{ localName: "makeCss", assignedBinding: "Card" }]);
		expect(index.hasComponentUse("Card")).toBe(true);
		expect(index.hasAttributeUse("Card")).toBe(true);
	});
});
