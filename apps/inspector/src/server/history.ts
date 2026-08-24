/**
 * Run-history persistence: every successful studio gather is written as a
 * versioned snapshot (timestamp + payload + parent pointer, plans/020
 * shape) under apps/inspector/.studio-history/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StudioPayload } from "../types.ts";
import type { HistoryEntry } from "../lib/history-diff.ts";

const HISTORY_DIR = (root: string): string => join(root, "apps", "inspector", ".studio-history");

export function persistRun(root: string, payload: StudioPayload): string {
	const dir = HISTORY_DIR(root);
	mkdirSync(dir, { recursive: true });
	// parent = the most recent snapshot before this one
	const existing = listRuns(root);
	const timestamp = new Date().toISOString();
	const entry: HistoryEntry = {
		timestamp,
		parent: existing[0]?.timestamp ?? null,
		payload,
	};
	writeFileSync(join(dir, `${timestamp}.json`), JSON.stringify(entry));
	return timestamp;
}

/** All runs, newest first. */
export function listRuns(root: string): Array<HistoryEntry> {
	const dir = HISTORY_DIR(root);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => f.slice(0, -5))
		.toSorted()
		.toReversed()
		.map((ts) => {
			try {
				return JSON.parse(readFileSync(join(dir, `${ts}.json`), "utf8")) as HistoryEntry;
			} catch {
				return null;
			}
		})
		.filter((e): e is HistoryEntry => e !== null);
}

export function readRun(root: string, timestamp: string): HistoryEntry | null {
	const safe = timestamp.replace(/[^0-9T:.\-Z]/g, "");
	const path = join(HISTORY_DIR(root), `${safe}.json`);
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf8")) as HistoryEntry;
}
