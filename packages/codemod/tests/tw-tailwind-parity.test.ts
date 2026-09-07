/**
 * Tailwind compatibility proof — pandwind's tw()/cx() output vs the real
 * Tailwind compiler (`tailwindcss` 4.x, the same engine @tailwindcss/vite
 * uses in the example app).
 *
 * Three layers are proven here:
 *
 * 1. Full design-system sweep — every candidate Tailwind's own class list
 *    exposes (`getClassList()`, ~23k utilities incl. every theme color and
 *    spacing value) compiles to real CSS, and the generated conflict map
 *    predicts the exact standard CSS properties that class sets. That map is
 *    what tw()'s last-wins merging and cx() run on, so this is the
 *    correctness foundation for both.
 * 2. tw() corpus — style objects spanning variants, negatives, arrays,
 *    opacity modifiers and arbitrary values compile to class strings that
 *    the real compiler accepts and turns into rules.
 * 3. cx() merge — merged class strings stay valid Tailwind and resolve to
 *    exactly the last-wins declarations (the earlier classes' rules are
 *    gone, the survivors' rules are present).
 *
 * The snapshot test at the bottom records the real Tailwind-compiled CSS for
 * the representative corpus as a human-readable proof artifact.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile, __unstable__loadDesignSystem } from "@tailwindcss/node";
import { parse } from "postcss";
import { beforeAll, describe, expect, test } from "vitest";
import { createCx } from "pandwind/cx";
import { canonicalProps } from "../src/tw/generate-types.ts";
import { compileStyles, type TwNestedStyles, type TwVariantsMeta } from "pandwind/tw/compile";
import { createTw } from "pandwind/tw";
import { extractTwConfig } from "pandwind/vite/inline";
import { rulesForClass, TW_ENTRY } from "./helpers/tailwind-proof.ts";

const APP_DIR = resolve(import.meta.dirname, "../../../apps/example");

/** The committed generated config — the exact artifact the app runs on. */
function loadTwConfig(): NonNullable<ReturnType<typeof extractTwConfig>> {
	const source = readFileSync(resolve(APP_DIR, "src/tw.ts"), "utf8");
	const config = extractTwConfig(source);
	if (config === undefined)
		throw new Error("could not extract tw config from apps/example/src/tw.ts");
	return config;
}

/** Longest generated utility key that prefixes the candidate (`-col-start-1` -> `-col-start`). */
function decompose(
	className: string,
	conflicts: NonNullable<ReturnType<typeof extractTwConfig>>["conflicts"],
): { utility: string; value: string } | null {
	if (conflicts === undefined) return null;
	let best: string | undefined;
	for (const key of Object.keys(conflicts)) {
		if (className === key || className.startsWith(`${key}-`)) {
			if (best === undefined || key.length > best.length) best = key;
		}
	}
	if (best === undefined) return null;
	return { utility: best, value: className === best ? "" : className.slice(best.length + 1) };
}

/**
 * Mirror of the runtime lookup in `tw/compile.ts` — exact value, then
 * opacity-modifier-stripped value, then the utility's `*` fallback.
 */
function expectedProps(
	utility: string,
	value: string,
	conflicts: NonNullable<ReturnType<typeof extractTwConfig>>["conflicts"],
): string[] {
	if (conflicts === undefined) return [];
	const byValue = conflicts[utility];
	if (byValue === undefined) return [];
	return byValue[value] ?? byValue[value.replace(/\/\d+$/, "")] ?? byValue["*"] ?? [];
}

/** Standard properties a compiled candidate actually sets, canonicalized. */
function standardProps(className: string, css: string | null): string[] {
	if (css === null) return [];
	const root = parse(css);
	const props = new Set<string>();
	for (const rule of rulesForClass(root, className)) {
		rule.walkDecls((decl) => {
			if (!decl.prop.startsWith("--")) props.add(decl.prop);
		});
	}
	return canonicalProps([...props]);
}

/**
 * Tailwind serializes ring and inset-ring into the shared box-shadow
 * declaration, but its utilities compose through independent shadow layers.
 * The generated conflict map names those semantic layers explicitly so cx()
 * does not incorrectly make `ring` and `inset-ring` mutually exclusive.
 */
function semanticProps(utility: string, props: string[]): string[] {
	if (props.length === 1 && props[0] === "box-shadow") {
		if (utility === "ring") return ["ring-shadow"];
		if (utility === "inset-ring") return ["inset-ring-shadow"];
	}
	return props;
}

