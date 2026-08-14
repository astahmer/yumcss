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

/** camelCase -> dash-case, matching the runtime's class rendering. */
function dashCase(name: string): string {
	return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

const OPACITY_STEPS = [
	"0",
	"5",
	"10",
	"15",
	"20",
	"25",
	"30",
	"35",
	"40",
	"45",
	"50",
	"55",
	"60",
	"65",
	"70",
	"75",
	"80",
	"85",
	"90",
	"95",
	"100",
];

/**
 * Utilities that accept an opacity modifier (`bg-red-500/50`), detected by
 * compiling a sample candidate through Tailwind's own engine. The value type
 * stays a bounded template-literal union instead of a pre-enumerated
 * color x step product — TS keeps template unions lazy, so this adds
 * completions without the TS2589/TS2590 blowup an explicit cross product
 * would cause.
 */
function detectModifierUtilities(
	system: { candidatesToCss: (candidates: string[]) => (string | null)[] },
	types: UtilityMap,
): Set<string> {
	const probes: Array<{ name: string; candidate: string }> = [];
	for (const [name, values] of types) {
		if (!values.size) continue;
		const samples = [...values]
			.filter((value): value is string => value !== true)
			.slice(0, 2);
		for (const sample of samples) {
			probes.push({ name, candidate: `${dashCase(name)}-${sample}/50` });
		}
	}
	const results = system.candidatesToCss(
		probes.map((probe) => probe.candidate),
	);
	const modifierCapable = new Set<string>();
	probes.forEach((probe, index) => {
		if (results[index] !== null) modifierCapable.add(probe.name);
	});
	return modifierCapable;
}

function aliasName(name: string, used: Set<string>): string {
	const withoutDash = name.startsWith("-") ? name.slice(1) : name;
	const pascal = withoutDash
		.split("-")
		.filter(Boolean)
		.map((part) => {
			// Strip non-identifier characters (`@container` -> `container`).
			const cleaned = part.replace(/[^A-Za-z0-9_$]/g, "");
			return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
		})
		.join("");
	const base = name.startsWith("-") ? `Negative${pascal}` : pascal;
	let alias = `${base}Value`;
	let counter = 2;
	while (used.has(alias)) alias = `${pascal}Value${counter++}`;
	used.add(alias);
	return alias;
}

function modifierTypeHelpers(): string {
	const steps = OPACITY_STEPS.map((step) => JSON.stringify(step)).join(" | ");
	return `type OpacityModifier = ${steps};

type WithOpacityModifiers<T extends string> = T | \`\${T}/\${OpacityModifier}\`;`;
}

/**
 * Shorthands Tailwind emits whose longhand expansion is needed to detect
 * conflicts across utilities. `p-4` sets `padding`, `px-4` sets
 * `padding-inline` — different names, same physical properties, so both must
 * expand to the same canonical longhands before comparing.
 */
const SHORTHAND_EXPANSION: Record<string, string[]> = {
	padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
	"padding-inline": ["padding-left", "padding-right"],
	"padding-block": ["padding-top", "padding-bottom"],
	"padding-inline-start": ["padding-left"],
	"padding-inline-end": ["padding-right"],
	"padding-block-start": ["padding-top"],
	"padding-block-end": ["padding-bottom"],
	margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
	"margin-inline": ["margin-left", "margin-right"],
	"margin-block": ["margin-top", "margin-bottom"],
	"margin-inline-start": ["margin-left"],
	"margin-inline-end": ["margin-right"],
	"margin-block-start": ["margin-top"],
	"margin-block-end": ["margin-bottom"],
	inset: ["top", "right", "bottom", "left"],
	"inset-inline": ["left", "right"],
	"inset-block": ["top", "bottom"],
	"inset-inline-start": ["left"],
	"inset-inline-end": ["right"],
	"inset-block-start": ["top"],
	"inset-block-end": ["bottom"],
	gap: ["column-gap", "row-gap"],
	"border-width": [
		"border-top-width",
		"border-right-width",
		"border-bottom-width",
		"border-left-width",
	],
	"border-style": [
		"border-top-style",
		"border-right-style",
		"border-bottom-style",
		"border-left-style",
	],
	"border-color": [
		"border-top-color",
		"border-right-color",
		"border-bottom-color",
		"border-left-color",
	],
	"border-inline-style": ["border-left-style", "border-right-style"],
	"border-inline-width": ["border-left-width", "border-right-width"],
	"border-inline-color": ["border-left-color", "border-right-color"],
	"border-block-style": ["border-top-style", "border-bottom-style"],
	"border-block-width": ["border-top-width", "border-bottom-width"],
	"border-block-color": ["border-top-color", "border-bottom-color"],
	"border-inline-start-style": ["border-left-style"],
	"border-inline-start-width": ["border-left-width"],
	"border-inline-start-color": ["border-left-color"],
	"border-inline-end-style": ["border-right-style"],
	"border-inline-end-width": ["border-right-width"],
	"border-inline-end-color": ["border-right-color"],
	"border-block-start-style": ["border-top-style"],
	"border-block-start-width": ["border-top-width"],
	"border-block-start-color": ["border-top-color"],
	"border-block-end-style": ["border-bottom-style"],
	"border-block-end-width": ["border-bottom-width"],
	"border-block-end-color": ["border-bottom-color"],
	"scroll-margin": [
		"scroll-margin-top",
		"scroll-margin-right",
		"scroll-margin-bottom",
		"scroll-margin-left",
	],
	"scroll-margin-inline": ["scroll-margin-left", "scroll-margin-right"],
	"scroll-margin-block": ["scroll-margin-top", "scroll-margin-bottom"],
	"scroll-margin-inline-start": ["scroll-margin-left"],
	"scroll-margin-inline-end": ["scroll-margin-right"],
	"scroll-margin-block-start": ["scroll-margin-top"],
	"scroll-margin-block-end": ["scroll-margin-bottom"],
	"scroll-padding": [
		"scroll-padding-top",
		"scroll-padding-right",
		"scroll-padding-bottom",
		"scroll-padding-left",
	],
	"scroll-padding-inline": ["scroll-padding-left", "scroll-padding-right"],
	"scroll-padding-block": ["scroll-padding-top", "scroll-padding-bottom"],
	"scroll-padding-inline-start": ["scroll-padding-left"],
	"scroll-padding-inline-end": ["scroll-padding-right"],
	"scroll-padding-block-start": ["scroll-padding-top"],
	"scroll-padding-block-end": ["scroll-padding-bottom"],
};

/** Property names a compiled candidate actually sets (custom props excluded). */
function cssProperties(css: string | null): string[] {
	if (css === null) return [];
	const props = new Set<string>();
	for (const match of css.matchAll(/\.([^{}]+)\{([^}]*)\}/g)) {
		for (const declaration of match[2]!.split(";")) {
			const property = declaration.split(":")[0]?.trim();
			// Skip custom properties (`--tw-*`) and at-rule fragments that
			// Tailwind nests inside class rules (gradient `@supports`).
			if (
				property &&
				!property.startsWith("--") &&
				/^[a-zA-Z-]+$/.test(property)
			) {
				props.add(property);
			}
		}
	}
	return [...props].sort();
}

