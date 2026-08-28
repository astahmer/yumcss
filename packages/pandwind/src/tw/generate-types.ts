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

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { CodegenArtifactWriter } from "./codegen-writer.ts";
import { camelCaseProperty } from "./camelcase-property.ts";
import { TailwindTypeEmitter, utilityKey as emittedUtilityKey } from "./codegen-emitter.ts";
import { longestFunctionalPrefix, TailwindUtilityCatalog } from "./codegen-catalog.ts";
import { UTILITY_SUBKEYS } from "./compile.ts";
import {
	buildThemeBlock,
	buildComponentScopes,
	buildThemeScopes,
	createConditionResolver,
	splitTokens,
	type ThemeConditions,
	themeVarsFromTokens,
	type ThemeScopeMap,
	type ThemeTokenGroups,
} from "./generate-theme.ts";

type Values = Set<string | true>;
type UtilityMap = Map<string, Values>;

/**
 * Static utilities that don't map to a functional utility key and whose names
 * have more than one meaningful segment (`pointer-events-none`, `grid-flow-col`).
 * The first segment heuristic would produce `pointer?: "events-none"`, which is
 * worse than a curated, stable prefix.
 */
// Utility catalog construction lives in codegen-catalog.ts.
/** camelCase -> dash-case, matching the runtime's class rendering. */
function dashCase(name: string): string {
	return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

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
}

/**
 * Generate the two artifact files for a CSS entry. Exported so tests and
 * tooling can reuse it without writing to disk.
 */
export async function generateDesignSystem(
	css: string,
	base: string,
	options: GenerateDesignSystemOptions = {},
): Promise<{
	typesDts: string;
	twTs: string;
	utilityCount: number;
	variantCount: number;
}> {
	const effectiveCss = options.themeBlock ? `${css}\n${options.themeBlock}` : css;
	const system = await __unstable__loadDesignSystem(effectiveCss, { base });

	const catalog = new TailwindUtilityCatalog();
	const functionalKeys = system.utilities.keys("functional");
	const types = catalog.collect(system);
	const { conflicts, compose } = buildConflicts(system, types, functionalKeys);
	// Sub-keys need the conflict map's per-value properties; modifier
	// detection must see them so `textColor` inherits opacity modifiers.
	catalog.expand(types, conflicts);
	const modifierCapable = detectModifierUtilities(system, types);

	const variants: Array<{ name: string; join: ":" | "-" | "" }> = [];
	for (const variant of system.getVariants()) {
		variants.push({
			name: variant.name,
			join: detectVariantJoin(system, variant),
		});
	}

	const utilityKeyNames = new Set(
		[...types.keys()].map((name) => emittedUtilityKey(name, camelCaseProperty).replace(/^"|"$/g, "")),
	);
	const emitter = new TailwindTypeEmitter(camelCaseProperty);

	return {
		typesDts: `${header}
${emitter.utilities(types, modifierCapable)}

${emitter.variants(variants, utilityKeyNames)}
`,
		twTs: emitter.runtime(variants, conflicts, compose),
		utilityCount: types.size,
		variantCount: variants.length,
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
		themeBlock = buildThemeBlock(
			groups,
			conditions ? createConditionResolver(conditions) : undefined,
		);
		const themes = resolveThemes(module as Record<string, unknown>);
		const scopeCss = buildThemeScopes(themes);
		if (scopeCss !== "") {
			themeBlock = themeBlock === "" ? scopeCss : `${themeBlock}\n\n${scopeCss}`;
		}
		const components = resolveComponents(module as Record<string, unknown>);
		if (components !== undefined) {
			// L3 component scopes (plans/015): $refs resolve against the vars
			// this same run just bridged into @theme.
			const { flatVars: bridged } = splitTokens(
				groups,
				conditions ? createConditionResolver(conditions) : undefined,
			);
			const componentCss = buildComponentScopes(
				components,
				new Set(bridged.map((v) => v.name)),
				conditions ? createConditionResolver(conditions) : undefined,
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

	new CodegenArtifactWriter().write(
		{ typesDts, twTs, themeBlock, utilityCount, variantCount },
		{ outDir, agents: agentsFlag },
	);

	console.log(
		`pandwind: generated types.d.ts (${utilityCount} utilities, ${variantCount} variants) and tw.ts from ${cssEntry}${
			themeBlock ? " + pandwind-theme.css (@theme bridge from DTCG tokens)" : ""
		}`,
	);
}
