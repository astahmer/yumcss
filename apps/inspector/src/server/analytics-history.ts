/**
 * Analytics time-series persistence (plans/023 follow-up): when enabled via
 * INSPECTOR_HISTORY=1, every studio refresh appends one compact point to
 * .analytics-history/<timestamp>.json (gitignored). The series powers the
 * trending chart — deliberately separate from .studio-history, which keeps
 * full payloads for diffing.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnalyticsHistoryPoint, StudioPayload } from "../types.ts";

const DIR = (root: string): string => join(root, ".analytics-history");

/** Extract the compact point from a full payload. */
export function toHistoryPoint(payload: StudioPayload): AnalyticsHistoryPoint {
	return {
		timestamp: new Date().toISOString(),
		eliminatedPct: payload.coverage.eliminatedPct,
		totalCalls: payload.coverage.totalCxCalls + payload.coverage.totalTwCalls,
		sitesScanned: payload.analytics?.sitesScanned ?? null,
		unusedTokens: payload.analytics?.unusedTokens.length ?? null,
	};
}

export function persistAnalyticsPoint(root: string, point: AnalyticsHistoryPoint): void {
	const dir = DIR(root);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${point.timestamp}.json`), JSON.stringify(point));
}

/** The series oldest-first (chart order). Corrupt entries are skipped. */
export function readAnalyticsSeries(root: string): Array<AnalyticsHistoryPoint> {
	const dir = DIR(root);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.toSorted()
		.map((f) => {
			try {
				return JSON.parse(readFileSync(join(dir, f), "utf8")) as AnalyticsHistoryPoint;
			} catch {
				return null;
			}
		})
		.filter((p): p is AnalyticsHistoryPoint => p !== null);
}

export function persistAnalyticsSnapshot(root: string, payload: StudioPayload): void {
	persistAnalyticsPoint(root, toHistoryPoint(payload));
}
