import { bench, describe } from "vitest";
import { walk, type OxcNode } from "../src/tw/literal.ts";

const makeTree = (): OxcNode => {
	const root: OxcNode = { type: "Root", children: [] };
	const children = root.children as OxcNode[];
	for (let index = 0; index < 2_000; index++) {
		children.push({ type: "Node", value: index, children: [] });
	}
	return root;
};

const tree = makeTree();

const recursiveWalk = (node: unknown, visit: (node: OxcNode) => void): void => {
	if (Array.isArray(node)) {
		for (const item of node) recursiveWalk(item, visit);
		return;
	}
	if (node === null || typeof node !== "object") return;
	const current = node as OxcNode;
	if (typeof current.type === "string") visit(current);
	for (const value of Object.values(current)) recursiveWalk(value, visit);
};

describe("AST traversal performance", () => {
	bench("explicit depth-first stack", () => {
		let count = 0;
		walk(tree, () => count++);
	});

	bench("recursive baseline", () => {
		let count = 0;
		recursiveWalk(tree, () => count++);
	});
});
