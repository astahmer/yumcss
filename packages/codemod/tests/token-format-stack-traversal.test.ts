import { describe, expect, test } from "vitest";
import { dtcgTokenFormat } from "../src/swap/token-formats/dtcg.ts";
import { figmaTokenFormat } from "../src/swap/token-formats/figma.ts";
import { styleDictionaryTokenFormat } from "../src/swap/token-formats/style-dictionary.ts";
import { TokenTreeWalker, flattenNested } from "../src/swap/token-format-support.ts";
import { literalValueToPlain, parseObjectLiteral, type LitValue } from "../src/swap/parse.ts";

describe("iterative token tree traversal", () => {
	test("keeps token format imports equivalent", () => {
		const source = JSON.stringify({
			colors: { brand: { $value: "#123456", $description: "brand" } },
			spacing: { card: { value: "17px", type: "dimension" } },
			fontSizes: { heading: { value: "2rem", type: "fontSizes" } },
		});

		expect(dtcgTokenFormat.importText!(source).groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand": "#123456",
			  },
			}
		`);
		expect(styleDictionaryTokenFormat.importText!(source).groups.spacing).toEqual({ card: "17px" });
		expect(figmaTokenFormat.importText!(source).groups.fontSizes).toEqual({ heading: "2rem" });
	});

	test("handles a deep token tree without recursion", () => {
		const depth = 12_000;
		const root: Record<string, unknown> = {};
		let current = root;
		for (let index = 0; index < depth; index++) {
			const child: Record<string, unknown> = {};
			current[`level-${index}`] = child;
			current = child;
		}
		current.value = "#123456";

		let visited = 0;
		TokenTreeWalker.visit(root, () => {
			visited++;
		});
		const flattened: Record<string, string> = {};
		flattenNested(root, [], flattened);

		expect(visited).toBe(depth + 1);
		expect(Object.keys(flattened)).toHaveLength(1);
	});

	test("converts a deeply nested literal without recursion", () => {
		const depth = 12_000;
		let value: LitValue = "#123456";
		for (let index = 0; index < depth; index++)
			value = { keys: [{ key: `level-${index}`, value }] };

		const plain = literalValueToPlain(value) as Record<string, unknown>;
		let current: unknown = plain;
		for (let index = depth - 1; index >= 0; index--) {
			expect(current).toBeTypeOf("object");
			current = (current as Record<string, unknown>)[`level-${index}`];
		}
		expect(current).toBe("#123456");
	});

	test("parses a deeply nested object literal without recursion", () => {
		const depth = 10_000;
		const body = `${Array.from({ length: depth }, (_, index) => `level-${index}: {`).join("")}value: "#123456"${"}".repeat(depth)}`;

		const parsed = parseObjectLiteral(body);

		expect(parsed).not.toBeNull();
		expect(literalValueToPlain(parsed!)).toBeDefined();
	});
});
