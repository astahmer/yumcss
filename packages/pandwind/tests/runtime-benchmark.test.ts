/**
 * Runtime throughput evidence. Unlike runtime-size.test.ts, these numbers are
 * machine-dependent, so the snapshot is an explicit record rather than an
 * exact regression gate. Normal runs enforce a broad slowdown floor; pass
 * `-u` intentionally to refresh the measured record.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { updatingSnapshots } from "./snapshot-state.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createCx } from "../src/cx/index.ts";
import { createRuntimeCss, createRuntimeSheet } from "../src/css/runtime.ts";
import { compileStyles } from "../src/tw/compile.ts";
import { examplePreset } from "@pandwind/example-preset";

const SNAPSHOT = resolve(import.meta.dirname, "snapshots", "runtime-benchmark.json.snap");
const css = createUnsafeCss();
const nestedCss = createUnsafeCss({
	conditions: { _hover: "&:hover", md: "@media (min-width: 768px)" },
});
const cx = createCx();
const cssCx = createCx({ css });
const runtimeSheet = createRuntimeSheet({ autoMount: false });
const runtimeCss = createRuntimeCss(examplePreset, { sheet: runtimeSheet });

type BenchmarkName =
	| "css.flat"
	| "css.nested"
	| "css.merge"
	| "css.compose"
	| "css.props"
	| "runtime.css"
	| "runtime.sheet"
	| "tw"
	| "cx.maps"
	| "cx.plain"
	| "cx.nested";
interface BenchmarkRecord {
	iterations: number;
	median: number;
	p10: number;
	p90: number;
}

const measure = (fn: () => void, iterations: number): BenchmarkRecord => {
	for (let index = 0; index < 1_000; index += 1) fn();
	const samples: number[] = [];
	for (let sample = 0; sample < 5; sample += 1) {
		const start = performance.now();
		for (let index = 0; index < iterations; index += 1) fn();
		samples.push((iterations / (performance.now() - start)) * 1_000);
	}
	samples.sort((left, right) => left - right);
	return {
		iterations,
		median: Math.round(samples[2]!),
		p10: Math.round(samples[0]!),
		p90: Math.round(samples[4]!),
	};
};

test("runtime throughput stays within the recorded evidence band", async () => {
	const styles = {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		padding: "12px",
		borderRadius: "6px",
		backgroundColor: "#3182ce",
		color: "#ffffff",
		fontWeight: 600,
	};
	const twStyles = {
		display: "flex",
		alignItems: "center",
		gap: "2",
		padding: "3",
		rounded: "md",
		bg: "blue-600",
		text: "white",
	};
	const nestedStyles = {
		_hover: { color: "red", padding: 4 },
		md: { color: "blue", margin: 8 },
	};
	const mergeStyles = {
		color: "red",
		padding: 4,
		_hover: { backgroundColor: "black" },
	};
	const mergeOverrides = {
		color: "blue",
		gap: 8,
		_hover: { color: "white" },
	};
	const mergeState = {
		backgroundColor: "white",
		_hover: { padding: 12 },
	};
	const runtimeStyles = {
		color: "$blue-500",
		padding: 12,
		_hover: { color: "$red-500", margin: 8 },
	};
	const runtimeRule = { id: "benchmark-rule", css: ".benchmark-rule{color:red}", priority: 0 };
	const nestedCxInputs = ["flex", "items-center"] as const;
	const mergeMap = css(mergeStyles);
	const overrideMap = css(mergeOverrides);
	const stateMap = css(mergeState);
	const results: Record<BenchmarkName, BenchmarkRecord> = {
		"css.flat": measure(() => css.class(styles), 40_000),
		"css.nested": measure(() => nestedCss.class(nestedStyles), 40_000),
		"css.merge": measure(() => css.class(mergeStyles, mergeOverrides), 40_000),
		"css.compose": measure(() => css(mergeStyles, mergeOverrides, mergeState), 40_000),
		"css.props": measure(() => css.props(mergeMap, overrideMap, stateMap), 40_000),
		"runtime.css": measure(() => runtimeCss.class(runtimeStyles), 30_000),
		"runtime.sheet": measure(() => runtimeSheet.register([runtimeRule]), 1_000_000),
		tw: measure(() => compileStyles(twStyles, {}), 80_000),
		"cx.maps": measure(() => cssCx(mergeMap, overrideMap, stateMap), 40_000),
		"cx.plain": measure(() => cx("flex items-center gap-2", "grid gap-4"), 1_000_000),
		"cx.nested": measure(() => cx(nestedCxInputs, "grid"), 80_000),
	};

	const cssOutput = css.class(styles);
	const nestedCssOutput = nestedCss.class(nestedStyles);
	const composedOutput = css(mergeStyles, mergeOverrides, mergeState);
	const composedProps = css.props(mergeMap, overrideMap, stateMap);
	const cxMapsOutput = cssCx(mergeMap, overrideMap, stateMap);
	const runtimeOutput = runtimeCss.class(runtimeStyles);
	expect(cssOutput.split(" ")).toHaveLength(8);
	expect(cssOutput).not.toContain("[object");
	expect(nestedCssOutput).not.toContain("[object");
	expect(composedOutput.color).toBe(overrideMap.color);
	expect(composedOutput.backgroundColor).toBe(stateMap.backgroundColor);
	expect(composedProps.className).toContain(overrideMap.color);
	expect(cxMapsOutput).toContain(overrideMap.color);
	expect(runtimeOutput).not.toContain("[object");
	expect(runtimeSheet.css()).toContain("color");
	expect(compileStyles(twStyles, {})).toContain("bg-blue-600");
	expect(cx("flex items-center", "gap-4")).toBe("flex items-center gap-4");
	expect(cx(nestedCxInputs, "grid")).toBe("flex items-center grid");
	for (const [name, result] of Object.entries(results)) {
		expect(result.median, `${name} reported an invalid median`).toBeGreaterThan(0);
		expect(result.p10, `${name} reported an invalid p10`).toBeGreaterThan(0);
		expect(result.p90, `${name} reported an invalid p90`).toBeGreaterThanOrEqual(result.p10);
	}

	if (updatingSnapshots()) {
		await expect(JSON.stringify(results, null, 2)).toMatchFileSnapshot(SNAPSHOT);
		return;
	}

	const baseline = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<
		BenchmarkName,
		BenchmarkRecord
	>;
	for (const [name, result] of Object.entries(results) as Array<[BenchmarkName, BenchmarkRecord]>) {
		const reference = baseline[name];
		expect(
			reference,
			`missing ${name} benchmark snapshot; run pnpm run test:benchmarks -u`,
		).toBeDefined();
		// Throughput is noisy across machines. A 50% floor catches a real
		// algorithmic regression without making CI depend on CPU scheduling.
		expect(
			result.median,
			`${name} regressed from ${reference!.median} to ${result.median} ops/sec`,
		).toBeGreaterThan(reference!.median * 0.5);
	}
});