let config: ReturnType<typeof loadTwConfig>;
let ds: Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

beforeAll(async () => {
	config = loadTwConfig();
	ds = await __unstable__loadDesignSystem(TW_ENTRY, { base: resolve(APP_DIR, "src") });
});

describe("full design-system sweep", () => {
	test(
		"every Tailwind candidate compiles and the conflict map predicts its properties",
		{ timeout: 120_000 },
		async () => {
			const classList = ds
				.getClassList()
				.map(([className]) => className)
				.filter((className): className is string => className !== undefined);
			const failures: string[] = [];
			let verified = 0;

			for (let i = 0; i < classList.length; i += 200) {
				const chunk = classList.slice(i, i + 200);
				const results = ds.candidatesToCss(chunk);
				chunk.forEach((className, index) => {
					const css = results[index] ?? null;
					if (css === null) {
						failures.push(`${className}: does not compile`);
						return;
					}
					const decomposed = decompose(className, config.conflicts);
					if (decomposed === null) {
						failures.push(`${className}: no generated utility key covers it`);
						return;
					}
					const actual = semanticProps(decomposed.utility, standardProps(className, css));
					const expected = expectedProps(decomposed.utility, decomposed.value, config.conflicts);
					verified += 1;
					if (JSON.stringify(actual) !== JSON.stringify(expected)) {
						failures.push(
							`${className} (${decomposed.utility} / ${decomposed.value}): ` +
								`conflict map says ${JSON.stringify(expected)}, ` +
								`tailwind emits ${JSON.stringify(actual)}`,
						);
					}
				});
			}

			expect(failures, failures.slice(0, 25).join("\n")).toEqual([]);
			expect(verified).toBe(classList.length);
		},
	);
});

describe("tw() corpus", () => {
	const corpus: Array<{ styles: TwNestedStyles; classes: string }> = [
		{
			styles: { bg: "red-500", p: "4", hover: { bg: "blue-600" }, sm: { p: "6" } },
			classes: "bg-red-500 p-4 hover:bg-blue-600 sm:p-6",
		},
		{ styles: { text: ["2xl", "gray-900"] }, classes: "text-2xl text-gray-900" },
		{ styles: { flex: "col" }, classes: "flex flex-col" },
		{ styles: { "-translateX": "1/2" }, classes: "-translate-x-1/2" },
		{ styles: { bg: "gray-900/5" }, classes: "bg-gray-900/5" },
		{ styles: { w: "[3.5rem]" }, classes: "w-[3.5rem]" },
		{ styles: { group: { hover: { opacity: "100" } } }, classes: "group-hover:opacity-100" },
		{ styles: { max: { md: { bg: "red-500" } } }, classes: "max-md:bg-red-500" },
		{ styles: { aria: { checked: { bg: "sky-600" } } }, classes: "aria-checked:bg-sky-600" },
		{
			styles: { data: { "[state=open]": { bg: "sky-600" } } },
			classes: "data-[state=open]:bg-sky-600",
		},
		{ styles: { dark: { hover: { bg: "sky-700" } } }, classes: "dark:hover:bg-sky-700" },
		{
			styles: { rounded: "md", border: ["2", "red-500"] },
			classes: "rounded-md border-2 border-red-500",
		},
		{ styles: { gridCols: "3", gap: "4" }, classes: "grid-cols-3 gap-4" },
		{ styles: { relative: true, z: "10" }, classes: "relative z-10" },
		{ styles: { ring: ["1", "gray-900/5"] }, classes: "ring-1 ring-gray-900/5" },
		{ styles: { "-top": "4", left: "1/2" }, classes: "-top-4 left-1/2" },
		{ styles: { sm: { flex: "row" } }, classes: "sm:flex sm:flex-row" },
		{ styles: { p: ["4", "8"] }, classes: "p-8" },
	];

	test("compiles to the expected class strings", () => {
		for (const entry of corpus) {
			expect(compileStyles(entry.styles, config.variants, config.conflicts, config.compose)).toBe(
				entry.classes,
			);
		}
	});

	test("every emitted class is accepted by the real Tailwind compiler", async () => {
		const all = corpus.flatMap((entry) => entry.classes.split(" "));
		const result = await compile(TW_ENTRY, { base: APP_DIR, onDependency: () => {} });
		const output = result.build(all);
		const root = parse(output);
		const missing: string[] = [];

		for (const className of all) {
			if (rulesForClass(root, className).length === 0) missing.push(className);
		}

		expect(missing, `no rule emitted for: ${missing.join(", ")}`).toEqual([]);
	});
});

