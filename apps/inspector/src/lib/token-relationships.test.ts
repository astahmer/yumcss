import { describe, expect, test } from "vitest";
import type { TokenGraph } from "../types.ts";
import {
	getTokenRelationships,
	mostConnectedTokenId,
	presentTokenNode,
} from "./token-relationships.ts";

const graph: TokenGraph = {
	nodes: [
		{ id: "component:Button.fill", tier: "component", label: "Button.fill" },
		{ id: "--button-fill", tier: "semantic", label: "--button-fill" },
		{ id: "--blue-600", tier: "raw", label: "--blue-600" },
		{ id: "--unlinked", tier: "raw", label: "--unlinked" },
	],
	edges: [
		{ from: "component:Button.fill", to: "--button-fill" },
		{ from: "--button-fill", to: "--blue-600" },
		{ from: "--blue-600", to: "--button-fill" },
	],
	cycles: [["--button-fill", "--blue-600", "--button-fill"]],
	orphans: ["--unlinked"],
	reachability: {},
	dangling: [],
};

describe("token relationships", () => {
	test("starts on the most connected token", () => {
		expect(mostConnectedTokenId(graph)).toBe("--button-fill");
	});

	test("shows direct dependents, references, cycles, and unlinked raw variables", () => {
		expect(getTokenRelationships(graph, "--button-fill")).toEqual({
			usedBy: [
				{ id: "--blue-600", tier: "raw", label: "--blue-600" },
				{ id: "component:Button.fill", tier: "component", label: "Button.fill" },
			],
			references: [{ id: "--blue-600", tier: "raw", label: "--blue-600" }],
			isCyclic: true,
			isUnlinkedRaw: false,
		});
		expect(getTokenRelationships(graph, "--unlinked")).toMatchObject({
			usedBy: [],
			references: [],
			isCyclic: false,
			isUnlinkedRaw: true,
		});
	});
	test("presents theme scopes without CSS comments", () => {
		expect(
			presentTokenNode({
				id: 'theme:/* condition override */ [data-theme="forest"]:--color-surface',
				tier: "scope",
				label: '--color-surface @ /* condition override */ [data-theme="forest"]',
			}),
		).toEqual({
			label: "--color-surface · forest theme",
			variableName: "--color-surface",
			scope: '[data-theme="forest"]',
		});
	});
});
