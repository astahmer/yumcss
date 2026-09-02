import { describe, expect, test } from "vitest";
import { pandaStyleToIr } from "../src/swap/adapters/panda/parse.ts";
import { orderStyleRules, StyleRuleKindTag, type StyleRule } from "../src/swap/semantic-ir.ts";
import { TokenCatalog } from "../src/swap/tokens.ts";

describe("Panda style traversal", () => {
	test("lowers deeply nested selectors without recursion", () => {
		const depth = 2_000;
		const root: Record<string, unknown> = {};
		let current = root;
		for (let index = 0; index < depth; index++) {
			const child: Record<string, unknown> = {};
			current[`& .level-${index}`] = child;
			current = child;
		}
		current.color = "red";

		const result = pandaStyleToIr(root);

		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.conditions).toHaveLength(depth);
		expect(result.entries[0]?.value).toBe("red");
		expect(result.residuals).toEqual([]);
	});

	test("flattens deeply nested token metadata without recursion", () => {
		const depth = 6_000;
		const colors: Record<string, unknown> = {};
		let current = colors;
		for (let index = 0; index < depth; index++) {
			const child: Record<string, unknown> = {};
			current[`level-${index}`] = child;
			current = child;
		}
		current.value = "#123456";

		const catalog = TokenCatalog.fromNested({ colors });
		const match = catalog?.findUnique(["colors"], "#123456");

		expect(match?.group).toBe("colors");
		expect(match?.key.split(".")).toHaveLength(depth);
	});

	test("orders deeply nested semantic rules without recursion", () => {
		const depth = 10_000;
		let child: StyleRule = {
			kind: StyleRuleKindTag.Style,
			conditions: [],
			declarations: [],
			children: [],
			order: depth,
		};
		for (let index = depth - 1; index >= 0; index--) {
			child = { ...child, children: [child], order: index };
		}

		const ordered = orderStyleRules([child]);
		let visited = 0;
		const work = [...ordered];
		while (work.length > 0) {
			const rule = work.pop()!;
			visited++;
			work.push(...rule.children);
		}

		expect(visited).toBe(depth + 1);
		expect(ordered[0]?.order).toBe(0);
	});
});
