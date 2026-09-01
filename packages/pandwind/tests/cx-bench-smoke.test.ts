/**
 * Automated smoke for the cx microbench (cx-bench.mts).
 *
 * The bench is documentation-grade tooling with committed numbers in
 * BENCH.md/plan outcomes — until now nothing failed CI if it broke. This
 * spawns the real script and asserts: all four shapes report, numbers parse,
 * and throughput clears a deliberately generous floor (10K ops/sec — two
 * orders below any healthy run, so machine load never false-positives;
 * the point is catching "crashed / printed garbage / 3 orders slower",
 * not performance policing).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const TSX = resolve(import.meta.dirname, "../../analyze/node_modules/.bin/tsx");

interface Shape {
	label: string;
	opsPerSec: number;
}

function runBench(): { output: string; shapes: Array<Shape> } {
	const output = execFileSync(TSX, [resolve(ROOT, "cx-bench.mts")], {
		cwd: ROOT,
		encoding: "utf8",
		timeout: 180_000,
	});
	const shapes: Array<Shape> = [];
	for (const match of output.matchAll(/(?:cx|plainCx)\(([^)]*)\): median ([0-9,]+) ops\/sec/g)) {
		shapes.push({ label: match[1]!.trim(), opsPerSec: Number(match[2]!.replace(/,/g, "")) });
	}
	return { output, shapes };
}

describe("cx-bench smoke", () => {
	test(
		"bench runs, reports all five shapes, and clears the sanity floor",
		{ timeout: 200_000 },
		() => {
			const { output, shapes } = runBench();

			expect(output).toContain("== short pair (4+3 tokens)");
			expect(output).toContain("== long pair (13+9 tokens)");
			expect(output).toContain("== long single string");
			expect(output).toContain("== cold: unique-token long pairs");
			expect(output).toContain("== cold: plain no-config pairs (fast path)");

			expect(shapes.length).toBe(5);
			for (const shape of shapes) {
				expect(shape.opsPerSec, `${shape.label} reported NaN/garbage`).toBeGreaterThan(0);
				expect(shape.opsPerSec, `${shape.label} collapsed below sanity floor`).toBeGreaterThan(
					10_000,
				);
			}
			// Warm shapes must beat the cold shape by a wide margin — guards
			// against an accidental regression that disables whole-input caching.
			const byLabel = new Map(shapes.map((s) => [s.label, s.opsPerSec]));
			const warm = byLabel.get("LONG_A, LONG_B") ?? 0;
			const cold = byLabel.get("coldA[i], coldB[i]") ?? 0;
			expect(warm / cold).toBeGreaterThan(3);
		},
	);
});
