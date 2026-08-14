/**
 * pandwind codegen — generates a typed `tw()` from a real Tailwind design system.
 *
 * Loads the Tailwind design system from a CSS entry (via `@tailwindcss/node`),
 * introspects functional/static utilities, value completions and variants, then
 * writes two files next to the CSS entry:
 *
 * - `types.d.ts` — `WindVariants`: one key per utility + recursive variant keys,
 *   with literal value unions so the editor autocompletes real Tailwind classes.
 * - `tw.ts` — a typed `tw` instance wired with the design-system variant metadata.
 *
 * Usage:
 *   tsx generate-types.ts [css-entry] [out-dir]
 *
 * Both args default relative to the current working directory:
 *   src/tailwind.css -> src/types.d.ts + src/tw.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { camelCaseProperty } from "./camelcase-property.ts";

type Values = Set<string | true>;
type UtilityMap = Map<string, Values>;

/**
 * Static utilities that don't map to a functional utility key and whose names
 * have more than one meaningful segment (`pointer-events-none`, `grid-flow-col`).
 * The first segment heuristic would produce `pointer?: "events-none"`, which is
 * worse than a curated, stable prefix.
 */
const STATIC_PREFIXES = [
	"pointer-events",
	"touch-pan",
	"scroll-x",
	"scroll-y",
	"break-before",
	"break-inside",
	"place-content",
	"place-items",
	"place-self",
	"justify-content",
	"justify-items",
	"justify-self",
	"box-decoration",
	"grid-flow",
	"grid-cols",
	"grid-rows",
	"auto-rows",
	"auto-cols",
	"will-change",
	"backdrop-blur",
	"backdrop-brightness",
	"backdrop-contrast",
	"backdrop-grayscale",
	"backdrop-hue-rotate",
	"backdrop-invert",
	"backdrop-opacity",
	"backdrop-saturate",
	"backdrop-sepia",
	"mix-blend",
	"sr-only",
	"object-left",
	"object-right",
	"object-top",
	"object-bottom",
	"origin-top",
	"origin-right",
	"origin-bottom",
	"origin-left",
	"overflow-x",
	"overflow-y",
	"overscroll-x",
	"overscroll-y",
	"columns-3xs",
	"columns-2xs",
	"columns-xs",
	"columns-sm",
	"columns-md",
	"columns-lg",
	"columns-xl",
	"columns-2xl",
	"columns-3xl",
	"columns-4xl",
	"columns-5xl",
	"columns-6xl",
	"columns-7xl",
	"space-x",
	"space-y",
	"divide-x",
	"divide-y",
	"blur-none",
	"blur-sm",
	"blur-md",
	"blur-lg",
	"blur-xl",
	"blur-2xl",
	"blur-3xl",
	"brightness-0",
	"brightness-50",
	"brightness-75",
	"brightness-90",
	"brightness-95",
	"brightness-100",
	"brightness-105",
	"brightness-110",
	"brightness-125",
	"brightness-150",
	"brightness-200",
	"contrast-0",
	"contrast-50",
	"contrast-75",
	"contrast-100",
	"contrast-125",
	"contrast-150",
	"contrast-200",
	"saturate-0",
	"saturate-50",
	"saturate-100",
	"saturate-150",
	"saturate-200",
	"sepia-0",
	"sepia",
	"invert-0",
	"invert",
	"grayscale-0",
	"grayscale",
	"not-sr-only",
] as const;

function getFunctionalTypes(system: {
	utilities: {
		keys: (kind: "functional" | "static") => string[];
		getCompletions: (name: string) => unknown[];
	};
}): UtilityMap {
	const types: UtilityMap = new Map();

	for (const utility of system.utilities.keys("functional")) {
		if (!types.has(utility)) types.set(utility, new Set());
		const values = types.get(utility)!;

		for (const group of system.utilities.getCompletions(utility) as Array<{
			values: Array<string | null>;
			modifiers: string[];
		}>) {
			for (const value of group.values) {
				values.add(value === null ? true : value);
			}
		}
	}

	return types;
}

function longestFunctionalPrefix(
	candidate: string,
	functional: string[],
): string | undefined {
	let best: string | undefined;
	for (const key of functional) {
		if (candidate === key || candidate.startsWith(`${key}-`)) {
			if (best === undefined || key.length > best.length) best = key;
		}
	}
	return best;
}

function mergeStaticUtilities(
	system: {
		utilities: { keys: (kind: "functional" | "static") => string[] };
	},
	functionalKeys: string[],
	types: UtilityMap,
): void {
	for (const candidate of system.utilities.keys("static")) {
		const functional = longestFunctionalPrefix(candidate, functionalKeys);
		if (functional !== undefined) {
			const values = types.get(functional)!;
			const suffix =
				candidate === functional
					? true
					: candidate.slice(functional.length + 1);
			values.add(suffix);
			continue;
		}

		// Curated multi-segment prefixes.
		const curated = STATIC_PREFIXES.find(
			(prefix) => candidate === prefix || candidate.startsWith(`${prefix}-`),
		);
		if (curated !== undefined) {
			const values = types.get(curated) ?? new Set<string | true>();
			values.add(
				candidate === curated ? true : candidate.slice(curated.length + 1),
			);
			types.set(curated, values);
			continue;
		}

		// Fallback: first segment. `sr-only` has no dash -> boolean key.
		const dashIndex = candidate.indexOf("-");
		const group = dashIndex === -1 ? candidate : candidate.slice(0, dashIndex);
		const suffix = dashIndex === -1 ? true : candidate.slice(dashIndex + 1);
		const values = types.get(group) ?? new Set<string | true>();
		values.add(suffix);
		types.set(group, values);
	}
}

