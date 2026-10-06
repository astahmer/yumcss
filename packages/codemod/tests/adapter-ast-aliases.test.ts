import { describe, expect, test } from "vitest";
import { SOURCE_SCANNER_SERVICE, SourceBindings } from "yumcss/source";
import { getCodemodAdapter } from "../src/swap/index.ts";
import { CodemodAdapterId } from "../src/swap/identifiers.ts";

describe("adapter semantic binding resolution", () => {
	test("Emotion parses authored aliases through the shared AST index", () => {
		const source = [
			'import { css as makeCss } from "@emotion/react";',
			'import * as emotion from "@emotion/css";',
			"export const card = makeCss({ color: 'red' });",
			"export const panel = emotion.css({ padding: 4 });",
		].join("\n");
		const adapter = getCodemodAdapter(CodemodAdapterId.Emotion);
		expect(adapter).toBeDefined();
		if (adapter === undefined) return;
		const document = SOURCE_SCANNER_SERVICE.scan({ file: "styles.tsx", source });
		const bindings = SourceBindings.fromDocument(document.document);
		const config = adapter.loadConfig({ file: "styles.tsx", source });
		const result = adapter.parse(source, {
			file: "styles.tsx",
			source,
			config,
			document,
			bindings,
		});

		expect(result.matches).toHaveLength(2);
		expect(result.matches.map((match) => match.sourceText)).toMatchInlineSnapshot(`
			[
			  "makeCss({ color: 'red' })",
			  "emotion.css({ padding: 4 })",
			]
		`);
		expect(result.residuals).toEqual([]);
	});

	test("does not parse a shadowed Emotion alias as an imported style call", () => {
		const source = [
			'import { css as makeCss } from "@emotion/react";',
			"function render(makeCss: unknown) { return makeCss({ color: 'red' }); }",
		].join("\n");
		const adapter = getCodemodAdapter(CodemodAdapterId.Emotion);
		expect(adapter).toBeDefined();
		if (adapter === undefined) return;
		const document = SOURCE_SCANNER_SERVICE.scan({ file: "shadowed.tsx", source });
		const result = adapter.parse(source, {
			file: "shadowed.tsx",
			source,
			config: adapter.loadConfig({ file: "shadowed.tsx", source }),
			document,
			bindings: SourceBindings.fromDocument(document.document),
		});

		expect(result.matches).toEqual([]);
		expect(result.residuals).toEqual([]);
	});

	test("still parses the imported alias outside a nested shadow scope", () => {
		const source = [
			'import { css as makeCss } from "@emotion/react";',
			"function render(makeCss: unknown) { return makeCss({ color: 'blue' }); }",
			'export const card = makeCss({ color: "red" });',
		].join("\n");
		const adapter = getCodemodAdapter(CodemodAdapterId.Emotion);
		expect(adapter).toBeDefined();
		if (adapter === undefined) return;
		const document = SOURCE_SCANNER_SERVICE.scan({ file: "scoped.tsx", source });
		const result = adapter.parse(source, {
			file: "scoped.tsx",
			source,
			config: adapter.loadConfig({ file: "scoped.tsx", source }),
			document,
			bindings: SourceBindings.fromDocument(document.document),
		});

		expect(result.matches.map((match) => match.sourceText)).toEqual(['makeCss({ color: "red" })']);
	});
});
