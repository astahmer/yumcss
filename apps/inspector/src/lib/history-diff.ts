/**
 * Run-history diff helpers — pure functions shared by the node server and
 * the browser UI. Entries are versioned snapshots with a parent pointer.
 */
import type { StudioPayload } from "../types.ts";

export interface HistoryEntry {
	timestamp: string;
	parent: string | null;
	payload: StudioPayload;
}

interface MetricDelta {
	label: string;
	before: number;
	after: number;
	delta: number;
}

export interface RunDiff {
	coverage: Array<MetricDelta>;
	budget: Array<MetricDelta>;
	/** Dead candidates present in `before` but gone in `after`. */
	resolvedDead: string[];
	/** Dead candidates that appeared in `after`. */
	newDead: string[];
	missingCssDelta: number;
}

const delta = (label: string, before: number, after: number): MetricDelta => ({
	label,
	before,
	after,
	delta: after - before,
});

/** Compare two runs; `a` is the older run, `b` the newer. */
export function diffRuns(a: HistoryEntry, b: HistoryEntry): RunDiff {
	const ca = a.payload.coverage;
	const cb = b.payload.coverage;

	const coverage = [
		delta("eliminated %", ca.eliminatedPct, cb.eliminatedPct),
		delta("entry-level eliminated %", ca.entryEliminatedPct, cb.entryEliminatedPct),
		delta("cx calls", ca.totalCxCalls, cb.totalCxCalls),
		delta("fully folded", ca.fullFolded, cb.fullFolded),
		delta("runtime cx", ca.runtimeCalls, cb.runtimeCalls),
		delta("tw calls folded", ca.twFolded, cb.twFolded),
	];

	const budget: Array<MetricDelta> = [];
	if (ca.budget !== undefined && cb.budget !== undefined) {
		budget.push(
			delta("css bytes", ca.budget.cssBytes, cb.budget.cssBytes),
			delta("css gzip bytes", ca.budget.cssGzipBytes, cb.budget.cssGzipBytes),
			delta("rules", ca.budget.rules, cb.budget.rules),
			delta("dead candidates", ca.budget.deadCandidates, cb.budget.deadCandidates),
		);
	}

	const deadA = new Set(ca.budget?.deadSample ?? []);
	const deadB = new Set(cb.budget?.deadSample ?? []);

	return {
		coverage,
		budget,
		resolvedDead: [...deadA].filter((d) => !deadB.has(d)),
		newDead: [...deadB].filter((d) => !deadA.has(d)),
		missingCssDelta: cb.totalMissingCss - ca.totalMissingCss,
	};
}