function unionType(values: Iterable<string | true>): string {
	return Array.from(values)
		.sort((a, b) => String(a).localeCompare(String(b), "en"))
		.map((value) => (value === true ? "true" : JSON.stringify(value)))
		.join(" | ");
}

/** Emits a bare identifier when valid, quoted otherwise (`@max`, `-translateX`). */
function tsKey(name: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function utilityKey(name: string): string {
	const camel = camelCaseProperty(name.startsWith("-") ? name.slice(1) : name);
	return name.startsWith("-") ? `"-${camel}"` : JSON.stringify(camel);
}

function getUtilitiesType(types: UtilityMap): string {
	const lines: string[] = [];

	for (const [name, values] of types) {
		if (!values.size) continue;
		const valueType = `${unionType(values)} | (string & {})`;
		// Arrays let a single key emit multiple classes from an overloaded
		// utility: `{ text: ["2xl", "gray-900"] }` -> "text-2xl text-gray-900".
		lines.push(`\t${utilityKey(name)}?: ${valueType} | Array<${valueType}>;`);
	}

	return `interface WindUtilities {\n${lines.sort(alphaSort).join("\n")}\n}`;
}

function getVariantsType(
	variants: Array<{ name: string; join: ":" | "-" | "" }>,
): string {
	const lines = variants.map(
		({ name }) => `\t${tsKey(camelCaseProperty(name))}?: WindVariants;`,
	);
	return `export type WindVariants = WindUtilities & {\n${lines.join("\n")}\n}`;
}

function getTwRuntime(
	variants: Array<{ name: string; join: ":" | "-" | "" }>,
): string {
	const nonDefault = variants
		.filter(({ join }) => join !== ":")
		.map(
			({ name, join }) =>
				`\t\t${tsKey(camelCaseProperty(name))}: { join: ${JSON.stringify(join)} },`,
		);

	return `import { createTw } from "pandwind/tw";
import type { WindVariants } from "./types";

export const tw = createTw<WindVariants>({
	variants: {
${nonDefault.join("\n")}
	},
});
`;
}

/**
 * Detect the separator a variant uses before its argument by compiling sample
 * candidates with Tailwind's own engine — the source of truth, whatever the
 * variant's internal shape is. `before:` joins with `:`, `group-not:` with
 * `-`, `@3xs:` with `` (nothing).
 *
 * Probes several modifiers per variant because e.g. `group-hover:` is valid
 * while `group-not:` (the first value in the design system) is not.
 */
function detectVariantJoin(
	system: { candidatesToCss: (candidates: string[]) => (string | null)[] },
	variant: { name: string; values: string[] },
): ":" | "-" | "" {
	const util = "bg-red-500";

	const probes: Array<[":" | "-" | "", string]> = [
		[":", `${variant.name}:${util}`],
	];

	const dashSamples = [...new Set(["hover", ...variant.values, "[x]"])]
		.filter((sample): sample is string => Boolean(sample))
		.slice(0, 4);
	for (const sample of dashSamples) {
		probes.push(["-", `${variant.name}-${sample}:${util}`]);
	}

	const emptySamples = [...new Set(variant.values)].filter(Boolean).slice(0, 2);
	for (const sample of emptySamples) {
		probes.push(["", `${variant.name}${sample}:${util}`]);
	}

	for (const [join, candidate] of probes) {
		if (system.candidatesToCss([candidate])[0] !== null) return join;
	}
	return ":";
}

const alphaSort = (a: string, b: string) =>
	a.localeCompare(b, "en", { ignorePunctuation: true });

const header =
	"// Generated by pandwind — do not edit. Run `pnpm tw:codegen` to regenerate.";

/**
 * Generate the two artifact files for a CSS entry. Exported so tests and
 * tooling can reuse it without writing to disk.
 */
export async function generateDesignSystem(
	css: string,
	base: string,
): Promise<{
	typesDts: string;
	twTs: string;
	utilityCount: number;
	variantCount: number;
}> {
	const system = await __unstable__loadDesignSystem(css, { base });

	const functionalKeys = system.utilities.keys("functional");
	const types = getFunctionalTypes(system);
	mergeStaticUtilities(system, functionalKeys, types);

	const variants: Array<{ name: string; join: ":" | "-" | "" }> = [];
	for (const variant of system.getVariants()) {
		variants.push({
			name: variant.name,
			join: detectVariantJoin(system, variant),
		});
	}

	return {
		typesDts: `${header}
${getUtilitiesType(types)}

${getVariantsType(variants)}
`,
		twTs: getTwRuntime(variants),
		utilityCount: types.size,
		variantCount: variants.length,
	};
}

if (process.argv[1]?.endsWith("generate-types.ts")) {
	const [cssEntryArg, outDirArg] = process.argv.slice(2);
	const base = process.cwd();
	const cssEntry = resolve(base, cssEntryArg ?? "src/tailwind.css");
	const outDir = resolve(base, outDirArg ?? "src");

	const css = readFileSync(cssEntry, "utf8");
	const { typesDts, twTs, utilityCount, variantCount } =
		await generateDesignSystem(css, base);

	writeFileSync(resolve(outDir, "types.d.ts"), typesDts);
	writeFileSync(resolve(outDir, "tw.ts"), twTs);

	console.log(
		`pandwind: generated types.d.ts (${utilityCount} utilities, ${variantCount} variants) and tw.ts from ${cssEntry}`,
	);
}
