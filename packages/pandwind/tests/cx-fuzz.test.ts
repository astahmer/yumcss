/**
 * Seeded differential/invariant fuzz suite for the cx() runtime.
 *
 * The hot path was reworked for speed (memoized token/signature resolution,
 * allocation-free tokenizer — see plans/004-cx-runtime-perf.md); example-based
 * suites alone cannot pin behavior across the input space. This suite throws
 * several thousand seeded-random inputs at cx() and asserts INVARIANTS rather
 * than exact strings:
 *
 * 1. cx() never throws and always returns a string — including hostile
 *    unicode, control whitespace, empty/falsy inputs and nested arrays;
 * 2. unresolvable classes are kept verbatim, deduplicated by exact string,
 *    survivors in first-occurrence order;
 * 3. within a conflict family (same canonical CSS property / same variant
 *    scope), exactly the LAST member survives;
 * 4. merging an already-merged string is idempotent (cx(cx(x)) === cx(x));
 * 5. crossing the internal signature-cache reset cap does not change results
 *    (hot instance vs cold instances agree on an identical call stream).
 *
 * A golden block freezes the exact outputs of fixed seeded cases, so semantic
 * drift fails loudly even where the invariants happen to hold. All randomness
 * comes from an inline mulberry32 PRNG with fixed seeds — fully reproducible,
 * no dependencies added.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createCx } from "../src/cx/index.ts";
import type { CxInput } from "../src/cx/index.ts";
import { extractTwConfig } from "../src/vite/inline.ts";

const twSource = readFileSync(
	resolve(import.meta.dirname, "../../../apps/example/src/tw.ts"),
	"utf8",
);
const real = extractTwConfig(twSource)!;

/** Deterministic PRNG (mulberry32). Fixed seeds -> reproducible corpora. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fixed seed list — every test derives its stream from one of these. */
export const SEEDS = [0x00c0ffee, 123456789, 0xdeadbeef, 31337, 0x5eed1234] as const;

// ---------------------------------------------------------------------------
// Token universe
// ---------------------------------------------------------------------------

/** Pairwise non-conflicting utilities — order preservation + safe fillers. */
export const DISJOINT_POOL = [
	"flex",
	"opacity-100",
	"underline",
	"relative",
	"overflow-hidden",
	"border-2",
	"rounded-md",
	"italic",
	"select-none",
	"antialiased",
] as const;

/** Conflict families: members set the same canonical property/scope. */
export const CONFLICT_FAMILIES: ReadonlyArray<ReadonlyArray<string>> = [
	["bg-red-500", "bg-blue-500", "bg-green-600"],
	["text-gray-900", "text-black", "text-white"],
	["w-4", "w-8", "w-16"],
	["rounded-sm", "rounded-lg", "rounded-full"],
	["p-4", "p-8", "p-px"],
];

/** Variant-scoped families — members share the variant prefix AND property. */
export const VARIANT_FAMILIES: ReadonlyArray<ReadonlyArray<string>> = [
	["hover:bg-red-500", "hover:bg-blue-500"],
	["md:p-4", "md:p-8"],
];

/** Hostile / oddball single tokens. None resolve against the conflict map. */
export const WEIRD_TOKENS = [
	"",
	" ",
	"\t",
	"\n",
	"a  b",
	"\tpx-4\n",
	"café",
	"日本語クラス",
	"btn-\u{1F389}",
	"e\u0301clair",
	"[width:3px]",
	"w-[3.5rem]",
	"bg-[#fff]",
	"md:p-6",
	"group-hover:opacity-100",
	"@md:hover:bg-red-500",
	"-",
	"--",
] as const;

const PLAIN_KNOWN = ["px-4", "py-2", "flex", "underline", "border-2"] as const;

type Rng = () => number;

const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;

function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!]!;
	}
	return out;
}

/** Random argument list: tokens, multi-class strings, falsies, nested arrays. */
export function randomArgs(
	rng: Rng,
	pool: readonly string[],
	maxLen = 6,
): Array<CxInput | CxInput[]> {
	const len = 1 + Math.floor(rng() * maxLen);
	const args: Array<CxInput | CxInput[]> = [];
	for (let i = 0; i < len; i++) {
		const roll = rng();
		if (roll < 0.08) {
			args.push(pick(rng, [false, null, undefined] as const));
		} else if (roll < 0.18) {
			// nested array (possibly containing falsies)
			args.push([pick(rng, pool), rng() < 0.3 ? null : pick(rng, pool)]);
		} else if (roll < 0.28) {
			// multi-class string with messy whitespace
			args.push(`${pick(rng, pool)}${pick(rng, ["  ", "\t", "\n", " "])}${pick(rng, pool)}`);
		} else {
			args.push(pick(rng, pool));
		}
	}
	return args;
}

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

