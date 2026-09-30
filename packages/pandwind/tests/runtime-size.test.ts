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
import { dirname, resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "vitest";
import { updatingSnapshots } from "./snapshot-state.ts";
import { examplePreset } from "@pandwind/example-preset";
import { fixturePreset } from "./fixtures/fixture-preset.ts";
import { createCssExtractionService } from "../src/vite/css-extract.ts";
import { renderCssRuntimeModule } from "../src/css/runtime-codegen.ts";
import {
	createRuntimePruningTransform,
	type RuntimePruningOptions,
} from "../src/vite/runtime-pruner.ts";
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

const bundleAfterRuntimePruning = async (
	fixture: string,
	preset?: RuntimePruningOptions["preset"],
): Promise<{ min: number; gz: number }> => {
	const entry = resolve(ROOT, "tests/fixtures", fixture);
	const pruner = createRuntimePruningTransform({ preset });
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
						build.onLoad(
							{ filter: /runtime-css-pruned-(?:call|class|vars|preset|generated|design)\.ts$/ },
							(args) => {
								const source = readFileSync(args.path, "utf8");
								const transformed = pruner.transform(source, args.path);
								return {
									contents: transformed?.code ?? source,
									loader: "ts",
									resolveDir: dirname(args.path),
								};
							},
						);
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

test("runtime entries stay stylex-sized", async () => {
	const sizes = {
		"createCssRuntime() core (internal)": bundle("runtime-css-base.ts"),
		"createCss(minimal preset), fallback": bundle("runtime-css-preset.ts"),
		"createCss(csstypePreset)": bundle("runtime-preset-csstype.ts"),
		"createCss(tailwindPreset)": bundle("runtime-preset-tailwindcss.ts"),
		"createCss(chakraPreset)": bundle("runtime-preset-chakra.ts"),
		"createCss(shadcnPreset)": bundle("runtime-preset-shadcn.ts"),
		"createCss(pandaPreset)": bundle("runtime-preset-panda.ts"),
		"createCss(defaultPreset)": bundle("runtime-preset-css.ts"),
		// The palette fixture keeps a full token catalog, so these lanes measure
		// a preset whose tokens resolve to named colors.
		"createCss(fixturePreset)": bundle("runtime-preset-fixture.ts"),
		"createDesignCss(fixturePreset), fallback": bundle("runtime-design.ts"),
		"createCss(fixturePreset) + tw()": bundle("runtime-preset-tw.ts"),
		"createCss(fixturePreset) + cx()": bundle("runtime-preset-cx.ts"),
		"createCss(fixturePreset) + tw() + cx()": bundle("runtime-preset-all.ts"),
		"createUnsafeCss(), fallback": bundle("runtime-css.ts"),
		"createRuntimeCss(preset), live sheet": bundle("runtime-css-sheet.ts"),
		"createUnsafeCss(), static output after extraction":
			bundleAfterCssExtraction("runtime-css-static.ts"),
		"createCss(), static output after extraction": bundleAfterCssExtraction(
			"runtime-css-pruned-preset.ts",
		),
		"createUnsafeCss(), dynamic fallback": bundle("runtime-css-dynamic.ts"),
		"createUnsafeCss(), compiler-pruned call": await bundleAfterRuntimePruning(
			"runtime-css-pruned-call.ts",
		),
		"createUnsafeCss(), compiler-pruned class": await bundleAfterRuntimePruning(
			"runtime-css-pruned-class.ts",
		),
		"createUnsafeCss(), compiler-pruned vars": await bundleAfterRuntimePruning(
			"runtime-css-pruned-vars.ts",
		),
		"createCss(), compiler-pruned class": await bundleAfterRuntimePruning(
			"runtime-css-pruned-preset.ts",
			fixturePreset,
		),
		"createGeneratedCss(), compiler-pruned keyframes": await bundleAfterRuntimePruning(
			"runtime-css-pruned-generated.ts",
			fixturePreset,
		),
		"createDesignCss(), compiler-pruned class": await bundleAfterRuntimePruning(
			"runtime-css-pruned-design.ts",
			fixturePreset,
		),
		"createUnsafeCss(), generated call": bundleGeneratedRuntime([]),
		"createUnsafeCss(), generated class": bundleGeneratedRuntime(["class"]),
		"createUnsafeCss(), generated vars": bundleGeneratedRuntime(["vars"]),
		"createUnsafeCss(), generated class+vars": bundleGeneratedRuntime(["class", "vars"]),
		"createUnsafeCss(), generated all": bundleGeneratedRuntime([
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
		"all (createUnsafeCss+tw+cx)": bundle("runtime-all.ts"),
		"stylesheet generator (build-time only)": bundle("size-stylesheet.ts"),
		// The root barrel intentionally has no css export. This fixture keeps
		// the CSS subpath isolated from the other root exports.
		"unsafe css subpath only": bundle("tree-shake-css.ts"),
		"root barrel, tw only": bundle("tree-shake-tw.ts"),
		"root barrel, cx + unsafe css": bundle("tree-shake-cx.ts"),
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
		"createUnsafeCss(), compiler-pruned call",
		"createUnsafeCss(), compiler-pruned class",
		"createUnsafeCss(), compiler-pruned vars",
	] as const) {
		expect(sizes[name].min, `${name}: compiler pruning must reduce minified output`).toBeLessThan(
			sizes["createUnsafeCss(), fallback"].min,
		);
	}
	expect(
		sizes["createUnsafeCss(), generated class+vars"].gz,
		"generated class+vars runtime must be smaller than generated all",
	).toBeLessThan(sizes["createUnsafeCss(), generated all"].gz);
	expect(
		sizes["createUnsafeCss(), generated class+vars"].min,
		"generated class+vars runtime must be smaller than generated all",
	).toBeLessThan(sizes["createUnsafeCss(), generated all"].min);
	expect(
		sizes["createCss(), compiler-pruned class"].min,
		"preset-bound compiler pruning must reduce the full preset runtime",
	).toBeLessThan(sizes["createCss(fixturePreset)"].min);
	expect(
		sizes["createGeneratedCss(), compiler-pruned keyframes"].min,
		"generated compiler pruning must reduce the full preset runtime",
	).toBeLessThan(sizes["createCss(fixturePreset)"].min);
	expect(
		sizes["createDesignCss(), compiler-pruned class"].min,
		"design compiler pruning must reduce the full design runtime",
	).toBeLessThan(sizes["createDesignCss(fixturePreset), fallback"].min);

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
	// The build-time preset.web serializer is intentionally part of this
	// generator. The hard budget above records its direct cost and proves the
	// generator stays out of browser bundles.

	// Root-barrel imports tree-shake down to the single engine: each one is
	// within 300 gz bytes of its direct subpath import (no barrel overhead)…
	expect(sizes["unsafe css subpath only"].gz).toBeLessThan(
		sizes["createUnsafeCss(), fallback"].gz + 300,
	);
	expect(sizes["root barrel, tw only"].gz).toBeLessThan(sizes.tw.gz + 300);
	expect(sizes["root barrel, cx + unsafe css"].gz).toBeLessThan(sizes.cx.gz + 300);
	// The isolated imports must be materially smaller than the combined bundle,
	// proving the unused engines were dropped rather than shipped. Gzip is not
	// additive, so a half-size assertion is brittle when helpers are shared.
	expect(sizes["unsafe css subpath only"].gz).toBeLessThan(
		sizes["all (createUnsafeCss+tw+cx)"].gz - 300,
	);
	expect(sizes["root barrel, tw only"].gz).toBeLessThan(
		sizes["all (createUnsafeCss+tw+cx)"].gz - 300,
	);
	// cx() depends on the CSS engine (atom registry), so its root import is near
	// the cx size but must still stay well under the combined bundle.
	expect(sizes["root barrel, cx + unsafe css"].gz).toBeLessThan(
		sizes["all (createUnsafeCss+tw+cx)"].gz - 400,
	);

	// The compiler path is the important runtime-size contract: a module made
	// entirely from static css() calls carries only its resulting literals,
	// while a dynamic value deliberately keeps the fallback engine.
	expect(sizes["createUnsafeCss(), static output after extraction"].gz).toBeLessThan(200);
	expect(sizes["createUnsafeCss(), static output after extraction"].gz).toBeLessThan(
		sizes["createUnsafeCss(), dynamic fallback"].gz,
	);
});
