/**
 * Runtime size budget — the browser bundle must stay stylex-sized (a few KB
 * min+gz), not panda-sized (tens of KB).
 *
 * Each public entry is bundled standalone with esbuild (minified, browser
 * target) and measured raw + gzipped. The stylesheet generator is measured
 * as a baseline: it's build-time only and must never ride along in the
 * runtime entry — importing it from the css barrel used to drag
 * postcss-selector-parser (~20KB gz) into every app bundle.
 *
 * Three layers of protection, so a size change is either intentional or
 * caught:
 *
 * 1. **Hard budgets** (`tests/runtime-budget.json`) — the "not too much"
 *    contract. Any entry above its committed budget fails, even with `-u`.
 *    Bump a budget only when the growth is deliberate and reviewed.
 * 2. **Regression guard** — current sizes are compared to the committed
 *    baseline snapshot with a small tolerance (1%, floored at 16 min / 8 gz
 *    bytes), so zlib/gzip noise of a couple of bytes never fails the gate
 *    but real growth between revisions does.
 * 3. **Exact snapshot** — the record of truth. After an *intentional*
 *    change, run `pnpm test:size -u` (or `vitest run runtime-size -u`).
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const SNAPSHOT = resolve(ROOT, "tests/snapshots", "runtime-size.json.snap");
const BUDGET = resolve(ROOT, "tests", "runtime-budget.json");

const bundle = (fixture: string): { min: number; gz: number } => {
	const result = buildSync({
		entryPoints: [resolve(ROOT, "tests/fixtures", fixture)],
		bundle: true,
		minify: true,
		format: "esm",
		platform: "browser",
		write: false,
		logLevel: "silent",
	});
	const code = result.outputFiles[0]!.text;
	return { min: code.length, gz: gzipSync(code).byteLength };
};

/**
 * True when running `vitest run -u` / `--update`.
 *
 * `process.argv` in a worker only contains node + the worker script, so the
 * CLI flag must be read from the snapshot state instead: vitest resolves
 * `-u` once on the server and propagates it to the worker as
 * `_updateSnapshot === "all"` (default local runs are "new", CI is "none").
 */
const updatingSnapshots = (): boolean => {
	const snapshotState = (
		expect.getState() as unknown as {
			snapshotState?: { _updateSnapshot?: string };
		}
	).snapshotState;
	return snapshotState?._updateSnapshot === "all";
};

test("runtime entries stay stylex-sized", async () => {
	const sizes = {
		css: bundle("runtime-css.ts"),
		tw: bundle("runtime-tw.ts"),
		cx: bundle("runtime-cx.ts"),
		"all (css+tw+cx)": bundle("runtime-all.ts"),
		"stylesheet generator (build-time only)": bundle("size-stylesheet.ts"),
		// Same single-API imports but from the ROOT barrel (`pandwind`) — if
		// the other engines were not tree-shaken away, these would be as big
		// as the "all" bundle.
		"root barrel, css only": bundle("tree-shake-css.ts"),
		"root barrel, tw only": bundle("tree-shake-tw.ts"),
		"root barrel, cx only": bundle("tree-shake-cx.ts"),
	};

	// 1. Hard budgets — the committed "not too much" contract.
	const budgets = JSON.parse(readFileSync(BUDGET, "utf8")) as Record<
		string,
		{ min: number; gz: number }
	>;
	for (const [name, size] of Object.entries(sizes)) {
		const budget = budgets[name];
		expect(budget, `missing budget for "${name}" in tests/runtime-budget.json`).toBeDefined();
		expect(size.min, `${name}: min ${size.min} exceeds budget ${budget!.min}`).toBeLessThanOrEqual(
			budget!.min,
		);
		expect(size.gz, `${name}: gz ${size.gz} exceeds budget ${budget!.gz}`).toBeLessThanOrEqual(
			budget!.gz,
		);
	}

	// 2. Regression guard vs the committed baseline (noise-tolerant).
	if (!updatingSnapshots()) {
		const baseline = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<
			string,
			{ min: number; gz: number }
		>;
		for (const [name, size] of Object.entries(sizes)) {
			const base = baseline[name];
			if (base === undefined) continue;
			const minCap = base.min + Math.max(16, Math.round(base.min * 0.01));
			const gzCap = base.gz + Math.max(8, Math.round(base.gz * 0.01));
			expect(
				size.min,
				`${name}: min regressed ${base.min} -> ${size.min} (allow up to ${minCap}; run pnpm test:size -u only for an intentional change)`,
			).toBeLessThanOrEqual(minCap);
			expect(
				size.gz,
				`${name}: gz regressed ${base.gz} -> ${size.gz} (allow up to ${gzCap}; run pnpm test:size -u only for an intentional change)`,
			).toBeLessThanOrEqual(gzCap);
		}
	}

	// 3. Exact record of truth.
	await expect(JSON.stringify(sizes, null, 2)).toMatchFileSnapshot(SNAPSHOT);

	// The build-time generator must never ride along in the runtime entry.
	expect(sizes["all (css+tw+cx)"].gz).toBeLessThan(
		sizes["stylesheet generator (build-time only)"].gz / 3,
	);

	// Root-barrel imports tree-shake down to the single engine: each one is
	// within 300 gz bytes of its direct subpath import (no barrel overhead)…
	expect(sizes["root barrel, css only"].gz).toBeLessThan(sizes.css.gz + 300);
	expect(sizes["root barrel, tw only"].gz).toBeLessThan(sizes.tw.gz + 300);
	expect(sizes["root barrel, cx only"].gz).toBeLessThan(sizes.cx.gz + 300);
	// css() and tw() have no cross-dependencies: their root imports must be
	// clearly smaller than the combined bundle, proving the unused engines
	// were dropped rather than shipped.
	expect(sizes["root barrel, css only"].gz).toBeLessThan(sizes["all (css+tw+cx)"].gz / 2);
	expect(sizes["root barrel, tw only"].gz).toBeLessThan(sizes["all (css+tw+cx)"].gz / 2);
	// cx() depends on the css engine (atom registry), so its root import is
	// near the css size — but it must still stay well under the combined
	// bundle: tw()/preset have been shaken out.
	expect(sizes["root barrel, cx only"].gz).toBeLessThan(sizes["all (css+tw+cx)"].gz - 400);
});
