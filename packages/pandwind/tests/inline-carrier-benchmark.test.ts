import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { createCssExtractionService } from "../src/vite/css-extract.ts";
import {
	createRuntimePruningTransform,
	type RuntimePruningTransform,
} from "../src/vite/runtime-pruner.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_ID = resolve(ROOT, "tests/fixtures/inline-carrier-benchmark.tsx");

interface CarrierCase {
	readonly name: string;
	readonly sourceExpression: string;
	readonly currentCarrier: string;
	readonly directCarrier: string;
}

interface BundleSize {
	readonly min: number;
	readonly gz: number;
}

interface SourceSize {
	readonly raw: number;
	readonly gz: number;
}

interface CarrierMeasurement {
	readonly source: SourceSize;
	readonly bundle: BundleSize;
}

const cases: readonly CarrierCase[] = [
	{
		name: "one dynamic property",
		sourceExpression: 'css({ color: "red", backgroundColor: shade })',
		currentCarrier: 'css.props(css.vars({ backgroundColor: shade }), "1nmpgqu")',
		directCarrier:
			'{ className: "pw-background-color 1nmpgqu", style: { "--pw-c-background-color": shade } }',
	},
	{
		name: "two dynamic properties",
		sourceExpression: 'css({ color: "red", backgroundColor: shade, margin: gap })',
		currentCarrier: 'css.props(css.vars({ backgroundColor: shade, margin: gap }), "1nmpgqu")',
		directCarrier:
			'{ className: "pw-background-color pw-margin 1nmpgqu", style: { "--pw-c-background-color": shade, "--pw-c-margin": gap } }',
	},
	{
		name: "dynamic condition",
		sourceExpression: 'css({ color: "red", _hover: { backgroundColor: shade } })',
		currentCarrier: 'css.props(css.vars({ color: "red", _hover: { backgroundColor: shade } }))',
		directCarrier:
			'{ className: "pw:hover:background-color pw-color", style: { "--pw-c-background-color_hover": shade, "--pw-c-color": "red" } }',
	},
];

const sourceFor = (sourceExpression: string): string =>
	[
		'import { createUnsafeCss } from "pandwind/unsafe/css";',
		"const css = createUnsafeCss();",
		'const shade = globalThis.__pandwindShade ?? "blue";',
		'const gap = globalThis.__pandwindGap ?? "12px";',
		`export const card = () => <div {...${sourceExpression}} />;`,
	].join("\n");

const bundleSize = async (
	code: string,
	runtimePruner?: RuntimePruningTransform,
): Promise<BundleSize> => {
	const result = await build({
		stdin: {
			contents: code,
			loader: "tsx",
			resolveDir: ROOT,
			sourcefile: SOURCE_ID,
		},
		bundle: true,
		minify: true,
		format: "esm",
		platform: "browser",
		write: false,
		logLevel: "silent",
		plugins:
			runtimePruner === undefined
				? []
				: [
						{
							name: "pandwind-inline-carrier-runtime",
							setup(build) {
								build.onResolve({ filter: /^pandwind:runtime\/css/ }, (args) => ({
									path: args.path,
									namespace: "pandwind-runtime",
								}));
								build.onLoad({ filter: /.*/, namespace: "pandwind-runtime" }, (args) => ({
									contents: runtimePruner.load(`\0${args.path}`) ?? "",
									loader: "ts",
									resolveDir: ROOT,
								}));
							},
						},
					],
	});
	const minified = result.outputFiles[0]!.text;
	return { min: minified.length, gz: gzipSync(minified).byteLength };
};

const transformCurrent = (source: string): string => {
	const extraction = createCssExtractionService({ matchers: ["css"], preset: examplePreset });
	const extracted = extraction.inline(source, SOURCE_ID, new Set(["css"]));
	const runtimePruner = createRuntimePruningTransform();
	return runtimePruner.transform(extracted.code, SOURCE_ID)?.code ?? extracted.code;
};

const transformDirect = (source: string, current: CarrierCase): string => {
	const direct = source.replace(
		'import { createUnsafeCss } from "pandwind/unsafe/css";\nconst css = createUnsafeCss();\n',
		"",
	);
	return direct.replace(current.sourceExpression, current.directCarrier);
};

// This is an upper-bound prototype: it assumes safe string values and known
// carrier keys, but deliberately does not inline preset token resolution or
// numeric CSS normalization yet.
let benchmarkSink: unknown;

const measure = (callback: () => unknown, iterations = 40_000): number => {
	for (let index = 0; index < 5_000; index++) benchmarkSink = callback();
	const samples: number[] = [];
	for (let sample = 0; sample < 7; sample++) {
		const start = process.hrtime.bigint();
		for (let index = 0; index < iterations; index++) benchmarkSink = callback();
		const elapsed = process.hrtime.bigint() - start;
		samples.push(Number(elapsed) / iterations);
	}
	samples.sort((left, right) => left - right);
	return samples[Math.floor(samples.length / 2)]!;
};

describe("direct inline carrier benchmark", () => {
	test("compares post-pruner bundles with a semantics-limited inline prototype", async () => {
		const measurements: Record<
			string,
			{ current: CarrierMeasurement; direct: CarrierMeasurement }
		> = {};
		for (const currentCase of cases) {
			const source = sourceFor(currentCase.sourceExpression);
			const current = transformCurrent(source);
			expect(current).toContain(currentCase.currentCarrier);
			const direct = transformDirect(source, currentCase);
			const runtimePruner = createRuntimePruningTransform();
			measurements[currentCase.name] = {
				current: {
					source: { raw: current.length, gz: gzipSync(current).byteLength },
					bundle: await bundleSize(current, runtimePruner),
				},
				direct: {
					source: { raw: direct.length, gz: gzipSync(direct).byteLength },
					bundle: await bundleSize(direct),
				},
			};
			expect(measurements[currentCase.name]!.direct.bundle.gz).toBeLessThan(
				measurements[currentCase.name]!.current.bundle.gz,
			);
		}

		const css = createUnsafeCss();
		const dynamicValue = "oklch(70% 0.15 250)";
		const currentOne = measure(() =>
			css.props(css.vars({ backgroundColor: dynamicValue }), "[color:red]"),
		);
		const directOne = measure(() => ({
			className: "pw-background-color [color:red]",
			style: { "--pw-c-background-color": dynamicValue },
		}));
		const currentTwo = measure(() =>
			css.props(css.vars({ backgroundColor: dynamicValue, margin: "12px" }), "[color:red]"),
		);
		const directTwo = measure(() => ({
			className: "pw-background-color pw-margin [color:red]",
			style: {
				"--pw-c-background-color": dynamicValue,
				"--pw-c-margin": "12px",
			},
		}));
		expect(benchmarkSink).toBeDefined();

		if (process.env.PANDWIND_BENCHMARK_VERBOSE === "1")
			console.log(
				JSON.stringify(
					{
						bundles: measurements,
						throughputNsPerCall: {
							oneDynamic: { current: currentOne, direct: directOne },
							twoDynamic: { current: currentTwo, direct: directTwo },
						},
					},
					null,
					2,
				),
			);
	});
});
