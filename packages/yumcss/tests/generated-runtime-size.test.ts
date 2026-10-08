import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "vitest";
import { updatingSnapshots } from "./snapshot-state.ts";
import { createInlineTwPluginCore } from "../src/vite/index.ts";
import { writePerformanceSummary } from "../../../scripts/render-performance-summary.mts";

const ROOT = resolve(import.meta.dirname, "..");
const GENERATED_DIRECTORY = resolve(ROOT, "../../apps/playground/src");
const EXAMPLE_DIRECTORY = resolve(ROOT, "../../examples/example/src");
const SNAPSHOT = resolve(ROOT, "tests/snapshots", "generated-runtime-size.json.snap");
const MIN_SNAPSHOT = resolve(ROOT, "tests/snapshots", "generated-runtime-size-min.json.snap");

interface BundleMeasurement {
	min: number;
	gz: number;
	inputs: string[];
}

const bundleEntry = (entry: string): BundleMeasurement => {
	const result = buildSync({
		entryPoints: [entry],
		bundle: true,
		minify: true,
		format: "esm",
		platform: "browser",
		write: false,
		metafile: true,
		logLevel: "silent",
	});
	const code = result.outputFiles[0]!.text;
	return {
		min: code.length,
		gz: gzipSync(code).byteLength,
		inputs: Object.keys(result.metafile?.inputs ?? {}),
	};
};

const bundleSource = (source: string, resolveDir: string): BundleMeasurement => {
	const result = buildSync({
		stdin: {
			contents: source,
			loader: "ts",
			resolveDir,
			sourcefile: "generated-runtime-size.ts",
		},
		bundle: true,
		minify: true,
		format: "esm",
		platform: "browser",
		write: false,
		metafile: true,
		logLevel: "silent",
	});
	const code = result.outputFiles[0]!.text;
	return {
		min: code.length,
		gz: gzipSync(code).byteLength,
		inputs: Object.keys(result.metafile?.inputs ?? {}),
	};
};

const hasInput = (measurement: BundleMeasurement, file: string): boolean =>
	measurement.inputs.some((input) => input.endsWith(file));

const bundleAfterGeneratedExtraction = async (): Promise<BundleMeasurement> => {
	const generatedTwEntry = resolve(GENERATED_DIRECTORY, "tw.ts");
	const generatedCxEntry = resolve(GENERATED_DIRECTORY, "cx.ts");
	const source = [
		`import { tw } from ${JSON.stringify(generatedTwEntry)};`,
		`import { cx } from ${JSON.stringify(generatedCxEntry)};`,
		'export const value = cx(tw({ bg: "red-500", p: "6" }), "text-sm");',
	].join("\n");
	const core = createInlineTwPluginCore();
	const transformed = await core.transform(
		source,
		resolve(ROOT, "tests/fixtures/generated-tw-static.ts"),
		{
			resolve: async (specifier) =>
				specifier === generatedTwEntry ? { id: generatedTwEntry } : null,
		},
	);
	if (transformed === null) throw new Error("generated tw source was not transformed");
	return bundleSource(transformed.code, ROOT);
};

const bundleGeneratedConflictOnly = (): BundleMeasurement =>
	bundleSource(
		[
			'import { createCx } from "yumcss/cx";',
			`import { __yumcssConflictConfig } from ${JSON.stringify(resolve(GENERATED_DIRECTORY, "tw.conflicts.ts"))};`,
			"export const cx = createCx(__yumcssConflictConfig);",
			'export const value = cx("bg-red-500", "bg-blue-500");',
		].join("\n"),
		GENERATED_DIRECTORY,
	);

