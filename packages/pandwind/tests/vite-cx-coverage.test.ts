/**
 * Fold-coverage harness — measures what fraction of realistic `cx()` calls
 * the vite pass fully eliminates at build time, BEFORE vs AFTER the smarter
 * compiler features (module-level constant propagation + partial folding of
 * conditionals).
 *
 * The corpus models real app patterns: shared constant palettes, hook
 * helpers, map callbacks with dynamic keys (must stay runtime), mixed
 * static/dynamic composition. Coverage = fully-folded calls / total cx()
 * calls; partial folds count as eliminated too (the runtime cx call is gone)
 * but are reported separately for transparency.
 */
import { describe, expect, test } from "vitest";
import type { TwConfig } from "../src/vite/inline.ts";
import { extractTwConfig } from "../src/vite/inline.ts";
import { inlineCxCalls } from "../src/vite/cx-inline.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const twSource = readFileSync(
	resolve(import.meta.dirname, "../../../apps/example/src/tw.ts"),
	"utf8",
);
const config: TwConfig = extractTwConfig(twSource)!;

/** ~30 realistic module sources. Each entry lists its EXPECTED foldability. */
interface CorpusEntry {
	name: string;
	/** "full" = static fold, "partial" = conditional over merged branches, "runtime" = untouched */
	expect: "full" | "partial" | "runtime";
	source: string;
	/** Cross-module import bindings propagated into this entry. */
	imports?: Record<string, string>;
}

