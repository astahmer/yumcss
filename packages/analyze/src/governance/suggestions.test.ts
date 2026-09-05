import { describe, expect, it } from "vitest";
import { suggestRawTokenReplacements } from "./suggestions.ts";
import type { TokenDefinition, TokenUsage } from "./contracts.ts";

const def = (group: string, name: string, value: string): TokenDefinition => ({
	id: group + "::" + name,
	group,
	name,
	layer: "raw",
	value,
	provenance: [],
});

const rawUse = (file: string, property: string, rawValue: string, start = 0): TokenUsage => ({
	tokenId: "",
	kind: "direct",
	file,
	start,
	end: start + rawValue.length,
	property,
	rawValue,
	strictness: "raw-strict-violation",
	confidence: "verified",
});

const COLOR_DEFS = [def("colors", "brand", "#e11d48"), def("colors", "danger", "#C53030")];

describe("suggestRawTokenReplacements", () => {
	it("suggests exact value matches with authored spelling", () => {
		const { suggestions, diagnostics } = suggestRawTokenReplacements(
			[rawUse("src/a.tsx", "backgroundColor", "#e11d48")],
			COLOR_DEFS,
		);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			tokenId: "colors::brand",
			replacement: "$colors.brand",
			reason: "exact value match for colors::brand",
			confidence: "verified",
		});
		expect(diagnostics).toHaveLength(0);
	});

	it("case-folds hex values but marks them inferred", () => {
		const { suggestions } = suggestRawTokenReplacements(
			[rawUse("src/a.tsx", "color", "#c53030")],
			COLOR_DEFS,
		);
		expect(suggestions[0]).toMatchObject({ tokenId: "colors::danger", confidence: "inferred" });
	});

	it("rejects ambiguous matches with a diagnostic", () => {
		const defs = [def("colors", "a", "#123456"), def("colors", "b", "#123456")];
		const { suggestions, diagnostics } = suggestRawTokenReplacements(
			[rawUse("src/a.tsx", "backgroundColor", "#123456")],
			defs,
		);
		expect(suggestions).toHaveLength(0);
		expect(diagnostics[0]).toMatchObject({
			code: "governance/suggestion-ambiguous",
			severity: "info",
		});
	});

	it("never suggests across incompatible property categories", () => {
		const spacing = def("spacing", "4", "4px");
		const { suggestions } = suggestRawTokenReplacements(
			[rawUse("src/a.tsx", "backgroundColor", "4px")],
			[spacing],
		);
		expect(suggestions).toHaveLength(0);
	});

	it("skips dynamic and token usages", () => {
		const dynamic: TokenUsage = {
			...rawUse("a.tsx", "backgroundColor", "size"),
			strictness: "dynamic" as const,
		};
		const tokenUse: TokenUsage = {
			...rawUse("a.tsx", "backgroundColor", "#e11d48"),
			tokenId: "colors::brand",
		};
		const { suggestions } = suggestRawTokenReplacements([dynamic, tokenUse], COLOR_DEFS);
		expect(suggestions).toHaveLength(0);
	});
	it("never suggests from condition-scoped definitions", () => {
		const scoped: TokenDefinition = {
			id: "semantic::surface",
			group: "semantic",
			name: "surface",
			layer: "scope",
			scopedValues: { light: "#fff", dark: "#000" },
			provenance: [],
		};
		const { suggestions } = suggestRawTokenReplacements(
			[rawUse("a.tsx", "backgroundColor", "#fff")],
			[scoped],
		);
		expect(suggestions).toHaveLength(0);
	});
});
