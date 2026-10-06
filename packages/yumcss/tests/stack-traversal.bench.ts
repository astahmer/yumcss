import { test } from "vitest";
import { walk, type OxcNode } from "../src/tw/literal.ts";
import { TraversalNodeKind } from "./helpers/traversal-node-kind.ts";

const makeTree = (): OxcNode => {
	const root: OxcNode = { type: TraversalNodeKind.Root, children: [] };
	const children = root.children as OxcNode[];
	for (let index = 0; index < 2_000; index++) {
		children.push({ type: TraversalNodeKind.Node, value: index, children: [] });
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

test("AST traversal performance", async ({ bench }) => {
	await bench("explicit depth-first stack", () => {
		let count = 0;
		walk(tree, () => count++);
	}).run();
	await bench("recursive baseline", () => {
		let count = 0;
		recursiveWalk(tree, () => count++);
	}).run();
});
