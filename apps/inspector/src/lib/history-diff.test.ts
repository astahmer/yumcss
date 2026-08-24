/** History diff helpers — versioned snapshot runs, side-by-side deltas. */
import { describe, expect, test } from "vitest";
import type { StudioPayload } from "../types.ts";
import { diffRuns, type HistoryEntry } from "./history-diff.ts";

function payload(overrides: {
	eliminatedPct?: number;
	runtimeCalls?: number;
	cssBytes?: number;
	deadSample?: string[];
	totalMissingCss?: number;
}): StudioPayload {
	return {
		meta: { root: "/repo" },
		coverage: {
			eliminatedPct: overrides.eliminatedPct ?? 40,
			entryEliminatedPct: 35,
			totalCxCalls: 90,
			fullFolded: 30,
			partialFolded: 6,
			runtimeCalls: overrides.runtimeCalls ?? 50,
			totalTwCalls: 120,
			twFolded: 100,
			totalMissingCss: overrides.totalMissingCss ?? 2,
			files: [],
			runtimeSites: [],
			missingCssSites: [],
			budget: {
				cssBytes: overrides.cssBytes ?? 12_000,
				cssGzipBytes: 3_000,
				rules: 80,
				liveCandidates: 42,
				deadCandidates: (overrides.deadSample ?? []).length,
				deadSample: overrides.deadSample ?? [],
				perPrefix: [],
			},
			shape: { totalRules: 0, totalBytes: 0, categories: [], specificity: [] },
		},
		classDrillDown: [],
		designSystem: {
			themeVars: [],
			utilities: [],
			variantCount: 0,
			conflictUtilities: 0,
			composeUtilities: 0,
			bridgeProperties: 0,
			bridgeMappings: 0,
			tokenSections: [],
		},
	};
}

const entry = (ts: string, p: StudioPayload): HistoryEntry => ({
	timestamp: ts,
	parent: null,
	payload: p,
});

describe("diffRuns", () => {
	test("computes coverage and budget deltas", () => {
		const a = entry("2026-01-01T00:00:00Z", payload({ eliminatedPct: 40, cssBytes: 12_000 }));
		const b = entry("2026-01-02T00:00:00Z", payload({ eliminatedPct: 46, cssBytes: 11_000 }));
		const d = diffRuns(a, b);
		expect(d.coverage.find((m) => m.label === "eliminated %")).toEqual({
			label: "eliminated %",
			before: 40,
			after: 46,
			delta: 6,
		});
		expect(d.budget.find((m) => m.label === "css bytes")?.delta).toBe(-1_000);
	});

	test("classifies resolved vs new dead candidates", () => {
		const a = entry("t1", payload({ deadSample: ["py-0.5", "bg-surface"] }));
		const b = entry("t2", payload({ deadSample: ["bg-surface", "mx-auto"] }));
		const d = diffRuns(a, b);
		expect(d.resolvedDead).toEqual(["py-0.5"]);
		expect(d.newDead).toEqual(["mx-auto"]);
	});

	test("missing-css delta is signed", () => {
		const a = entry("t1", payload({ totalMissingCss: 1 }));
		const b = entry("t2", payload({ totalMissingCss: 4 }));
		expect(diffRuns(a, b).missingCssDelta).toBe(3);
	});
});
