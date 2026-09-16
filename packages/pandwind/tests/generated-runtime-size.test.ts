import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "vitest";
import { createInlineTwPluginCore } from "../src/vite/index.ts";
import { writePerformanceSummary } from "../../../scripts/render-performance-summary.mts";

const ROOT = resolve(import.meta.dirname, "..");
const GENERATED_DIRECTORY = resolve(ROOT, "../../apps/playground/src");
const EXAMPLE_DIRECTORY = resolve(ROOT, "../../examples/example/src");
const SNAPSHOT = resolve(ROOT, "tests/snapshots", "generated-runtime-size.json.snap");

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

const hasInput = (measurement: BundleMeasurement, file: string): boolean =>
	measurement.inputs.some((input) => input.endsWith(file));

const updatingSnapshots = (): boolean => {
	const snapshotState = expect.getState() as unknown as {
		snapshotState?: { _updateSnapshot?: string };
	};
	return snapshotState.snapshotState?._updateSnapshot === "all";
};

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
	const result = buildSync({
		stdin: {
			contents: transformed.code,
			loader: "ts",
			resolveDir: ROOT,
			sourcefile: "generated-tw-static.ts",
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

test("generated metadata stays out of static runtime bundles", async () => {
	const generatedEntrySource = readFileSync(resolve(GENERATED_DIRECTORY, "tw.ts"), "utf8");
	const generatedTw = bundleEntry(resolve(GENERATED_DIRECTORY, "tw.ts"));
	const generatedCx = bundleEntry(resolve(GENERATED_DIRECTORY, "cx.ts"));
	const plainCx = bundleEntry(resolve(EXAMPLE_DIRECTORY, "cx.ts"));
	const generatedStatic = await bundleAfterGeneratedExtraction();

	expect(Buffer.byteLength(generatedEntrySource)).toBeLessThan(4_000);
	expect(generatedTw.gz).toBeLessThan(3_000);
	expect(generatedEntrySource).not.toContain("conflicts:");
	expect(generatedEntrySource).not.toContain("wildcardValues");
	expect(generatedEntrySource).not.toContain("__pandwindBuildMetadata");
	expect(hasInput(generatedTw, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedTw, "tw.build.ts")).toBe(false);
	expect(hasInput(plainCx, "tw.runtime.ts")).toBe(false);
	expect(hasInput(plainCx, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedCx, "tw.conflicts.ts")).toBe(true);
	expect(hasInput(generatedCx, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedCx, "tw.build.ts")).toBe(false);
	expect(hasInput(generatedStatic, "tw.runtime.ts")).toBe(false);
	expect(hasInput(generatedStatic, "tw.build.ts")).toBe(false);
	expect(generatedStatic.gz).toBeLessThan(200);

	await expect(
		JSON.stringify(
			{
				"generated tw (dynamic)": {
					min: generatedTw.min,
					gz: generatedTw.gz,
				},
				"explicit conflict cx (dynamic)": {
					min: generatedCx.min,
					gz: generatedCx.gz,
				},
				"example dss+cx (no tw metadata)": {
					min: plainCx.min,
					gz: plainCx.gz,
				},
				"generated tw+cx (static)": {
					min: generatedStatic.min,
					gz: generatedStatic.gz,
				},
			},
			null,
			2,
		),
	).toMatchFileSnapshot(SNAPSHOT);
	if (updatingSnapshots()) writePerformanceSummary();
});
