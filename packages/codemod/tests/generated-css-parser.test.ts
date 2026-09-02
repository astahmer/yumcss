import { describe, expect, test } from "vitest";
import { parseGeneratedCss } from "../src/swap/generated-css-parser.ts";

describe("generated CSS parser", () => {
	test("preserves nested rule order", () => {
		const nodes = parseGeneratedCss(
			"@media (min-width: 40rem){.card:hover{color:red;padding:1rem}}\n",
		);
		expect(nodes).toMatchInlineSnapshot(`
			[
			  {
			    "name": "media",
			    "nodes": [
			      {
			        "nodes": [
			          {
			            "prop": "color",
			            "type": "decl",
			            "value": "red",
			          },
			          {
			            "prop": "padding",
			            "type": "decl",
			            "value": "1rem",
			          },
			        ],
			        "selector": ".card:hover",
			        "type": "rule",
			      },
			    ],
			    "params": "(min-width: 40rem)",
			    "type": "atrule",
			  },
			]
		`);
	});

	test("parses deeply nested generated CSS without recursion", () => {
		const depth = 10_000;
		const css = `${".level{".repeat(depth)}color:red;${"}".repeat(depth)}`;
		const nodes = parseGeneratedCss(css);
		let rules = 0;
		const stack = [...nodes];
		while (stack.length > 0) {
			const node = stack.pop()!;
			if (node.type === "rule") {
				rules++;
				stack.push(...node.nodes);
			} else if (node.type === "atrule") {
				stack.push(...(node.nodes ?? []));
			}
		}
		expect(rules).toBe(depth);
	});
});
