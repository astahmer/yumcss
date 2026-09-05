import { describe, expect, test } from "vitest";
import { compileStyles, type TwNestedStyles } from "../src/tw/compile.ts";
import { walk, walkWithParent, type OxcNode } from "../src/tw/literal.ts";
import { SemanticRuleSerializer } from "../src/css/runtime-sheet-serializer.ts";
import { RuntimeSemanticRuleKindTag } from "../src/css/runtime-sheet-contracts.ts";
import type { RuntimeSemanticRule } from "../src/css/runtime-sheet-contracts.ts";
import { resolveVar } from "../src/tw/theme.ts";
import { TraversalNodeKind } from "./helpers/traversal-node-kind.ts";

describe("iterative Oxc traversal", () => {
	test("keeps depth-first source order and parent context", () => {
		const root: OxcNode = {
			type: TraversalNodeKind.Program,
			body: [
				{ type: TraversalNodeKind.First, child: { type: TraversalNodeKind.Nested } },
				{ type: TraversalNodeKind.Second },
			],
		};
		const order: string[] = [];
		const parents: string[] = [];

		walk(root, (node) => order.push(node.type));
		walkWithParent(root, (node, parent) => {
			if (node.type === TraversalNodeKind.Nested)
				parents.push(parent?.type ?? TraversalNodeKind.None);
		});

		expect(order).toMatchInlineSnapshot(`
			[
			  "Program",
			  "First",
			  "Nested",
			  "Second",
			]
		`);
		expect(parents).toEqual(["First"]);
	});

	test("handles a deeply nested AST without consuming the JS call stack", () => {
		const depth = 12_000;
		const root: OxcNode = { type: TraversalNodeKind.Root };
		let current = root;
		for (let index = 0; index < depth; index++) {
			const child: OxcNode = { type: TraversalNodeKind.Node, index };
			current.child = child;
			current = child;
		}

		let visited = 0;
		let deepestParentDepth = 0;
		walk(root, () => visited++);
		walkWithParent(root, (_node, _parent, ancestors) => {
			if (ancestors.length > deepestParentDepth) deepestParentDepth = ancestors.length;
		});

		expect(visited).toBe(depth + 1);
		expect(deepestParentDepth).toBe(depth);
	});

	test("compiles a deeply nested variant object without recursion", () => {
		const depth = 4_000;
		const root: TwNestedStyles = {};
		let current = root;
		for (let index = 0; index < depth; index++) {
			const child: TwNestedStyles = {};
			current[`level-${index}`] = child;
			current = child;
		}
		current.color = "red";

		const result = compileStyles(root, {});

		expect(result.endsWith("color-red")).toBe(true);
		expect(result.split(":").length).toBe(depth + 1);
	});

	test("serializes a deeply nested runtime rule without recursion", () => {
		const depth = 10_000;
		let child: RuntimeSemanticRule = {
			kind: RuntimeSemanticRuleKindTag.Style,
			selector: ".leaf",
			declarations: [{ property: "color", value: "red" }],
			children: [],
		};
		for (let index = 0; index < depth; index++) {
			child = {
				kind: RuntimeSemanticRuleKindTag.Layer,
				name: `layer-${index}`,
				declarations: [],
				children: [child],
			};
		}

		const css = new SemanticRuleSerializer().serialize(child);

		expect(css.startsWith("@layer layer-9999{")).toBe(true);
		expect(css).toContain(".leaf{color:red}");
		expect((css.match(/@layer /g) ?? []).length).toBe(depth);
	});

	test("resolves a deep CSS-variable chain iteratively and stops cycles", () => {
		const depth = 12_000;
		const variables = new Map<string, string>();
		for (let index = 0; index < depth; index++) {
			variables.set(`--level-${index}`, index === depth - 1 ? "red" : `var(--level-${index + 1})`);
		}
		variables.set("--cycle-a", "var(--cycle-b)");
		variables.set("--cycle-b", "var(--cycle-a)");

		expect(resolveVar("var(--level-0)", variables)).toBe("red");
		expect(resolveVar("var(--cycle-a)", variables)).toBe("var(--cycle-a)");
	});
});
