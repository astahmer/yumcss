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
 *    change, run `pnpm run test:size -u` (or `vitest run runtime-size -u`).
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { createCssExtractionService } from "../src/vite/css-extract.ts";
import { renderCssRuntimeModule } from "../src/css/runtime-codegen.ts";
import { createRuntimePruningTransform } from "../src/vite/runtime-pruner.ts";
import { writePerformanceSummary } from "../../../scripts/render-performance-summary.mts";

const ROOT = resolve(import.meta.dirname, "..");
const SNAPSHOT = resolve(ROOT, "tests/snapshots", "runtime-size.json.snap");
const BUDGET = resolve(ROOT, "tests", "runtime-budget.json");

const bundleCode = (fixture: string): string => {
	const result = buildSync({
		entryPoints: [resolve(ROOT, "tests/fixtures", fixture)],
		bundle: true,
		minify: true,
		format: "esm",
		platform: "browser",
		write: false,
		logLevel: "silent",
	});
	return result.outputFiles[0]!.text;
};

const bundle = (fixture: string): { min: number; gz: number } => {
	const code = bundleCode(fixture);
	return { min: code.length, gz: gzipSync(code).byteLength };
};

const bundleAfterCssExtraction = (fixture: string): { min: number; gz: number } => {
	const entry = resolve(ROOT, "tests/fixtures", fixture);
	const source = readFileSync(entry, "utf8");
	const service = createCssExtractionService({ matchers: ["css"], preset: examplePreset });
	const transformed = service.inline(source, entry, new Set(["css"]));
	const result = buildSync({
		stdin: {
			contents: transformed.code,
			loader: "ts",
			resolveDir: resolve(ROOT, "tests/fixtures"),
			sourcefile: entry,
		},
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

const bundleAfterRuntimePruning = async (fixture: string): Promise<{ min: number; gz: number }> => {
	const entry = resolve(ROOT, "tests/fixtures", fixture);
	const pruner = createRuntimePruningTransform();
	const result = await import("esbuild").then(({ build }) =>
		build({
			entryPoints: [entry],
			bundle: true,
			minify: true,
			format: "esm",
			platform: "browser",
			write: false,
			logLevel: "silent",
			plugins: [
				{
					name: "pandwind-runtime-pruner-test",
					setup(build) {
						build.onLoad({ filter: /runtime-css-pruned-(?:call|class|vars)\.ts$/ }, (args) => {
							const source = readFileSync(args.path, "utf8");
							const transformed = pruner.transform(source, args.path);
							return { contents: transformed?.code ?? source, loader: "ts", resolveDir: ROOT };
						});
						build.onResolve({ filter: /^pandwind:runtime\/css/ }, (args) => ({
							path: args.path,
							namespace: "pandwind-runtime",
						}));
						build.onLoad({ filter: /.*/, namespace: "pandwind-runtime" }, (args) => ({
							contents: pruner.load(String.fromCharCode(0) + args.path) ?? "",
							loader: "ts",
							resolveDir: ROOT,
						}));
					},
				},
			],
		}),
	);
	const code = result.outputFiles[0]!.text;
	return { min: code.length, gz: gzipSync(code).byteLength };
};

const bundleGeneratedRuntime = (methods: readonly string[]): { min: number; gz: number } => {
	const result = buildSync({
		stdin: {
			contents: renderCssRuntimeModule(methods, { typed: true }),
			loader: "ts",
			resolveDir: ROOT,
			sourcefile: "pandwind-runtime.ts",
		},
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
		"css, runtime sheet": bundle("runtime-css-sheet.ts"),
		"css, all static calls": bundleAfterCssExtraction("runtime-css-static.ts"),
		"css, dynamic fallback": bundle("runtime-css-dynamic.ts"),
		"css, compiler-pruned call": await bundleAfterRuntimePruning("runtime-css-pruned-call.ts"),
		"css, compiler-pruned class": await bundleAfterRuntimePruning("runtime-css-pruned-class.ts"),
		"css, compiler-pruned vars": await bundleAfterRuntimePruning("runtime-css-pruned-vars.ts"),
		"css, generated call": bundleGeneratedRuntime([]),
		"css, generated class": bundleGeneratedRuntime(["class"]),
		"css, generated vars": bundleGeneratedRuntime(["vars"]),
		"css, generated class+vars": bundleGeneratedRuntime(["class", "vars"]),
		"css, generated all": bundleGeneratedRuntime([
			"class",
			"vars",
			"raw",
			"props",
			"group",
			"input",
		]),
		tw: bundle("runtime-tw.ts"),
		"cx, plain": bundle("runtime-cx-plain.ts"),
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
	for (const name of [
		"css, compiler-pruned call",
		"css, compiler-pruned class",
		"css, compiler-pruned vars",
	] as const) {
		expect(sizes[name].min, `${name}: compiler pruning must reduce minified output`).toBeLessThan(
			sizes.css.min,
		);
		expect(sizes[name].gz, `${name}: compiler pruning must reduce gzip output`).toBeLessThan(
			sizes.css.gz,
		);
	}
	expect(
		sizes["css, generated class+vars"].gz,
		"generated class+vars runtime must be smaller than generated all",
	).toBeLessThan(sizes["css, generated all"].gz);
	expect(
		sizes["css, generated class+vars"].min,
		"generated class+vars runtime must be smaller than generated all",
	).toBeLessThan(sizes["css, generated all"].min);

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
				`${name}: min regressed ${base.min} -> ${size.min} (allow up to ${minCap}; run pnpm run test:size -u only for an intentional change)`,
			).toBeLessThanOrEqual(minCap);
			expect(
				size.gz,
				`${name}: gz regressed ${base.gz} -> ${size.gz} (allow up to ${gzCap}; run pnpm run test:size -u only for an intentional change)`,
			).toBeLessThanOrEqual(gzCap);
		}
	}

	// 3. Exact record of truth.
	await expect(JSON.stringify(sizes, null, 2)).toMatchFileSnapshot(SNAPSHOT);
	if (updatingSnapshots()) writePerformanceSummary();

	// The build-time generator must never ride along in the runtime entry.
	// The postcss-selector-parser chain used to define the generator's
	// scale, so a derived ratio worked; it now compiles to ~7KB gz, making
	// ratios meaningless. The hard budget above is the direct ceiling proving
	// the generator stays out of bundles.

	// Root-barrel imports tree-shake down to the single engine: each one is
	// within 300 gz bytes of its direct subpath import (no barrel overhead)…
	expect(sizes["root barrel, css only"].gz).toBeLessThan(sizes.css.gz + 300);
	expect(sizes["root barrel, tw only"].gz).toBeLessThan(sizes.tw.gz + 300);
	expect(sizes["root barrel, cx only"].gz).toBeLessThan(sizes.cx.gz + 300);
	// css() and tw() have no cross-dependencies: their root imports must be
	// materially smaller than the combined bundle, proving the unused engines
	// were dropped rather than shipped. Gzip is not additive, so a half-size
	// assertion is brittle when the engines share minified helpers.
	expect(sizes["root barrel, css only"].gz).toBeLessThan(sizes["all (css+tw+cx)"].gz - 300);
	expect(sizes["root barrel, tw only"].gz).toBeLessThan(sizes["all (css+tw+cx)"].gz - 300);
	// cx() depends on the css engine (atom registry), so its root import is
	// near the css size — but it must still stay well under the combined
	// bundle: tw()/preset have been shaken out.
	expect(sizes["root barrel, cx only"].gz).toBeLessThan(sizes["all (css+tw+cx)"].gz - 400);

	// The compiler path is the important runtime-size contract: a module made
	// entirely from static css() calls carries only its resulting literals,
	// while a dynamic value deliberately keeps the fallback engine.
	expect(sizes["css, all static calls"].gz).toBeLessThan(200);
	expect(sizes["css, all static calls"].gz).toBeLessThan(sizes["css, dynamic fallback"].gz);
});
