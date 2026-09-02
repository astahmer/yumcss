import { pathToFileURL } from "node:url";
import type { TokenSet } from "./token-format-contracts.ts";

export const createTokenSet = (): TokenSet => ({ groups: {} });

export const putToken = (set: TokenSet, group: string, key: string, value: string): void => {
	const values = set.groups[group] ?? (set.groups[group] = {});
	if (values[key] === undefined) values[key] = value;
};

export class TokenTreeWalker {
	static visit(
		root: unknown,
		visitor: (node: Record<string, unknown>, path: readonly string[]) => boolean | void,
	): void {
		const stack: Array<{ node: unknown; path: string[] }> = [{ node: root, path: [] }];
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (typeof current.node !== "object" || current.node === null) continue;
			const node = current.node as Record<string, unknown>;
			if (visitor(node, current.path) === true) continue;
			const entries = Object.entries(node);
			for (let index = entries.length - 1; index >= 0; index--) {
				const [key, child] = entries[index]!;
				stack.push({ node: child, path: [...current.path, key] });
			}
		}
	}
}

export const flattenNested = (
	node: Record<string, unknown>,
	prefix: string[],
	out: Record<string, string>,
): void => {
	const stack: Array<{ node: Record<string, unknown>; prefix: string[] }> = [{ node, prefix }];
	while (stack.length > 0) {
		const current = stack.pop()!;
		const entries = Object.entries(current.node);
		for (let index = entries.length - 1; index >= 0; index--) {
			const [key, value] = entries[index]!;
			const path = [...current.prefix, key];
			if (typeof value === "string") out[path.join("-")] = value;
			else if (typeof value === "object" && value !== null) {
				const leaf = (value as { value?: unknown }).value;
				if (typeof leaf === "string") out[path.join("-")] = leaf;
				else stack.push({ node: value as Record<string, unknown>, prefix: path });
			}
		}
	}
};

export const importModule = async (path: string): Promise<Record<string, unknown>> =>
	(await import(pathToFileURL(path).href)) as Record<string, unknown>;

export const findPresetTokens = (
	module: Record<string, unknown>,
): Record<string, Record<string, string>> | undefined => {
	for (const value of Object.values(module)) {
		if (typeof value !== "object" || value === null) continue;
		const tokens = (value as { tokens?: unknown }).tokens;
		if (typeof tokens === "object" && tokens !== null)
			return tokens as Record<string, Record<string, string>>;
	}
	return undefined;
};

const renderTokenTreeNode = (node: Record<string, unknown>, indent: string): string => `{
${Object.entries(node)
	.map(([key, value]) =>
		typeof value === "object" && value !== null && !("value" in value)
			? `${indent}\t${JSON.stringify(key)}: ${renderTokenTreeNode(value as Record<string, unknown>, `${indent}\t`)},`
			: `${indent}\t${JSON.stringify(key)}: { value: ${JSON.stringify((value as { value: string }).value)} },`,
	)
	.join("\n")}
${indent}}`;

export const renderTokenTree = (values: Record<string, string>): string => {
	const tree: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values)) {
		let node = tree;
		const segments = key.split("-");
		for (const segment of segments.slice(0, -1))
			node = (node[segment] as Record<string, unknown>) ?? (node[segment] = {});
		node[segments.at(-1)!] = { value };
	}
	return renderTokenTreeNode(tree, "\t\t");
};

export const exportNested = (
	groups: Record<string, Record<string, string>>,
	leaf: (value: string, group: string) => unknown,
): string => {
	const root: Record<string, unknown> = {};
	for (const [group, values] of Object.entries(groups)) {
		const groupNode: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			let node = groupNode;
			const segments = key.split("-");
			for (const segment of segments.slice(0, -1))
				node = (node[segment] as Record<string, unknown>) ?? (node[segment] = {});
			node[segments.at(-1)!] = leaf(value, group);
		}
		root[group] = groupNode;
	}
	return JSON.stringify(root, null, "\t") + "\n";
};
