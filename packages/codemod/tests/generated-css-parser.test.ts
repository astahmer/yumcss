import { describe, expect, test } from "vitest";
import { GeneratedCssNodeKind, parseGeneratedCss } from "../src/swap/generated-css-parser.ts";

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
			if (node.type === GeneratedCssNodeKind.Rule) {
				rules++;
				stack.push(...node.nodes);
			} else if (node.type === GeneratedCssNodeKind.AtRule) {
				stack.push(...(node.nodes ?? []));
			}
		}
		expect(rules).toBe(depth);
	});

	test("terminates on malformed non-CSS input", () => {
		// A stray `{` with no matching brace (for example truncated JSON
		// concatenated before generated CSS) previously spun the parser
		// forever because the empty-prelude branch did not advance.
		const css =
			'{\n  "name": "unocss-next"\n}\n@property --x{syntax:"<color>";initial-value:red}\n';
		const nodes = parseGeneratedCss(css);
		expect(Array.isArray(nodes)).toBe(true);
		expect(() => parseGeneratedCss('{"name":"x"')).not.toThrow();
	});

	test("does not terminate a selector at an escaped quote", () => {
		const nodes = parseGeneratedCss(
			'.font-\\[\\"Times_New_Roman\\"\\]{font-family:Times}.text-sm{font-size:.875rem}',
		);

		expect(nodes).toHaveLength(2);
		expect(nodes[0]).toMatchObject({
			type: GeneratedCssNodeKind.Rule,
			selector: '.font-\\[\\"Times_New_Roman\\"\\]',
		});
		expect(nodes[1]).toMatchObject({
			type: GeneratedCssNodeKind.Rule,
			selector: '.text-sm',
		});
	});
});
