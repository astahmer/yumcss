import { describe, expect, it } from "vitest";
import {
	TOKEN_GOVERNANCE_REPORT_VERSION,
	type TokenDefinition,
	type TokenUsage,
} from "./contracts.ts";
import { buildTokenGovernanceReport, type GovernanceInputs } from "./report.ts";

const provenance = (source: TokenDefinition["provenance"][number]["source"], file?: string) => [
	{ source, ...(file === undefined ? {} : { file }) },
];

const def = (group: string, name: string, value: string, extra?: Partial<TokenDefinition>): TokenDefinition => ({
	id: `${group}::${name}`,
	group,
	name,
	layer: "raw",
	value,
	provenance: provenance("official-config"),
	...extra,
});

const use = (tokenIdValue: string, file: string, start: number, strictness: TokenUsage["strictness"] = "token"): TokenUsage => ({
	tokenId: tokenIdValue,
	kind: "direct",
	file,
	start,
	end: start + 10,
	strictness,
	confidence: "verified",
});

const baseInputs = (overrides: Partial<GovernanceInputs> = {}): GovernanceInputs => ({
	root: "/repo",
	definitions: [],
	usage: [],
	suggestions: [],
	unusedCandidates: [],
	diagnostics: [],
	...overrides,
});

describe("buildTokenGovernanceReport", () => {
	it("exposes the versioned contract", () => {
		const report = buildTokenGovernanceReport(baseInputs());
		expect(report.version).toBe(TOKEN_GOVERNANCE_REPORT_VERSION);
		expect(report.summary.defined).toBe(0);
	});

	it("dedupes definitions by canonical id while merging provenance", () => {
		const report = buildTokenGovernanceReport(
			baseInputs({
				definitions: [
					def("colors", "brand", "#e11d48"),
					{
						...def("colors", "brand", "#e11d48"),
						provenance: provenance("imported-css", "src/theme.css"),
					},
				],
			}),
		);
		expect(report.definitions).toHaveLength(1);
		expect(report.definitions[0]!.provenance.map((p) => p.source)).toEqual([
			"official-config",
			"imported-css",
		]);
		expect(report.summary.defined).toBe(1);
	});

	it("drops unused candidates for tokens that are actually used", () => {
		const report = buildTokenGovernanceReport(
			baseInputs({
				definitions: [def("colors", "brand", "#e11d48"), def("colors", "legacy", "#000")],
				usage: [use("colors::brand", "src/app.tsx", 0)],
				unusedCandidates: [
					{ tokenId: "colors::legacy", safety: "safe-to-remove", reasons: [], boundaries: [] },
					{ tokenId: "colors::brand", safety: "safe-to-remove", reasons: [], boundaries: [] },
					{ tokenId: "colors::ghost", safety: "safe-to-remove", reasons: [], boundaries: [] },
				],
			}),
		);
		expect(report.unusedCandidates.map((c) => c.tokenId)).toEqual(["colors::legacy"]);
		expect(report.summary.used).toBe(1);
		expect(report.summary.unusedCandidates).toBe(1);
	});

	it("keeps the strongest observation when usage sites collide", () => {
		const report = buildTokenGovernanceReport(
			baseInputs({
				definitions: [def("colors", "brand", "#e11d48")],
				usage: [
					use("colors::brand", "src/app.tsx", 0, "unknown"),
					use("colors::brand", "src/app.tsx", 0, "token"),
				],
			}),
		);
		expect(report.usage).toHaveLength(1);
		expect(report.usage[0]!.strictness).toBe("token");
	});

	it("counts every boundary explicitly, zero included", () => {
		const report = buildTokenGovernanceReport(
			baseInputs({
				definitions: [def("colors", "brand", "#e11d48")],
				boundaryHits: { "public-export": ["colors::brand"] },
			}),
		);
		expect(report.summary.boundaries["public-export"]).toBe(1);
		expect(report.summary.boundaries["generated-css"]).toBe(0);
	});

	it("produces a deterministic report across runs", () => {
		const inputs = () =>
			baseInputs({
				definitions: [def("colors", "brand", "#e11d48"), def("spacing", "card", "16px")],
				usage: [use("colors::brand", "src/app.tsx", 0)],
				suggestions: [
					{
						file: "src/app.tsx",
						start: 0,
						end: 9,
						rawValue: "#e11d48",
						tokenId: "colors::brand",
						replacement: "$colors.brand",
						reason: "exact value match",
						confidence: "verified",
					},
				],
				unusedCandidates: [
					{ tokenId: "spacing::card", safety: "safe-to-remove", reasons: [], boundaries: [] },
				],
				diagnostics: [
					{ severity: "warning", code: "test/unknown", message: "dynamic lookup" },
				],
			});
		const a = buildTokenGovernanceReport(inputs());
		const b = buildTokenGovernanceReport(inputs());
		expect(a).toEqual(b);
		expect(a.summary.safeToRemove).toBe(1);
		expect(a.summary.suggestions).toBe(1);
	});
});