/** Expand shorthands so equivalent longhand sets compare equal. */
function canonicalProps(properties: string[]): string[] {
	const expanded = new Set<string>();
	for (const property of properties) {
		for (const longhand of SHORTHAND_EXPANSION[property] ?? [property]) {
			expanded.add(longhand);
		}
	}
	return [...expanded].sort();
}

/**
 * Utilities that compose through a shared CSS property and must never merge
 * across keys. Dash-case, including the negative variants the generator
 * produces (`-translate-x`, `-space-x`, ...).
 */
const COMPOSE_KEYS = new Set([
	"translate",
	"translate-x",
	"translate-y",
	"translate-z",
	"-translate",
	"-translate-x",
	"-translate-y",
	"-translate-z",
	"scale",
	"scale-x",
	"scale-y",
	"scale-z",
	"-scale",
	"-scale-x",
	"-scale-y",
	"-scale-z",
	"rotate",
	"rotate-x",
	"rotate-y",
	"rotate-z",
	"-rotate",
	"-rotate-x",
	"-rotate-y",
	"-rotate-z",
	"skew",
	"skew-x",
	"skew-y",
	"-skew",
	"-skew-x",
	"-skew-y",
	"blur",
	"brightness",
	"contrast",
	"drop-shadow",
	"grayscale",
	"hue-rotate",
	"invert",
	"saturate",
	"sepia",
	"backdrop-blur",
	"backdrop-brightness",
	"backdrop-contrast",
	"backdrop-grayscale",
	"backdrop-hue-rotate",
	"backdrop-invert",
	"backdrop-opacity",
	"backdrop-saturate",
	"backdrop-sepia",
	"-backdrop-hue-rotate",
	"-backdrop-invert",
	"-backdrop-opacity",
	"-backdrop-saturate",
	"-backdrop-sepia",
	"space-x",
	"space-y",
	"-space-x",
	"-space-y",
	"divide-x",
	"divide-y",
	"-divide-x",
	"-divide-y",
]);

