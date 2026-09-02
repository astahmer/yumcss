/* cx() microbench — BENCH.md shapes: short pair (4+3 tokens) + long pair (13+9 incl. variants).
 * Usage: nub cx-bench.mts [--prof]
 */
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCx } from "./src/cx/index.ts";
import { extractTwConfig } from "./src/vite/inline.ts";

const app = resolve(import.meta.dirname, "../../apps/example");
const twSource = readFileSync(resolve(app, "src/tw.ts"), "utf8");
const meta = extractTwConfig(twSource)!;

const cx = createCx({
	css: undefined as never,
	variants: meta.variants,
	conflicts: meta.conflicts,
	compose: meta.compose,
});
const plainCx = createCx();

// 4+3 short pair
const SHORT_A = "flex items-center gap-2 bg-red-500";
const SHORT_B = "grid gap-4 bg-blue-500";

// 13-token long A (incl. variants + arbitrary values)
const LONG_A = [
	"flex",
	"items-center",
	"justify-between",
	"w-full",
	"h-10",
	"px-4",
	"py-2",
	"text-sm",
	"font-medium",
	"rounded-md",
	"border",
	"shadow-sm",
	"md:hover:bg-blue-500",
].join(" ");
// 9-token long B
const LONG_B = [
	"block",
	"items-start",
	"w-auto",
	"h-12",
	"px-6",
	"text-base",
	"rounded-lg",
	"border-2",
	"hover:bg-red-600",
].join(" ");

/** Locale-independent thousands grouping - the smoke test parses this output. */
const groupDigits = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function measure(label: string, fn: () => void, samples = 15) {
	const medians: number[] = [];
	// warmup
	for (let i = 0; i < 3; i++) fn();
	let best = Infinity;
	for (let s = 0; s < samples; s++) {
		const n = 20_000;
		const t0 = performance.now();
		for (let i = 0; i < n; i++) fn();
		const dt = performance.now() - t0;
		const ops = (n / dt) * 1000;
		if (ops < best || best === Infinity) best = ops;
		medians.push(ops);
	}
	medians.sort((a, b) => a - b);
	console.log(
		`${label}: median ${groupDigits(Math.round(medians[Math.floor(medians.length / 2)]))} ops/sec  (min ${groupDigits(Math.round(medians[0]))}, max ${groupDigits(Math.round(medians[medians.length - 1]))})`,
	);
}

console.log("== short pair (4+3 tokens)");
measure("cx(SHORT_A, SHORT_B)", () => {
	cx(SHORT_A, SHORT_B);
});
console.log("== long pair (13+9 tokens)");
measure("cx(LONG_A, LONG_B)", () => {
	cx(LONG_A, LONG_B);
});
console.log("== long single string");
measure("cx(LONG_A)", () => {
	cx(LONG_A);
});

// Cold path: TRULY distinct inputs (never-repeated tokens => result-cache miss,
// tokenize miss, signature-parse miss on every token).
const COLD_N = 30_000;
const COLD_A: string[] = [];
const COLD_B: string[] = [];
for (let i = 0; i < COLD_N; i++) {
	COLD_A.push(
		[
			`flex${i}`,
			`items-${i}`,
			`justify-between`,
			`w-${i}0`,
			`h-10`,
			`px-${i + 1}`,
			`text-sm`,
			`md:hover:bg-blue-${i % 9}`,
		].join(" "),
	);
	COLD_B.push(
		[
			`block${i}`,
			`p-${i + 1}`,
			`rounded-lg`,
			`border-[${i}px]`,
			`hover:text-white`,
			`shadow-sm`,
		].join(" "),
	);
}
let cold = 0;
console.log("== cold: unique-token long pairs (all caches miss)");
measure(
	"cx(coldA[i], coldB[i])",
	() => {
		cx(COLD_A[cold % COLD_N], COLD_B[cold++ % COLD_N]);
	},
	9,
);

const PLAIN_N = 30_000;
const PLAIN_A = Array.from({ length: PLAIN_N }, (_, i) => `plain-a-${i}`);
const PLAIN_B = Array.from({ length: PLAIN_N }, (_, i) => `plain-b-${i}`);
let plain = 0;
console.log("== cold: plain no-config pairs (fast path)");
measure(
	"plainCx(PLAIN_A[i], PLAIN_B[i])",
	() => {
		plainCx(PLAIN_A[plain % PLAIN_N], PLAIN_B[plain++ % PLAIN_N]);
	},
	9,
);
