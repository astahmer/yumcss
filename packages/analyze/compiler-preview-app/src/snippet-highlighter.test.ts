import { describe, expect, test } from "vitest";
import { tokenizeSnippet } from "./snippet-highlighter.ts";

describe("tokenizeSnippet", () => {
	test("preserves TypeScript source and identifies useful syntax", () => {
		const source = 'const button = css.class({ color: tone, gap: 2, label: "ready" }); // preview';
		const tokens = tokenizeSnippet(source, "Button.tsx");

		expect(tokens.map((token) => token.text).join("")).toBe(source);
		expect(tokens).toContainEqual({ text: "const", kind: "keyword" });
		expect(tokens).toContainEqual({ text: "class", kind: "property" });
		expect(tokens).toContainEqual({ text: "2", kind: "number" });
		expect(tokens).toContainEqual({ text: '"ready"', kind: "string" });
		expect(tokens).toContainEqual({ text: "// preview", kind: "comment" });
	});

	test("highlights CSS selectors, properties, values, and comments", () => {
		const source = ".card { color: #f00; gap: var(--space-2); /* tuned */ }";
		const tokens = tokenizeSnippet(source, "card.css");

		expect(tokens.map((token) => token.text).join("")).toBe(source);
		expect(tokens).toContainEqual({ text: ".card", kind: "selector" });
		expect(tokens).toContainEqual({ text: "color", kind: "property" });
		expect(tokens).toContainEqual({ text: "#f00", kind: "literal" });
		expect(tokens).toContainEqual({ text: "var", kind: "function" });
		expect(tokens).toContainEqual({ text: "--space-2", kind: "property" });
		expect(tokens).toContainEqual({ text: "/* tuned */", kind: "comment" });
	});

	test("leaves unknown formats untouched", () => {
		const source = "plain source: <tag>";

		expect(tokenizeSnippet(source, "README.md")).toEqual([{ text: source, kind: null }]);
	});

	test("leaves large modules as plain text", () => {
		const source = "const card = 1;\n".repeat(15_000);

		expect(tokenizeSnippet(source, "Card.tsx")).toEqual([{ text: source, kind: null }]);
	});
});