function pickSamples(values: string[], max: number): string[] {
	if (values.length <= max) return values;
	const samples: string[] = [];
	const stride = (values.length - 1) / (max - 1);
	for (let index = 0; index < max; index++) {
		samples.push(values[Math.round(index * stride)]!);
	}
	return samples;
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

/**
 * Build the utility conflict map: utility (dash-case) -> value -> the CSS
 * properties that class sets (canonicalized). `"*"` is the per-utility
 * fallback. Only values whose properties differ from the utility's default
 * are emitted, keeping the generated map small — the overloaded utilities
 * (`text`, `border`, `bg`) are the ones that need per-value entries.
 */
function buildConflicts(
	system: {
		candidatesToCss: (candidates: string[]) => (string | null)[];
		utilities: {
			keys: (kind: "functional" | "static") => string[];
			getCompletions: (name: string) => unknown[];
		};
	},
	types: UtilityMap,
	functionalKeys: string[],
): {
	conflicts: Record<string, Record<string, string[]>>;
	compose: string[];
} {
	const functional = new Set(functionalKeys);
	const completions = new Map<
		string,
		Array<{ values: Array<string | null> }>
	>();
	const groupValues = new Map<string, Set<string>>();
	const propByValue = new Map<string, Map<string, string[]>>();
	const probes: Array<{ utility: string; value: string; candidate: string }> =
		[];

	for (const name of types.keys()) {
		if (!functional.has(name)) continue;
		const groups = system.utilities.getCompletions(name) as Array<{
			values: Array<string | null>;
		}>;
		completions.set(name, groups);
		const allValues = new Set<string>();
		for (const group of groups) {
			const values = group.values.filter(
				(value): value is string => typeof value === "string" && value !== "",
			);
			for (const value of values) allValues.add(value);
			for (const value of pickSamples(values, 2)) {
				probes.push({
					utility: name,
					value,
					candidate: `${dashCase(name)}-${value}`,
				});
			}
		}
		groupValues.set(name, allValues);
	}

	// Static suffixes merged into a functional key (e.g. `border-collapse` ->
	// key `border`, value `collapse`) set different properties than the
	// completions groups, so each is probed individually. Same for curated
	// prefixes and fallback groups, plus boolean utilities (bare class).
	for (const [name, values] of types) {
		const covered = groupValues.get(name) ?? new Set<string>();
		const uncovered = [...values].filter(
			(value): value is string => value !== true && !covered.has(value),
		);
		for (const value of uncovered) {
			probes.push({
				utility: name,
				value,
				candidate: `${dashCase(name)}-${value}`,
			});
		}
		if (values.has(true)) {
			probes.push({ utility: name, value: "", candidate: dashCase(name) });
		}
	}

	const sampleProps = new Map<
		string,
		Array<{ value: string; props: string[] }>
	>();
	for (const batch of chunk(probes, 300)) {
		const results = system.candidatesToCss(
			batch.map((probe) => probe.candidate),
		);
		batch.forEach((probe, index) => {
			const result = results[index];
			if (result === undefined || result === null) return;
			const props = canonicalProps(cssProperties(result));
			const samples = sampleProps.get(probe.utility) ?? [];
			samples.push({ value: probe.value, props });
			sampleProps.set(probe.utility, samples);
		});
	}

	// Group values inherit their group's sampled properties; individual
	// probes (static suffixes, booleans) override the specific value.
	for (const [name, groups] of completions) {
		const byValue = propByValue.get(name) ?? new Map();
		for (const group of groups) {
			const values = group.values.filter(
				(value): value is string => typeof value === "string" && value !== "",
			);
			const samples = sampleProps.get(name) ?? [];
			const groupProps = samples.find((sample) =>
				values.includes(sample.value),
			)?.props;
			if (groupProps === undefined) continue;
			for (const value of values) byValue.set(value, groupProps);
		}
		propByValue.set(name, byValue);
	}
	for (const [name, samples] of sampleProps) {
		const byValue = propByValue.get(name) ?? new Map();
		for (const sample of samples) byValue.set(sample.value, sample.props);
		propByValue.set(name, byValue);
	}

	const conflicts: Record<string, Record<string, string[]>> = {};
	for (const [name, byValue] of propByValue) {
		const sorted = [...byValue.entries()].sort(([a], [b]) =>
			a.localeCompare(b, "en"),
		);
		// Prefer a non-empty default so unknown values (arbitrary ring widths,
		// future theme values) behave like the real utilities, while values
		// that only set custom properties (`ring-red-500`, `shadow-red-500`)
		// are recorded as explicit `[]` overrides and never merge.
		const defaultProps =
			sorted.find(([, props]) => props.length > 0)?.[1] ?? sorted[0]?.[1] ?? [];
		const overrides: Record<string, string[]> = {};
		for (const [value, props] of sorted) {
			if (value !== "" && props.join(",") !== defaultProps.join(",")) {
				overrides[value] = props;
			}
		}
		conflicts[dashCase(name)] = { "*": defaultProps, ...overrides };
	}
	return {
		conflicts,
		compose: [...COMPOSE_KEYS].filter((key) => conflicts[key] !== undefined),
	};
}

function getUtilitiesType(
	types: UtilityMap,
	modifierCapable: Set<string>,
): string {
	const usedAliases = new Set<string>();
	const aliasBySet = new Map<string, string>();
	const aliases: string[] = [];
	const lines: string[] = [];

	for (const [name, values] of types) {
		if (!values.size) continue;
		const hasBoolean = values.has(true);
		// `true` cannot satisfy `T extends string` in `WithOpacityModifiers`,
		// so boolean-capable utilities (border, ring, container) keep their
		// boolean out of the template union and re-append it afterwards.
		const valueType = modifierCapable.has(name)
			? `WithOpacityModifiers<${unionType([...values].filter((value): value is string => value !== true))} | (string & {})>${hasBoolean ? " | true" : ""}`
			: `${unionType(values)} | (string & {})`;
		// Value sets repeat across utilities (the color palette is shared by
		// bg/text/fill/stroke/...); one alias per distinct set keeps the
		// generated file and the checker's union instances to a minimum.
		let alias = aliasBySet.get(valueType);
		if (alias === undefined) {
			alias = aliasName(name, usedAliases);
			aliasBySet.set(valueType, alias);
			aliases.push(`type ${alias} = ${valueType};`);
		}
		// Arrays let a single key emit multiple classes from an overloaded
		// utility: `{ text: ["2xl", "gray-900"] }` -> "text-2xl text-gray-900".
		lines.push(`\t${utilityKey(name)}?: ${alias} | Array<${alias}>;`);
	}

	return `${modifierTypeHelpers()}

${aliases.join("\n")}

interface WindUtilities {
${lines.sort(alphaSort).join("\n")}
}`;
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
	conflicts: Record<string, Record<string, string[]>>,
	compose: string[],
): string {
	const nonDefault = variants
		.filter(({ join }) => join !== ":")
		.map(
			({ name, join }) =>
				`\t\t${tsKey(camelCaseProperty(name))}: { join: ${JSON.stringify(join)} },`,
		);
	const conflictEntries = Object.entries(conflicts)
		.sort(([a], [b]) => a.localeCompare(b, "en"))
		.map(
			([utility, byValue]) =>
				`\t\t${JSON.stringify(utility)}: { ${Object.entries(byValue)
					.map(
						([value, props]) =>
							`${JSON.stringify(value)}: [${props.map((prop) => JSON.stringify(prop)).join(", ")}]`,
					)
					.join(", ")} },`,
		);
	const composeEntries =
		compose.length > 0
			? `\tcompose: [\n${compose
					.map((key) => `\t\t${JSON.stringify(key)},`)
					.join("\n")}\n\t],`
			: "";

	return `import { createTw } from "pandwind/tw";
import type { WindVariants } from "./types";

// The PURE annotation lets bundlers drop the whole module when every tw()
// call in the app was statically inlined by the vite plugin.
export const tw = /* @__PURE__ */ createTw<WindVariants>({
	variants: {
${nonDefault.join("\n")}
	},
${conflictEntries.length > 0 ? `\tconflicts: {\n${conflictEntries.join("\n")}\n\t},` : ""}
${composeEntries}
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
	const modifierCapable = detectModifierUtilities(system, types);
	const { conflicts, compose } = buildConflicts(system, types, functionalKeys);

	const variants: Array<{ name: string; join: ":" | "-" | "" }> = [];
	for (const variant of system.getVariants()) {
		variants.push({
			name: variant.name,
			join: detectVariantJoin(system, variant),
		});
	}

	return {
		typesDts: `${header}
${getUtilitiesType(types, modifierCapable)}

${getVariantsType(variants)}
`,
		twTs: getTwRuntime(variants, conflicts, compose),
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