const corpus: CorpusEntry[] = [
	// --- plain literals (always folded, baseline sanity) ---
	{ name: "static pair", expect: "full", source: `export const a = cx("px-2", "py-4");` },
	{ name: "conflict chain", expect: "full", source: `export const b = cx("p-6", "px-4");` },
	{
		name: "array nesting",
		expect: "full",
		source: `export const c = cx(["flex", ["gap-4"]]);`,
	},
	{ name: "template literal", expect: "full", source: "export const d = cx(`grid gap-2`);" },
	// --- constants (the new propagation territory) ---
	{
		name: "shared palette const",
		expect: "full",
		source: `const BRAND_BG = "bg-indigo-600";\nexport const e = cx(BRAND_BG, "text-white rounded-lg px-4 py-2");`,
	},
	{
		name: "layout consts",
		expect: "full",
		source: `const PAD = "px-4 py-3";\nconst ROUND = "rounded-xl";\nexport const f = cx(PAD, ROUND, "shadow-sm");`,
	},
	{
		name: "const template interpolation",
		expect: "full",
		source: `const SHADE = "500";\nexport const g = cx(\`bg-red-\${SHADE} hover:bg-red-600\`);`,
	},
	{
		name: "concat chain const",
		expect: "full",
		source: `const BASE = "font-medium";\nconst SIZED = BASE + " text-sm tracking-wide";\nexport const h = cx(SIZED);`,
	},
	{
		name: "const used twice",
		expect: "full",
		source: `const FOCUS = "focus:outline-none focus:ring-2";\nexport const i = cx(FOCUS, "border");\nexport const i2 = cx(FOCUS, "border-0");`,
	},
	{
		name: "consts inside array args",
		expect: "full",
		source: `const RING = "ring-1 ring-gray-200";\nexport const j = cx([RING, "p-4"], "m-2");`,
	},
	// --- partial folding (new) ---
	{
		name: "variant ternary + statics",
		expect: "partial",
		source: `export const k = cx(isActive ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900", "px-4 py-2 rounded-md font-medium");`,
	},
	{
		name: "conditional modifier + statics",
		expect: "partial",
		source: `export const l = cx(disabled && "opacity-50 cursor-not-allowed", "bg-emerald-500 text-white p-3");`,
	},
	{
		name: "ternary between consts",
		expect: "partial",
		source: `const TONE_A = "bg-sky-500";\nconst TONE_B = "bg-amber-500";\nexport const m = cx(pick ? TONE_A : TONE_B, "text-sm p-2");`,
	},
	{
		name: "nested ternary branches",
		expect: "partial",
		source: `export const n = cx(size === "lg" ? "h-12 w-12" : size === "md" ? "h-9 w-9" : "h-6 w-6", "inline-flex items-center");`,
	},
	// --- must stay runtime ---
	{
		name: "map callback dynamic key",
		expect: "runtime",
		source: `statuses.map((s) => cx(s.color, "px-3 py-1 rounded-full"));`,
	},
	{
		name: "prop-driven class",
		expect: "runtime",
		source: `export const o = (props: { tone: string }) => cx(props.tone, "p-4");`,
	},
	{
		name: "interpolation of runtime value",
		expect: "runtime",
		source: `export const p = cx(\`w-\${width}\`, "block");`,
	},
	{
		name: "spread arg",
		expect: "runtime",
		source: `export const q = (...parts: string[]) => cx(...parts, "flex");`,
	},
	{
		name: "two dynamic conditionals",
		expect: "runtime",
		source: `export const r = cx(a ? "grid" : "block", b ? "flex" : "hidden");`,
	},
	{
		name: "function param shadowing a const name",
		expect: "runtime",
		source: `const PAD = "p-4";\nexport function Badge({ PAD }: { PAD: string }) { return cx(PAD, "m-1"); }`,
	},
	{
		name: "css atom object stays at runtime",
		expect: "runtime",
		source: `export const s = cx(css({ color: "$blue-500" }), "font-bold");`,
	},
	{
		name: "hook returning conditional",
		expect: "partial",
		source: `function useButton(variant: string) {\n\treturn cx(variant === "primary" ? "bg-indigo-600 text-white" : "bg-white text-indigo-600 border border-indigo-300", "rounded-lg px-5 py-2.5 font-semibold shadow");\n}`,
	},
	{
		name: "chained helper call result",
		expect: "runtime",
		source: `export const t = cx(getTone(index), "uppercase tracking-widest text-xs");`,
	},
	{
		name: "logical or fallback stays",
		expect: "runtime",
		source: `export const u = cx(tone || "bg-gray-500", "p-2");`,
	},
	{
		name: "nullish coalescing stays",
		expect: "runtime",
		source: `export const v = cx(width ?? "w-full", "mx-auto");`,
	},
	{
		name: "comparison test ternary",
		expect: "partial",
		source: `export const w = cx(count > 0 ? "border-red-400" : "border-gray-200", "border-2 rounded-lg p-4 mb-3 last:mb-0");`,
	},
	{
		name: "boolean negation test ternary",
		expect: "partial",
		source: `export const x = cx(!open && "hidden", "absolute inset-0 bg-black/50 z-40");`,
	},
	{
		name: "const + partial mix",
		expect: "partial",
		source: `const SHELL = "min-h-screen flex flex-col";\nexport const y = cx(SHELL, dark ? "bg-gray-900 text-white" : "bg-white text-gray-900");`,
	},
	{
		name: "full static with consts only",
		expect: "full",
		source: `const A1 = "a";\nconst A2 = A1 + "-2";\nconst A3 = \`\${A2}-3\`;\nexport const z = cx(A3);`,
	},
	{
		name: "dynamic key access",
		expect: "runtime",
		source: `const tones = { primary: "bg-blue-500", danger: "bg-red-500" };\nexport const zz = cx(tones[tone], "p-2");`,
	},
	// --- cross-module imports (propagated via importedConstants) ---
	{
		name: "cross-module direct import",
		expect: "full",
		imports: { PAD: "px-4 py-3" },
		source: `import { PAD } from "./styles/constants";\nexport const cm1 = cx(PAD, "rounded-xl");`,
	},
	{
		name: "cross-module barrel re-export",
		expect: "full",
		imports: { BRAND_BG: "bg-indigo-600" },
		source: `import { BRAND_BG } from "./styles";\nexport const cm2 = cx(BRAND_BG, "text-white");`,
	},
	{
		name: "cross-module star re-export",
		expect: "full",
		imports: { TONE: "text-white" },
		source: `import { TONE } from "./styles/palette";\nexport const cm3 = cx(TONE, "bg-indigo-600");`,
	},
	{
		name: "cross-module const + partial mix",
		expect: "partial",
		imports: { SHELL: "min-h-screen flex flex-col" },
		source: `import { SHELL } from "./styles/constants";\nexport const cm4 = cx(SHELL, dark ? "bg-gray-900 text-white" : "bg-white text-gray-900");`,
	},
	{
		name: "cross-module shadowed by param",
		expect: "runtime",
		imports: { PAD: "px-4 py-3" },
		source: `import { PAD } from "./styles/constants";\nexport function Badge({ PAD }: { PAD: string }) { return cx(PAD, "m-1"); }`,
	},
];

function measure(options?: Parameters<typeof inlineCxCalls>[4]) {
	let full = 0;
	let partial = 0;
	let runtime_ = 0;
	const mismatches: Array<{ name: string; expected: string; got: string }> = [];
	for (const entry of corpus) {
		const resolved = options ?? { constants: true, partialFold: true };
		const importedConstants =
			"imports" in entry && entry.imports
				? new Map(
						Object.entries(entry.imports as Record<string, string>).map(([name, value]) => [
							name,
							{ value, declStart: 0 },
						]),
					)
				: undefined;
		const { code, inlined } = inlineCxCalls(entry.source, "app.ts", config, new Set(["cx"]), {
			constants: resolved.constants,
			partialFold: resolved.partialFold,
			importedConstants,
		});
		let got: string;
		if (inlined === 0) got = "runtime";
		else if (code.includes(" ? ")) got = "partial";
		else got = "full";
		if (got !== entry.expect) mismatches.push({ name: entry.name, expected: entry.expect, got });
		if (got === "full") full++;
		else if (got === "partial") partial++;
		else runtime_++;
	}
	const total = corpus.length;
	return {
		full,
		partial,
		runtime: runtime_,
		total,
		eliminatedPct: Math.round(((full + partial) / total) * 100),
		mismatches,
	};
}