const css = createCss();
export const cx = createCx({
	css,
	variants: real.variants,
	conflicts: real.conflicts,
	compose: real.compose,
});

/** Fresh instance with a cold cache — the differential oracle. */
function coldCx(): ReturnType<typeof createCx> {
	return createCx({
		css: createCss(),
		variants: real.variants,
		conflicts: real.conflicts,
		compose: real.compose,
	});
}

// ---------------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------------

const tokensOf = (out: string): string[] => out.split(/\s+/).filter((t) => t !== "");

describe("cx() fuzz — invariants", () => {
	test("never throws, always returns a string, across the hostile corpus", () => {
		const rng = mulberry32(SEEDS[0]);
		const pool = [...PLAIN_KNOWN, ...WEIRD_TOKENS, ...DISJOINT_POOL];
		for (let i = 0; i < 4000; i++) {
			const args = randomArgs(rng, pool);
			const out = cx(...args);
			expect(typeof out).toBe("string");
			expect(out).not.toMatch(/\s{2,}|^\s|\s$/);
		}
	});

	test("unknown classes are kept verbatim, deduped, first-occurrence order", () => {
		const rng = mulberry32(SEEDS[1]);
		for (let i = 0; i < 1500; i++) {
			const k = 2 + Math.floor(rng() * 4);
			const unknowns = Array.from({ length: k }, (_, j) => `unknown-${i}-${j}`);
			// duplicate some, interleave fillers, shuffle
			const withDups = [...unknowns, ...unknowns.slice(0, 1 + Math.floor(rng() * 2))];
			const mixed = shuffle(rng, [...withDups, ...shuffle(rng, DISJOINT_POOL).slice(0, 3)]);
			const out = cx(...mixed);

			const outTokens = tokensOf(out);
			// Invariant = FIRST-OCCURRENCE order within the input, deduped.
			const expectedOrder = [
				...new Set(mixed.filter((t): t is string => typeof t === "string" && unknowns.includes(t))),
			];
			const survivors = outTokens.filter((t) => unknowns.includes(t));
			expect(survivors, `case ${i}: ${JSON.stringify(mixed)} -> ${out}`).toEqual(expectedOrder);

			// fillers must survive untouched too (they are pairwise disjoint)
			for (const filler of DISJOINT_POOL) {
				if (mixed.includes(filler)) expect(outTokens).toContain(filler);
			}
		}
	});

	test("last-wins per conflict family (base and variant scoped)", () => {
		const rng = mulberry32(SEEDS[2]);
		const families = [...CONFLICT_FAMILIES, ...VARIANT_FAMILIES];
		for (let i = 0; i < 1500; i++) {
			const family = families[Math.floor(rng() * families.length)]!;
			const seqLen = 2 + Math.floor(rng() * 4);
			const seq: string[] = [];
			for (let j = 0; j < seqLen; j++) {
				seq.push(family[Math.floor(rng() * family.length)]!);
				if (rng() < 0.4) seq.push(pick(rng, ["flex", "opacity-100", "underline"]));
			}
			const expected = seq.findLast((t) => family.includes(t))!;
			const out = cx(...seq);
			const survivors = tokensOf(out).filter((t) => family.includes(t));
			expect(survivors, `case ${i}: ${JSON.stringify(seq)} -> ${out}`).toEqual([expected]);
		}
	});

	test("multi-property tokens survive unrelated later utilities (cx v2 regression)", () => {
		const rng = mulberry32(SEEDS[4]);
		const textSizes = ["text-xs", "text-sm", "text-base", "text-lg"];
		const leadings = ["leading-tight", "leading-6", "leading-[24px]"];
		// An unrelated later utility must never drop a multi-prop token;
		// only a same-family utility or a full coverage may.
		for (let i = 0; i < 500; i++) {
			const size = pick(rng, textSizes);
			const leading = pick(rng, leadings);
			const filler = pick(rng, ["flex", "underline", "border-2", "opacity-100"]);
			// leading after size: size keeps font-size half
			expect(tokensOf(cx(size, leading, filler))).toContain(size);
			// size after leading: directional kill — size supersedes leading
			expect(tokensOf(cx(leading, size, filler))).toEqual([size, ...(filler ? [filler] : [])]);
		}
	});

	test("merging is idempotent: cx(cx(args)) === cx(args)", () => {
		const rng = mulberry32(SEEDS[3]);
		const pool: string[] = [...PLAIN_KNOWN, ...DISJOINT_POOL, ...WEIRD_TOKENS];
		for (const family of CONFLICT_FAMILIES) pool.push(...family);
		for (let i = 0; i < 1200; i++) {
			const once = cx(...randomArgs(rng, pool));
			expect(cx(once)).toBe(once);
		}
	});

	test("signature-cache reset does not change results (hot vs cold)", () => {
		// > SIGS_CACHE_CAP (8192) unique whole-input signatures forces the hot
		// instance through at least one cache reset mid-stream.
		for (let i = 0; i < 9000; i++) {
			const a = `probe-${i}-a`;
			const b = `probe-${i}-b`;
			const hot = cx(a, b, a);
			const cold = coldCx()(a, b, a);
			expect(hot).toBe(cold);
			// dedup + order invariant spot-check on the same stream
			expect(hot).toBe(`${a} ${b}`);
			if (i % 2500 === 0 && i > 0) {
				// occasionally exercise real conflicts on the hot instance too
				expect(cx("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Golden block — fixed seeded cases, exact outputs frozen below.
// Regenerate via: npx tsx scripts/print-cx-golden.mts (imports this builder).
// ---------------------------------------------------------------------------

export interface GoldenCase {
	name: string;
	args: Array<CxInput | CxInput[]>;
}

export function buildGoldenCases(): Array<GoldenCase & { output: string }> {
	const cases: GoldenCase[] = [
		{ name: "empty-and-falsies", args: [false, null, undefined, ""] },
		{ name: "whitespace-collapsing", args: ["a  b", "c\td\ne"] },
		{ name: "leading-trailing", args: ["  px-4  ", "\tpy-2\n"] },
		{ name: "unknown-dedup-order", args: ["zzz-1", "aaa-2", "zzz-1", "mmm-3"] },
		{ name: "unicode-verbatim", args: ["btn-\u{1F389}", "btn-\u{1F389}", "café", "日本語クラス"] },
		{ name: "combining-chars", args: ["e\u0301clair-x", "e\u0301clair-x", "flex"] },
		{ name: "family-last-wins-with-dups", args: ["bg-red-500", "bg-red-500", "bg-blue-500"] },
		{
			name: "family-interleaved-fillers",
			args: ["bg-red-500", "flex", "bg-blue-500", "opacity-100", "bg-green-600"],
		},
		{
			name: "variant-scoped-last-wins",
			args: ["hover:bg-red-500", "hover:bg-blue-500", "bg-red-500"],
		},
		{ name: "scopes-never-merge", args: ["hover:bg-red-500", "bg-blue-500"] },
		{ name: "arbitrary-values-conflict", args: ["w-4", "w-[3.5rem]"] },
		{ name: "arbitrary-untyped-bg", args: ["bg-red-500", "bg-[#fff]"] },
		{ name: "arbitrary-property-kept", args: ["bg-red-500", "[width:3px]"] },
		{ name: "nested-arrays-falsies", args: [["px-4", null], false, "py-2"] },
		{ name: "multi-class-strings", args: ["px-4\n  py-2", false, "", "flex"] },
		{ name: "compose-axis", args: ["px-4", "p-6"] },
		{ name: "compose-axis-reverse", args: ["p-6", "px-4"] },
		{ name: "idempotent-sample", args: ["p-4 md:p-6 hover:bg-red-500"] },
		{ name: "disjoint-pool-order", args: [...DISJOINT_POOL] },
		{ name: "dash-tokens-verbatim", args: ["-", "--", "-mx-1"] },
		{
			name: "weird-mix",
			args: ["@md:hover:bg-red-500", "group-hover:opacity-100", "md:p-6", false],
		},
		{ name: "only-falsy-array", args: [[null, undefined], false] },
		{ name: "single-empty-strings", args: ["", "", ""] },
		{ name: "known-plus-weird", args: ["px-4", "e\u0301clair", "underline", "\t\n", "border-2"] },
		// --- cx v2: multi-property survival + arbitrary disambiguation ---
		{ name: "multi-prop-partial-survival", args: ["text-xs", "leading-tight"] },
		{ name: "multi-prop-full-kill", args: ["text-xs", "text-sm"] },
		{ name: "directional-line-height", args: ["leading-tight", "text-xs"] },
		{ name: "arbitrary-text-shapes", args: ["text-[16px]", "text-[#000]"] },
		{ name: "arbitrary-border-width-vs-color", args: ["border-[#eee]", "border-[3px]"] },
		{ name: "border-b-arbitrary-vs-named", args: ["border-b-black", "border-b-[#eeb524]"] },
		{ name: "border-bare-vs-solid", args: ["border", "border-solid"] },
		{ name: "outline-bare-vs-width", args: ["outline", "outline-2"] },
		{ name: "transition-vs-duration", args: ["transition", "duration-150"] },
		{ name: "bg-url-coexists", args: ["bg-red-500", "bg-[url(https://x/y.png)]"] },
		{ name: "typed-arbitrary-group", args: ["[padding-left:4px]", "[padding-left:8px]"] },
	];
	return cases.map(({ name, args }) => ({ name, args, output: cx(...args) }));
}

describe("cx() fuzz — golden (frozen seeded cases)", () => {
	test("outputs match the frozen baseline", () => {
		// Frozen from buildGoldenCases() at authoring time (seeds/corpus fixed).
		// If this fails after an intentional runtime change, re-print via the
		// regeneration snippet in this file's header and review the diff.
		const expected: Record<string, string> = {
			"empty-and-falsies": "",
			"whitespace-collapsing": "a b c d e",
			"leading-trailing": "px-4 py-2",
			"unknown-dedup-order": "zzz-1 aaa-2 mmm-3",
			"unicode-verbatim": "btn-🎉 café 日本語クラス",
			"combining-chars": "e\u0301clair-x flex",
			"family-last-wins-with-dups": "bg-blue-500",
			"family-interleaved-fillers": "flex opacity-100 bg-green-600",
			"variant-scoped-last-wins": "hover:bg-blue-500 bg-red-500",
			"scopes-never-merge": "hover:bg-red-500 bg-blue-500",
			"arbitrary-values-conflict": "w-[3.5rem]",
			"arbitrary-untyped-bg": "bg-[#fff]",
			"arbitrary-property-kept": "bg-red-500 [width:3px]",
			"nested-arrays-falsies": "px-4 py-2",
			"multi-class-strings": "px-4 py-2 flex",
			"compose-axis": "p-6",
			// 2026-08-22 cx v2: partial survival — later px only covers
			// left/right of p-6, which survives on top/bottom. Verified
			// against real twMerge output (`twMerge('p-6 px-4')`).
			"compose-axis-reverse": "p-6 px-4",
			"idempotent-sample": "p-4 md:p-6 hover:bg-red-500",
			"disjoint-pool-order":
				"flex opacity-100 underline relative overflow-hidden border-2 rounded-md italic select-none antialiased",
			"dash-tokens-verbatim": "- -- -mx-1",
			"weird-mix": "@md:hover:bg-red-500 group-hover:opacity-100 md:p-6",
			// NOTE: all-falsy arrays yield "" as they should. (An earlier
			// probe found a stray-space quirk, but only for DEEPER nesting than
			// the public CxInput | CxInput[] type contract allows — out of
			// scope; flagged to the orchestrator.)
			"only-falsy-array": "",
			"single-empty-strings": "",
			"known-plus-weird": "px-4 e\u0301clair underline border-2",
			// cx v2 outputs verified against real tailwind-merge 3.6.0.
			"multi-prop-partial-survival": "text-xs leading-tight",
			"multi-prop-full-kill": "text-sm",
			"directional-line-height": "text-xs",
			"arbitrary-text-shapes": "text-[16px] text-[#000]",
			"arbitrary-border-width-vs-color": "border-[#eee] border-[3px]",
			"border-b-arbitrary-vs-named": "border-b-[#eeb524]",
			"border-bare-vs-solid": "border border-solid",
			"outline-bare-vs-width": "outline-2",
			"transition-vs-duration": "transition duration-150",
			"bg-url-coexists": "bg-red-500 bg-[url(https://x/y.png)]",
			"typed-arbitrary-group": "[padding-left:8px]",
		};

		for (const { name, output } of buildGoldenCases()) {
			expect(output, name).toBe(expected[name]);
		}
		expect(Object.keys(expected).length).toBe(35);
	});
});