describe("cx() merge", () => {
	// createCx/createTw read `config`, which beforeAll populates.
	const cx = () =>
		createCx({
			variants: config.variants as TwVariantsMeta,
			conflicts: config.conflicts,
			compose: config.compose,
		});
	const tw = () => createTw(config);

	const getCases = (): Array<{
		input: string[];
		expected: string;
		dropped?: string[];
		/** Unknown classes are kept verbatim but are not real utilities. */
		skipCompile?: boolean;
	}> => [
		{ input: ["bg-red-500", "bg-blue-600"], expected: "bg-blue-600", dropped: ["bg-red-500"] },
		{
			input: ["bg-red-500", tw()({ bg: "blue-600" })],
			expected: "bg-blue-600",
			dropped: ["bg-red-500"],
		},
		// cx v2 twMerge parity: a later sub-group (px) does not supersede the
		// full-group p — verified against real tailwind-merge.
		{ input: ["p-4", "px-8"], expected: "p-4 px-8" },
		{ input: ["text-2xl", "text-base"], expected: "text-base", dropped: ["text-2xl"] },
		{ input: ["text-2xl", "text-gray-900"], expected: "text-2xl text-gray-900" },
		{ input: ["scale-x-110", "scale-y-125"], expected: "scale-x-110 scale-y-125" },
		{
			input: ["hover:bg-red-500", "hover:bg-blue-600"],
			expected: "hover:bg-blue-600",
			dropped: ["hover:bg-red-500"],
		},
		{ input: ["hover:bg-red-500", "bg-green-500"], expected: "hover:bg-red-500 bg-green-500" },
		{ input: ["flex", "flex-col"], expected: "flex flex-col" },
		{ input: ["bg-red-500", "my-custom"], expected: "bg-red-500 my-custom", skipCompile: true },
		{ input: ["p-4", "p-4"], expected: "p-4" },
	];

	test("last-wins per canonical property, variant-scoped and compose-aware", () => {
		for (const entry of getCases()) {
			expect(cx()(...entry.input), entry.input.join(" + ")).toBe(entry.expected);
		}
	});

	test("merged output compiles to the survivors' rules and none of the dropped", async () => {
		const result = await compile(TW_ENTRY, { base: APP_DIR, onDependency: () => {} });
		for (const entry of getCases()) {
			const root = parse(result.build(entry.expected.split(" ")));
			if (entry.skipCompile !== true) {
				for (const className of entry.expected.split(" ")) {
					expect(
						rulesForClass(root, className).length,
						`${entry.expected}: ${className} should compile`,
					).toBeGreaterThan(0);
				}
			}
			for (const className of entry.dropped ?? []) {
				expect(
					rulesForClass(root, className).length,
					`${entry.expected}: ${className} should have been dropped`,
				).toBe(0);
			}
		}
	});
});

describe("proof artifact", () => {
	test("real Tailwind-compiled CSS for the representative corpus", async () => {
		const result = await compile(TW_ENTRY, { base: APP_DIR, onDependency: () => {} });
		const corpusClasses = [
			"bg-red-500",
			"p-4",
			"hover:bg-blue-600",
			"sm:p-6",
			"text-2xl",
			"text-gray-900",
			"flex",
			"flex-col",
			"-translate-x-1/2",
			"group-hover:opacity-100",
			"max-md:bg-red-500",
			"aria-checked:bg-sky-600",
			"data-[state=open]:bg-sky-600",
			"dark:hover:bg-sky-700",
			"rounded-md",
			"border-2",
			"border-red-500",
			"grid-cols-3",
			"gap-4",
			"relative",
			"z-10",
			"ring-1",
			"ring-gray-900/5",
			"-top-4",
			"left-1/2",
			"bg-gray-900/5",
			"w-[3.5rem]",
		];
		const output = result.build(corpusClasses);
		await expect(output).toMatchFileSnapshot(
			resolve(import.meta.dirname, "snapshots", "tw-tailwind-compiled.css.snap"),
		);
	});
});