describe("fold coverage across a realistic corpus", () => {
	const before = measure({ constants: false, partialFold: false });
	const after = measure();

	test("corpus expectations match behavior after the smarter compiler", () => {
		if (after.mismatches.length) console.log("MISMATCH:", JSON.stringify(after.mismatches));
		expect(after.mismatches).toEqual([]);
	});

	test("coverage strictly improves and hits the target", () => {
		// Before: only the 4 fully-literal entries fold.
		expect(before.full).toBe(4);
		expect(before.eliminatedPct).toBeLessThan(after.eliminatedPct);
		// After: everything except the genuinely-runtime entries.
		expect(after.eliminatedPct).toBeGreaterThanOrEqual(60);
		console.log(
			`[cx fold coverage] before: ${before.eliminatedPct}% (${before.full}F/${before.partial}P/${before.runtime}R)` +
				` -> after: ${after.eliminatedPct}% (${after.full}F/${after.partial}P/${after.runtime}R) of ${after.total} calls`,
		);
	});
});

describe("finite dynamic cx() arguments register scanner candidates", () => {
	// Unfolded calls stay runtime (selection must not change), but their
	// finite literal value sets are reported so the Tailwind scanner can
	// emit CSS for classes that never appear as static source text.

	test("cross-module conditional registers both branch classes", () => {
		const source = `import { cx } from "./tw";
			const tone = pickTone();
			cx(tone === "light" ? "bg-sky-600" : "bg-gray-900");
		`;
		const { code, inlined, candidates } = inlineCxCalls(
			source,
			"app.ts",
			config,
			new Set(["cx"]),
			{
				partialFold: false,
				importedConstants: new Map([["pickTone", { value: "pickTone", declStart: 0 }]]),
			},
	);
	expect(inlined).toBe(0); // selection stays runtime
	expect(code).toBe(source); // source preserved verbatim
	expect(candidates).toHaveLength(2);
	expect(candidates).toEqual(expect.arrayContaining(["bg-sky-600", "bg-gray-900"]));
		/* prettier-ignore */
		expect(code).toMatchInlineSnapshot(`
			"import { cx } from "./tw";
						const tone = pickTone();
						cx(tone === "light" ? "bg-sky-600" : "bg-gray-900");
					"
		`);
	});

	test("truthy object keys register as possible classes, call stays runtime", () => {
		const source = `import { cx } from "./tw";
			const flags = getFlags();
			cx(flags && { "underline": true, "font-bold": true });
		`;
		const { inlined, candidates } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]));
		expect(inlined).toBe(0);
		expect(candidates).toEqual(["underline", "font-bold"]);
	});

	test("foreign classes are not registered", () => {
		const source = `import { cx } from "./tw";
			cx(Math.random() > 0.5 ? "my-custom-plugin-class" : "another-one");
		`;
		const { candidates } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]));
		expect(candidates).toBeUndefined();
	});

	test("unbounded arguments contribute no candidates", () => {
		const source = `import { cx } from "./tw";
			cx(dynamicClassName());
		`;
		const { candidates } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]));
		expect(candidates).toBeUndefined();
	});

	test("unverified finite candidates surface through the unresolved lane", () => {
		const source = `import { cx } from "./tw";
			const tone = pickTone();
			cx(tone === "light" ? "bg-sky-600" : "bg-nope-999");
		`;
		const { inlined, candidates, unresolved } = inlineCxCalls(
			source,
			"app.ts",
			config,
			new Set(["cx"]),
			{ partialFold: false, onUnresolved: "warn" },
		);
		expect(inlined).toBe(0); // selection stays runtime
		// The verified branch still registers for the scanner…
		expect(candidates).toEqual(["bg-sky-600"]);
		// …the unverified token is reported with its call-site line…
		expect(unresolved).toEqual([{ token: "bg-nope-999", line: 3, reason: "no-css" }]);
	});

	test("array arguments register their literal string entries", () => {
		const source = `import { cx } from "./tw";
			const tone = pickTone();
			cx([tone === "light" ? "bg-sky-600" : "bg-gray-900", "p-6"]);
		`;
	const { inlined, candidates } = inlineCxCalls(source, "app.ts", config, new Set(["cx"]));
	expect(inlined).toBe(0);
	expect(candidates).toHaveLength(3);
	expect(candidates).toEqual(expect.arrayContaining(["bg-sky-600", "bg-gray-900", "p-6"]));
	});
});