test("generated metadata stays out of static runtime bundles", async () => {
	const generatedEntrySource = readFileSync(resolve(GENERATED_DIRECTORY, "tw.ts"), "utf8");
	const generatedTw = bundleEntry(resolve(GENERATED_DIRECTORY, "tw.ts"));
	const generatedRuntime = bundleEntry(resolve(GENERATED_DIRECTORY, "tw.runtime.ts"));
	const generatedConflicts = bundleEntry(resolve(GENERATED_DIRECTORY, "tw.conflicts.ts"));
	const generatedConflictOnly = bundleGeneratedConflictOnly();
	const generatedCx = bundleEntry(resolve(GENERATED_DIRECTORY, "cx.ts"));
	const plainCx = bundleEntry(resolve(EXAMPLE_DIRECTORY, "cx.ts"));
	const generatedStatic = await bundleAfterGeneratedExtraction();

	expect(Buffer.byteLength(generatedEntrySource)).toBeLessThan(4_000);
	expect(generatedTw.gz).toBeLessThan(3_000);
	expect(generatedEntrySource).not.toContain("conflicts:");
	expect(generatedEntrySource).not.toContain("wildcardValues");
	expect(generatedEntrySource).not.toContain("__yumcssBuildMetadata");
	expect(hasInput(generatedTw, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedTw, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedRuntime, "tw.conflicts.ts")).toBe(true);
	expect(hasInput(generatedRuntime, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedConflicts, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedConflicts, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedConflictOnly, "tw.conflicts.ts")).toBe(true);
	expect(hasInput(generatedConflictOnly, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedConflictOnly, "tw.build.ts")).toBe(false);
	expect(hasInput(plainCx, "tw.runtime.ts")).toBe(false);
	expect(hasInput(plainCx, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedCx, "tw.conflicts.ts")).toBe(true);
	expect(hasInput(generatedCx, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedCx, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedStatic, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedStatic, "tw.build.ts")).toBe(false);
	expect(generatedStatic.gz).toBeLessThan(200);
	const gzipBudgets = [
		["generated tw (dynamic)", generatedTw, 2_161],
		["generated tw runtime metadata (opt-in)", generatedRuntime, 19_562],
		["generated conflict metadata (opt-in)", generatedConflicts, 7_362],
		["generated conflict cx (dynamic, no css)", generatedConflictOnly, 10_503],
		["explicit conflict cx (dynamic)", generatedCx, 20_372],
		["example dss+cx (no tw metadata)", plainCx, 13_078],
		["generated tw+cx (static)", generatedStatic, 71],
	] as const;
	for (const [name, measurement, baseline] of gzipBudgets) {
		const gzipBudget = baseline + Math.max(8, Math.ceil(baseline * 0.02));
		expect(
			measurement.gz,
			`${name}: gz ${measurement.gz} exceeds ${gzipBudget} (baseline ${baseline} plus 2% host-compressor tolerance)`,
		).toBeLessThanOrEqual(gzipBudget);
	}

	const sizes = {
		"generated tw (dynamic)": { min: generatedTw.min, gz: generatedTw.gz },
		"generated tw runtime metadata (opt-in)": {
			min: generatedRuntime.min,
			gz: generatedRuntime.gz,
		},
		"generated conflict metadata (opt-in)": {
			min: generatedConflicts.min,
			gz: generatedConflicts.gz,
		},
		"generated conflict cx (dynamic, no css)": {
			min: generatedConflictOnly.min,
			gz: generatedConflictOnly.gz,
		},
		"explicit conflict cx (dynamic)": { min: generatedCx.min, gz: generatedCx.gz },
		"example dss+cx (no tw metadata)": { min: plainCx.min, gz: plainCx.gz },
		"generated tw+cx (static)": { min: generatedStatic.min, gz: generatedStatic.gz },
	};
	const minifiedSizes = Object.fromEntries(
		Object.entries(sizes).map(([name, size]) => [name, { min: size.min }]),
	);
	await expect(JSON.stringify(minifiedSizes, null, 2)).toMatchFileSnapshot(MIN_SNAPSHOT);
	if (updatingSnapshots()) {
		await expect(JSON.stringify(sizes, null, 2)).toMatchFileSnapshot(SNAPSHOT);
		writePerformanceSummary();
	}
});
