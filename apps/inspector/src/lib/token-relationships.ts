import type { TokenGraph } from "../types.ts";

export interface TokenRelationships {
	readonly usedBy: TokenGraph["nodes"];
	readonly references: TokenGraph["nodes"];
	readonly isCyclic: boolean;
	readonly isUnlinkedRaw: boolean;
}

export interface TokenNodePresentation {
	readonly label: string;
	readonly variableName: string;
	readonly scope: string | null;
}

const readableScope = (scope: string): string => {
	const theme = /^\[data-theme=["']?([^\]"']+)["']?\]$/.exec(scope);
	if (theme !== null) return `${theme[1]} theme`;
	if (scope === "@theme") return "base theme";
	return scope;
};

const stripCssComments = (source: string): string => {
	let result = "";
	let quote = "";
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index]!;
		if (quote !== "") {
			result += character;
			if (character === "\\") result += source[++index] ?? "";
			else if (character === quote) quote = "";
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			result += character;
			continue;
		}
		if (character === "/" && source[index + 1] === "*") {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) break;
			result += " ";
			index = end + 1;
			continue;
		}
		result += character;
	}
	return result;
};

export const presentTokenNode = (node: TokenGraph["nodes"][number]): TokenNodePresentation => {
	if (node.tier !== "scope") return { label: node.label, variableName: node.id, scope: null };
	const separator = node.label.indexOf(" @ ");
	if (separator < 0) return { label: node.label, variableName: node.label, scope: null };
	const variableName = node.label.slice(0, separator);
	const scope = node.label.slice(separator + 3);
	const cleanScope = stripCssComments(scope).trim();
	return {
		label: `${variableName} · ${readableScope(cleanScope)}`,
		variableName,
		scope: cleanScope,
	};
};

export const mostConnectedTokenId = (graph: TokenGraph): string | null => {
	const connections = new Map<string, number>();
	for (const edge of graph.edges) {
		connections.set(edge.from, (connections.get(edge.from) ?? 0) + 1);
		connections.set(edge.to, (connections.get(edge.to) ?? 0) + 1);
	}
	return (
		graph.nodes
			.toSorted(
				(a, b) =>
					(connections.get(b.id) ?? 0) - (connections.get(a.id) ?? 0) ||
					a.label.localeCompare(b.label),
			)
			.at(0)?.id ?? null
	);
};

export const getTokenRelationships = (graph: TokenGraph, selectedId: string): TokenRelationships => {
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
	const usedBy = graph.edges
		.filter((edge) => edge.to === selectedId)
		.map((edge) => nodeById.get(edge.from))
		.filter((node): node is NonNullable<typeof node> => node !== undefined)
		.toSorted((a, b) => a.label.localeCompare(b.label));
	const references = graph.edges
		.filter((edge) => edge.from === selectedId)
		.map((edge) => nodeById.get(edge.to))
		.filter((node): node is NonNullable<typeof node> => node !== undefined)
		.toSorted((a, b) => a.label.localeCompare(b.label));

	return {
		usedBy,
		references,
		isCyclic: graph.cycles.some((cycle) => cycle.includes(selectedId)),
		isUnlinkedRaw: graph.orphans.includes(selectedId),
	};
};
