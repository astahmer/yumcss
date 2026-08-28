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
import { dirname, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { buildAgentsDocument } from "./agents-json.ts";
import { FileSystemDesignSystemArtifactWriter } from "./codegen-artifacts.ts";
import { extractTwConfig } from "../vite/inline.ts";
import { camelCaseProperty } from "./camelcase-property.ts";
import { UTILITY_SUBKEYS } from "./compile.ts";
import {
	createConditionResolver,
	type ThemeConditions,
	themeVarsFromTokens,
	type ThemeScopeMap,
	type ThemeTokenGroups,
} from "./generate-theme.ts";
import { createThemeBridge } from "./theme-bridge.ts";
import type { DesignSystemCodegenPorts, DesignSystemCodegenResult } from "./codegen-pipeline.ts";

export type {
	DesignSystemArtifactBundle,
	DesignSystemArtifactWriter,
	DesignSystemArtifacts,
} from "./codegen-artifacts.ts";
export type {
	ConflictAnalyzer,
	DesignSystemCodegenPorts,
	DesignSystemCodegenResult,
	DesignSystemThemeLoader,
	RuntimeArtifactEmitter,
	TypeArtifactEmitter,
	UtilityCatalogBuilder,
} from "./codegen-pipeline.ts";

type Values = Set<string | true>;
type UtilityMap = Map<string, Values>;
type TailwindDesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

interface TailwindUtilityCatalog {
	types: UtilityMap;
	variants: Array<{ name: string; join: ":" | "-" | "" }>;
	utilityKeyNames: Set<string>;
}

interface TailwindConflictAnalysis {
	conflicts: Record<string, Record<string, string[]>>;
	compose: string[];
	modifierCapable: Set<string>;
}

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

function longestFunctionalPrefix(candidate: string, functional: string[]): string | undefined {
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
			const suffix = candidate === functional ? true : candidate.slice(functional.length + 1);
			values.add(suffix);
			continue;
		}

		// Curated multi-segment prefixes.
		const curated = STATIC_PREFIXES.find(
			(prefix) => candidate === prefix || candidate.startsWith(`${prefix}-`),
		);
		if (curated !== undefined) {
			const values = types.get(curated) ?? new Set<string | true>();
			values.add(candidate === curated ? true : candidate.slice(curated.length + 1));
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
		.toSorted((a, b) => String(a).localeCompare(String(b), "en"))
		.map((value) => (value === true ? "true" : JSON.stringify(value)))
		.join(" | ");
}

/**
 * Property-signature -> sub-key suffix. Signatures are the canonicalized
 * (sorted) longhand list a value compiles to. Known signatures get readable
 * names; anything else falls back to PascalCasing the joined properties.
 */
/**
 * Explicit property-signature -> sub-key suffix mappings.
 *
 * This table is also the WHITELIST: `expandSubkeys` only emits a sub-key
 * for a partition whose exact signature appears here. That keeps the
 * generated interface and the runtime `UTILITY_SUBKEYS` in agreement by
 * construction — overloaded concerns we deliberately do not split
 * (`background-blend-mode`/`-clip`/`-origin`, `border-collapse`, bare
 * outline resets) simply get no entry and stay on the base union only.
 */
const SUBKEY_SUFFIXES: Record<string, string> = {
	color: "Color",
	"font-size,line-height": "Size",
	"text-align": "Align",
	"text-overflow": "Overflow",
	"text-wrap": "Wrap",
	// bg family:
	"background-attachment": "Attachment",
	"background-color": "Color",
	"background-image": "Image",
	"background-position": "Position",
	"background-repeat": "Repeat",
	"background-size": "Size",
	// border family (widths compile style+width together in v4):
	"border-bottom-color,border-left-color,border-right-color,border-top-color": "Color",
	"border-bottom-style,border-bottom-width,border-left-style,border-left-width,border-right-style,border-right-width,border-top-style,border-top-width":
		"Width",
	"border-bottom-style,border-left-style,border-right-style,border-top-style": "Style",
	// outline family (bare resets keep compiling offset+style together — skipped):
	"outline-color": "Color",
	"outline-style": "Style",
	"outline-style,outline-width": "Width",
	// decoration family (box-decoration-break stays on the base):
	"text-decoration-color": "Color",
	"text-decoration-style": "Style",
	"text-decoration-thickness": "Thickness",
};

/**
 * Add semantic sub-key entries (`textColor`, `textSize`, ...) to the utility
 * map, derived from the generated conflict map: the base utility's values
 * are partitioned by the CSS properties they compile to, and each disjoint
 * partition becomes one typed sub-key whose values are exactly that concern.
 *
 * Purely additive — existing keys keep their full unions; sub-keys only add
 * narrower spellings that emit the same classes (runtime resolution in
 * `compile.ts` UTILITY_SUBKEYS).
 */
function expandSubkeys(
	types: UtilityMap,
	conflicts: Record<string, Record<string, string[]>>,
): void {
	// base utility (dash-case) -> sub-keys pointing at it.
	const subsByBase = new Map<string, string[]>();
	for (const [subkey, base] of Object.entries(UTILITY_SUBKEYS)) {
		const dashBase = dashCase(base);
		const subs = subsByBase.get(dashBase) ?? [];
		subs.push(subkey);
		subsByBase.set(dashBase, subs);
	}

	for (const [dashBase] of subsByBase) {
		const byValue = conflicts[dashBase];
		if (byValue === undefined) continue;
		const values = types.get(dashBase);
		if (values === undefined || !values.size) continue;

		const defaultProps = byValue["*"] ?? [];
		// Partition values by compiled property signature. Boolean/empty
		// (the bare class) stays on the base key only.
		const partitions = new Map<string, Set<string | true>>();
		for (const value of values) {
			if (value === true || value === "") continue;
			const props = byValue[value] ?? defaultProps;
			if (props.length === 0) continue;
			const signature = [...props].toSorted().join(",");
			const partition = partitions.get(signature) ?? new Set<string | true>();
			partition.add(value);
			partitions.set(signature, partition);
		}

		// Only split concerns we explicitly named in SUBKEY_SUFFIXES — the
		// table is the whitelist as well as the naming source, so the
		// generated interface never advertises a sub-key the runtime does
		// not resolve. Unnamed partitions stay on the base union only.
		const usedSuffixes = new Set<string>();
		for (const [signature, partition] of partitions) {
			let suffix = SUBKEY_SUFFIXES[signature];
			if (suffix === undefined) continue;
			while (usedSuffixes.has(suffix)) suffix = `${suffix}Alt`;
			usedSuffixes.add(suffix);

			types.set(`${camelCaseProperty(dashBase)}${suffix}`, partition);
		}
	}
}

/** Emits a bare identifier when valid, quoted otherwise (`@max`, `-translateX`). */
function tsKey(name: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function utilityKey(name: string): string {
	// Generated sub-key names (textColor) are already camelCase identifiers;
	// camelCaseProperty would flatten them (textcolor).
	if (!name.includes("-")) return JSON.stringify(name);
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
		// Sub-keys emit the BASE utility's class (`textColor: "x"` ->
		// `text-x`), so opacity-modifier probing must use the real class
		// prefix — probing `text-color-x/50` would wrongly report incapable.
		const utility = UTILITY_SUBKEYS[name] ?? dashCase(name);
		const samples = [...values].filter((value): value is string => value !== true).slice(0, 2);
		for (const sample of samples) {
			probes.push({ name, candidate: `${utility}-${sample}/50` });
		}
	}
	const results = system.candidatesToCss(probes.map((probe) => probe.candidate));
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

/**
 * Property names a compiled candidate actually sets (custom props excluded).
 *
 * Scans the compiled CSS with a brace-aware walker instead of a regex:
 * Tailwind nests some declarations inside `@supports` blocks (gradients),
 * and a `/\.[^{}]+\{([^}]*)\}/` pattern dropped every declaration that came
 * after a nested block inside the same rule. `@property` and `@keyframes`
 * blocks are skipped — the former is custom-property metadata
 * (syntax/inherits/initial-value), the latter describes animation keyframes,
 * neither of which is a style the class itself sets.
 */
function cssProperties(css: string | null): string[] {
	if (css === null) return [];
	const props = new Set<string>();

	let depth = 0;
	let inSkippedBlock = false;
	let i = 0;
	while (i < css.length) {
		const char = css[i]!;

		// Strings: values can contain braces, colons and semicolons.
		if (char === '"' || char === "'") {
			const quote = char;
			i += 1;
			while (i < css.length && css[i] !== quote) {
				if (css[i] === "\\") i += 1;
				i += 1;
			}
			i += 1;
			continue;
		}

		// Comments.
		if (char === "/" && css[i + 1] === "*") {
			i += 2;
			while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) i += 1;
			i += 2;
			continue;
		}

		// Function values (`url(...)`, `var(...)`, gradients): colons inside
		// parens must not be mistaken for property delimiters.
		if (char === "(") {
			let nested = 1;
			i += 1;
			while (i < css.length && nested > 0) {
				if (css[i] === "(") nested += 1;
				else if (css[i] === ")") nested -= 1;
				i += 1;
			}
			continue;
		}

		if (char === "{") {
			const previous = css.slice(0, i).split(/[{}]/).at(-1) ?? "";
			if (/^@(?:property|keyframes)\b/.test(previous.trimStart())) {
				inSkippedBlock = true;
			}
			depth += 1;
			i += 1;
			continue;
		}

		if (char === "}") {
			if (depth === 1) inSkippedBlock = false;
			depth = Math.max(0, depth - 1);
			i += 1;
			continue;
		}

		if (depth === 0 || inSkippedBlock) {
			i += 1;
			continue;
		}

		// Custom properties (`--tw-*`) are Tailwind implementation details,
		// never styles. Skipping the whole identifier also stops the
		// declaration pattern from matching the `tw-...` run after the dashes.
		if (char === "-" && css[i + 1] === "-") {
			while (i < css.length && /[a-zA-Z0-9-]/.test(css[i]!)) i += 1;
			continue;
		}

		// Inside a rule body: capture `property:` at a declaration start.
		// A single leading dash covers vendor prefixes (`-webkit-*`,
		// `-moz-*`); custom properties (`--tw-*`) were skipped above.
		const declaration = /^(-?[a-zA-Z][a-zA-Z0-9-]*)\s*:/.exec(css.slice(i));
		if (declaration !== null) {
			props.add(declaration[1]!);
			i += declaration[0].length;
			continue;
		}
		i += 1;
	}
	return [...props].toSorted();
}

/**
 * Expand shorthands so equivalent longhand sets compare equal. Exported so
 * the Tailwind-parity tests canonicalize real compiler output with the exact
 * table the generated conflict map was built from.
 */
export function canonicalProps(properties: string[]): string[] {
	const expanded = new Set<string>();
	for (const property of properties) {
		for (const longhand of SHORTHAND_EXPANSION[property] ?? [property]) {
			expanded.add(longhand);
		}
	}
	return [...expanded].toSorted();
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
		getClassList: () => Array<[string, unknown]>;
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
	const completions = new Map<string, Array<{ values: Array<string | null> }>>();
	const groupValues = new Map<string, Set<string>>();
	const propByValue = new Map<string, Map<string, string[]>>();
	const probes: Array<{ utility: string; value: string; candidate: string }> = [];

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
			// Probe every value individually: completions groups normally
			// share properties, but not always (`transition-none` omits
			// duration/timing while the rest of its group sets all three).
			// Sampling would let one special value mislabel the whole group.
			for (const value of values) {
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

	// Functional keys with no completions groups and no static coverage
	// (`-bg-conic`, `-bg-linear`, `-mask-conic`, ...) still have real
	// candidates in the class list. Probe every class-list candidate that
	// decomposes to an uncovered key so the map records their properties
	// instead of leaving a dead `[]` default.
	const classList = system.getClassList();
	const bestPrefixByCandidate = new Map<string, string>();
	for (const [candidate] of classList) {
		const best = longestFunctionalPrefix(candidate, functionalKeys);
		if (best !== undefined) bestPrefixByCandidate.set(candidate, best);
	}
	for (const [name, values] of types) {
		if (!functional.has(name)) continue;
		const covered = groupValues.get(name) ?? new Set<string>();
		for (const [candidate, best] of bestPrefixByCandidate) {
			// Decompose with the global prefix set: `-col-start-1` belongs to
			// `-col-start`, not `-col`, and `-inset-be-0` to `-inset-be`.
			if (best !== name) continue;
			const value = candidate === name ? "" : candidate.slice(name.length + 1);
			if (value === "" || covered.has(value) || values.has(value)) continue;
			probes.push({ utility: name, value, candidate });
		}
	}

	const sampleProps = new Map<string, Array<{ value: string; props: string[] }>>();
	for (const batch of chunk(probes, 300)) {
		const results = system.candidatesToCss(batch.map((probe) => probe.candidate));
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
			const groupProps = samples.find((sample) => values.includes(sample.value))?.props;
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
		const sorted = [...byValue.entries()].toSorted(([a], [b]) => a.localeCompare(b, "en"));
		// Prefer a non-empty default so unknown values (arbitrary ring widths,
		// future theme values) behave like the real utilities, while values
		// that only set custom properties (`ring-red-500`, `shadow-red-500`)
		// are recorded as explicit `[]` overrides and never merge.
		const defaultProps = sorted.find(([, props]) => props.length > 0)?.[1] ?? sorted[0]?.[1] ?? [];
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

function getUtilitiesType(types: UtilityMap, modifierCapable: Set<string>): string {
	const usedAliases = new Set<string>();
	const aliasBySet = new Map<string, string>();
	const aliases: string[] = [];
	const lines: string[] = [];

	for (const [name, values] of types) {
		if (!values.size) continue;
		// `true` cannot satisfy `T extends string` in `WithOpacityModifiers`,
		// so it never goes into the template union — it's appended (once,
		// below) to the interface entry directly instead.
		const stringValues = [...values].filter((value): value is string => value !== true);
		const valueType = modifierCapable.has(name)
			? `WithOpacityModifiers<${unionType(stringValues)} | (string & {})>`
			: `${unionType(stringValues)} | (string & {})`;
		// Value sets repeat across utilities (the color palette is shared by
		// bg/text/fill/stroke/...); one alias per distinct set keeps the
		// generated file and the checker's union instances to a minimum.
		let alias = aliasBySet.get(valueType);
		if (alias === undefined) {
			alias = aliasName(name, usedAliases);
			aliasBySet.set(valueType, alias);
			aliases.push(`type ${alias} = ${valueType};`);
		}
		// The runtime accepts a bare boolean flag on every key — a utility's
		// own empty-value form, or a slot in a collision-merge array (see
		// `tw/compile.ts`'s array handling) — regardless of whether this
		// key's own completion probe happened to surface a distinct bare
		// candidate. The type always allows it too, so it never falls behind
		// what `tw()` actually does at runtime.
		// Arrays let a single key emit multiple classes from an overloaded
		// utility: `{ text: ["2xl", "gray-900"] }` -> "text-2xl text-gray-900".
		lines.push(`\t${utilityKey(name)}?: ${alias} | true | Array<${alias} | true>;`);
	}

	return `${modifierTypeHelpers()}

${aliases.join("\n")}

interface WindUtilities {
${lines.toSorted(alphaSort).join("\n")}
}`;
}

function getVariantsType(
	variants: Array<{ name: string; join: ":" | "-" | "" }>,
	utilityKeyNames: ReadonlySet<string>,
): string {
	// A few Tailwind names are both a plain utility (`placeholder-gray-400`
	// sets a value) and a pseudo-element/class variant (`placeholder:` nests
	// further rules). `WindUtilities & { name?: WindVariants }` would
	// silently INTERSECT both declarations of the same key into one type no
	// value (plain or nested) can satisfy — exclude those keys from the
	// intersection and give them an explicit union instead.
	const collisions = variants
		.map(({ name }) => tsKey(camelCaseProperty(name)))
		.filter((key) => utilityKeyNames.has(key.replace(/^"|"$/g, "")));
	const lines = variants.map(({ name }) => {
		const key = tsKey(camelCaseProperty(name));
		const property = key.replace(/^"|"$/g, "");
		return collisions.includes(key)
			? `\t${key}?: WindVariants | WindUtilities[${JSON.stringify(property)}];`
			: `\t${key}?: WindVariants;`;
	});
	// Arbitrary data-attribute / aria variants (`data-[expanded]`,
	// `group-data-[state=x]/sidebar`) aren't enumerable at codegen time —
	// the bracket contents are open-ended — but they're still valid
	// selectors the codemod (and hand-authored tw() calls) nest under. A
	// template-literal index signature accepts exactly that shape; named
	// variant keys above never match this pattern, so it doesn't widen them.
	const arbitraryVariantIndex =
		'\t[key: `${"" | "group-" | "peer-"}${"data" | "aria"}-[${string}]${"" | `/${string}`}`]: WindVariants;';
	const collisionProperties = collisions.map((key) => JSON.stringify(key.replace(/^"|"$/g, "")));
	const base =
		collisionProperties.length > 0
			? `Omit<WindUtilities, ${collisionProperties.join(" | ")}>`
			: "WindUtilities";
	return `export type WindVariants = ${base} & {\n${lines.join("\n")}\n${arbitraryVariantIndex}\n}`;
}

function getTwRuntime(
	variants: Array<{ name: string; join: ":" | "-" | "" }>,
	conflicts: Record<string, Record<string, string[]>>,
	compose: string[],
): string {
	// Every variant is emitted (including `:`-join defaults) so consumers
	// like the tailwind css() adapter can look any design condition up.
	const variantEntries = variants.map(
		({ name, join }) => `\t\t${tsKey(camelCaseProperty(name))}: { join: ${JSON.stringify(join)} },`,
	);
	const conflictEntries = Object.entries(conflicts)
		.toSorted(([a], [b]) => a.localeCompare(b, "en"))
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
			? `\tcompose: [\n${compose.map((key) => `\t\t${JSON.stringify(key)},`).join("\n")}\n\t],`
			: "";

	return `import { createTw, type TwOptions } from "pandwind/tw";
import type { WindVariants } from "./types";

// Metadata export so apps can build a runtime cx() against the SAME
// generated conflict map the vite plugins use (see createCx in pandwind/cx).
export const __pandwindConfig: TwOptions = {
	variants: {
${variantEntries.join("\n")}
	},
${conflictEntries.length > 0 ? `\tconflicts: {\n${conflictEntries.join("\n")}\n\t},` : ""}
${composeEntries}
};

// The PURE annotation lets bundlers drop the whole module when every tw()
// call in the app was statically inlined by the vite plugin.
export const tw = /* @__PURE__ */ createTw<WindVariants>(__pandwindConfig);
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

	const probes: Array<[":" | "-" | "", string]> = [[":", `${variant.name}:${util}`]];

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

const alphaSort = (a: string, b: string) => a.localeCompare(b, "en", { ignorePunctuation: true });

/**
 * Find preset condition definitions (`Record<string, string | string[]>`)
 * inside an imported tokens/preset module: the first object carrying a
 * `.conditions` record whose values are strings or arrays of strings.
 */
export function resolvePresetConditions(
	module: Record<string, unknown>,
): ThemeConditions | undefined {
	const candidates: unknown[] = [
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => value),
	];
	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const cond = obj.conditions;
		if (cond === null || typeof cond !== "object") continue;
		const values = Object.values(cond as Record<string, unknown>);
		if (
			values.length > 0 &&
			values.every(
				(v) =>
					typeof v === "string" ||
					(Array.isArray(v) && v.every((part) => typeof part === "string")),
			)
		) {
			return cond as ThemeConditions;
		}
	}
	return undefined;
}

/**
 * Find DTCG token groups inside an imported tokens/preset module: the first
 * export (default first) that either is a groups object itself or carries a
 * `.tokens` field with at least one theme-namespace-bridged group.
 */
export function resolveTokenGroups(module: Record<string, unknown>): ThemeTokenGroups | undefined {
	const candidates: Array<{ groups: unknown }> = [
		{ groups: module.default },
		{ groups: module.tokenGroups },
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => ({ groups: value })),
	];
	for (const { groups: candidate } of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const groups = obj.tokens !== null && typeof obj.tokens === "object" ? obj.tokens : obj;
		if (groups === null || typeof groups !== "object") continue;
		if (themeVarsFromTokens(groups as ThemeTokenGroups).length > 0) {
			return groups as ThemeTokenGroups;
		}
	}
	return undefined;
}

/**
 * Resolve declared theme scopes (plans/015) from a tokens/preset module:
 * the first export carrying a `themes` object wins, mirroring
 * resolveTokenGroups/resolvePresetConditions candidate order.
 */
export function resolveThemes(module: Record<string, unknown>): ThemeScopeMap | undefined {
	const candidates: unknown[] = [
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => value),
	];
	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const themes = obj.themes;
		if (themes !== null && typeof themes === "object") return themes as ThemeScopeMap;
	}
	return undefined;
}

/**
 * Resolve declared component scopes (plans/015 L3) from a tokens/preset
 * module: the first export carrying a `components` object wins, mirroring
 * resolveThemes candidate order.
 */
export function resolveComponents(
	module: Record<string, unknown>,
): Record<string, Record<string, unknown>> | undefined {
	const candidates: unknown[] = [
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => value),
	];
	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const components = obj.components;
		if (components !== null && typeof components === "object") {
			return components as Record<string, Record<string, unknown>>;
		}
	}
	return undefined;
}

const header = "// Generated by pandwind — do not edit. Run `pnpm tw:codegen` to regenerate.";

export interface GenerateDesignSystemOptions {
	/**
	 * A generated `@theme {}` block (see generate-theme.ts) injected into the
	 * CSS before Tailwind loads it. Token-derived utilities then flow into
	 * the generated types like any other utility, so tw() autocomplete is
	 * driven by your design system's tokens. Omitted (or empty) = unchanged
	 * behavior.
	 */
	themeBlock?: string;
	/** Replaceable codegen stages for alternate design-system engines. */
	ports?: DesignSystemCodegenPorts<
		TailwindDesignSystem,
		TailwindUtilityCatalog,
		TailwindConflictAnalysis
	>;
}

const defaultCodegenPorts: DesignSystemCodegenPorts<
	TailwindDesignSystem,
	TailwindUtilityCatalog,
	TailwindConflictAnalysis
> = {
	theme: {
		load: (css, base, themeBlock) =>
			__unstable__loadDesignSystem(themeBlock ? `${css}\n${themeBlock}` : css, { base }),
	},
	catalog: {
		build: (system) => {
			const functionalKeys = system.utilities.keys("functional");
			const types = getFunctionalTypes(system);
			mergeStaticUtilities(system, functionalKeys, types);
			const variants: Array<{ name: string; join: ":" | "-" | "" }> = [];
			for (const variant of system.getVariants()) {
				variants.push({ name: variant.name, join: detectVariantJoin(system, variant) });
			}
			const utilityKeyNames = new Set(
				[...types.keys()].map((name) => utilityKey(name).replace(/^"|"$/g, "")),
			);
			return { types, variants, utilityKeyNames };
		},
	},
	conflicts: {
		analyze: (system, catalog) => {
			const result = buildConflicts(system, catalog.types, system.utilities.keys("functional"));
			expandSubkeys(catalog.types, result.conflicts);
			return { ...result, modifierCapable: detectModifierUtilities(system, catalog.types) };
		},
	},
	types: {
		emit: (catalog, analysis) =>
			`${header}\n${getUtilitiesType(catalog.types, analysis.modifierCapable)}\n\n${getVariantsType(catalog.variants, catalog.utilityKeyNames)}\n`,
	},
	runtime: {
		emit: (catalog, analysis) =>
			getTwRuntime(catalog.variants, analysis.conflicts, analysis.compose),
	},
};

/**
 * Generate the two artifact files for a CSS entry. Exported so tests and
 * tooling can reuse it without writing to disk.
 */
export async function generateDesignSystem(
	css: string,
	base: string,
	options: GenerateDesignSystemOptions = {},
): Promise<DesignSystemCodegenResult> {
	const ports = options.ports ?? defaultCodegenPorts;
	const system = await ports.theme.load(css, base, options.themeBlock);
	const catalog = ports.catalog.build(system);
	const analysis = ports.conflicts.analyze(system, catalog);
	return {
		typesDts: ports.types.emit(catalog, analysis),
		twTs: ports.runtime.emit(catalog, analysis),
		utilityCount: catalog.types.size,
		variantCount: catalog.variants.length,
	};
}

if (process.argv[1]?.endsWith("generate-types.ts")) {
	const positional: string[] = [];
	let tokensModulePath: string | undefined;
	let agentsFlag = false;
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--tokens") {
			tokensModulePath = args[++i];
		} else if (arg === "--agents") {
			agentsFlag = true;
		} else if (arg !== undefined) {
			positional.push(arg);
		}
	}

	const base = process.cwd();
	const themeBridge = createThemeBridge();
	const cssEntry = resolve(base, positional[0] ?? "src/tailwind.css");
	const outDir = resolve(base, positional[1] ?? "src");
	// Relative `@import`s (e.g. the generated pandwind-theme.css) resolve
	// against the CSS entry's directory, not the invocation cwd.
	const cssBase = dirname(cssEntry);

	// Optional DTCG token groups -> @theme bridge. Accepts a bare groups
	// object, `{ tokens }`, or any exported object carrying a `.tokens`
	// field (e.g. a full preset). The first export yielding bridgeable
	// groups wins.
	let themeBlock = "";
	if (tokensModulePath !== undefined) {
		const { pathToFileURL } = await import("node:url");
		const module = await import(pathToFileURL(resolve(base, String(tokensModulePath))).href);
		const groups = resolveTokenGroups(module as Record<string, unknown>);
		const conditions = resolvePresetConditions(module as Record<string, unknown>);
		if (groups === undefined) {
			throw new Error(
				`pandwind tw:codegen: no bridgeable token groups found in ${String(tokensModulePath)} ` +
					"(looked at default export and every named export for a .tokens field or raw DTCG groups)",
			);
		}
		themeBlock = themeBridge.buildBlock(
			groups,
			conditions ? createConditionResolver(conditions) : undefined,
		);
		const themes = resolveThemes(module as Record<string, unknown>);
		const scopeCss = themeBridge.buildScopes(themes);
		if (scopeCss !== "") {
			themeBlock = themeBlock === "" ? scopeCss : `${themeBlock}\n\n${scopeCss}`;
		}
		const components = resolveComponents(module as Record<string, unknown>);
		if (components !== undefined) {
			// L3 component scopes (plans/015): $refs resolve against the vars
			// this same run just bridged into @theme.
			const { flatVars: bridged } = themeBridge.split(groups, conditions);
			const componentCss = themeBridge.buildComponents(
				components,
				new Set(bridged.map((v) => v.name)),
				conditions,
				(message) => console.warn(message),
			);
			if (componentCss !== "") {
				themeBlock = themeBlock === "" ? componentCss : `${themeBlock}\n\n${componentCss}`;
			}
		}
	}

	const css = readFileSync(cssEntry, "utf8");
	const { typesDts, twTs, utilityCount, variantCount } = await generateDesignSystem(css, cssBase, {
		themeBlock,
	});

	let agentsJson: string | undefined;
	if (agentsFlag) {
		// plans/014 §5 — machine-readable capability file for AI agents,
		// derived from the artifacts this run just generated.
		const agentsConfig = extractTwConfig(twTs);
		if (agentsConfig === undefined)
			throw new Error("pandwind tw:codegen: could not extract config for agents.json");
		const doc = buildAgentsDocument({
			typesDts,
			config: agentsConfig,
			themeBlock,
			artifactDir: outDir,
		});
		agentsJson = `${JSON.stringify(doc, null, "\t")}\n`;
	}
	new FileSystemDesignSystemArtifactWriter(writeFileSync, resolve).write(outDir, {
		typesDts,
		twTs,
		...(themeBlock === "" ? {} : { themeBlock }),
		...(agentsJson === undefined ? {} : { agentsJson }),
	});

	console.log(
		`pandwind: generated types.d.ts (${utilityCount} utilities, ${variantCount} variants) and tw.ts from ${cssEntry}${
			themeBlock ? " + pandwind-theme.css (@theme bridge from DTCG tokens)" : ""
		}`,
	);
}
