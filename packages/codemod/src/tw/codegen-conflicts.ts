import { UTILITY_SUBKEYS } from "yumcss/tw/compile";
import { twMerge } from "tailwind-merge";
import { longestFunctionalPrefix } from "./codegen-catalog.ts";
import { resolveVar, simplifyCalc } from "yumcss/tw";

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
export function detectModifierUtilities(
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
interface CssWalk {
	props: Set<string>;
	values: Map<string, string>;
}

function walkCss(css: string | null): CssWalk {
	const walk: CssWalk = { props: new Set(), values: new Map() };
	if (css === null) return walk;
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
			const prop = declaration[1]!;
			walk.props.add(prop);
			i += declaration[0].length;
			// Capture the declaration value for the raw-value -> token
			// reverse catalog: everything up to the terminating `;` or
			// closing `}` (strings, comments and parens already handled
			// above; custom properties were skipped before this branch).
			const end = findValueEnd(css, i);
			const value = css.slice(i, end).trim();
			if (value !== "" && !walk.values.has(prop)) walk.values.set(prop, value);
			i = end;
			continue;
		}
		i += 1;
	}
	return walk;
}

function findValueEnd(css: string, from: number): number {
	let i = from;
	let depth = 0;
	while (i < css.length) {
		const char = css[i]!;
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
		if (char === "(") {
			depth += 1;
		} else if (char === ")") {
			depth = Math.max(0, depth - 1);
		} else if (depth === 0 && (char === ";" || char === "}")) {
			return i;
		}
		i += 1;
	}
	return i;
}

function cssProperties(css: string | null): string[] {
	return [...walkCss(css).props].toSorted();
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
 * Tailwind's ring layers all serialize through `box-shadow`, but they are
 * independent composition slots: `shadow`, `ring`, and `inset-ring` can
 * coexist. Keep the ring slots distinct in the generated conflict map so
 * runtime merging does not erase one layer when another is added.
 */
function conflictProps(utility: string, css: string | null): string[] {
	const properties = canonicalProps(cssProperties(css));
	if (utility === "ring") {
		return properties.map((property) => (property === "box-shadow" ? "ring-shadow" : property));
	}
	if (utility === "inset-ring") {
		return properties.map((property) =>
			property === "box-shadow" ? "inset-ring-shadow" : property,
		);
	}
	return properties;
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

const directionalGroupKey = (properties: readonly string[]): string =>
	properties.toSorted().join(",");

interface DirectionalCandidate {
	candidate: string;
	properties: string[];
}

const buildDirectionalConflicts = (
	system: { candidatesToCss: (candidates: string[]) => (string | null)[] },
	classList: Array<[string, unknown]>,
	functionalKeys: string[],
	conflicts: Record<string, Record<string, string[]>>,
): { kills: Record<string, readonly string[]> } | undefined => {
	const candidates: DirectionalCandidate[] = [];
	const utilityKeys = [...new Set([...functionalKeys, ...Object.keys(conflicts)])].toSorted(
		(a, b) => b.length - a.length,
	);
	for (const batch of chunk(
		classList.flatMap(([candidate]) => {
			const utility = utilityKeys.find(
				(key) =>
					conflicts[key] !== undefined && (candidate === key || candidate.startsWith(`${key}-`)),
			);
			if (utility === undefined) return [];
			return [{ candidate, utility }];
		}),
		300,
	)) {
		const results = system.candidatesToCss(batch.map(({ candidate }) => candidate));
		batch.forEach(({ candidate, utility }, index) => {
			const css = results[index];
			if (css === null || css === undefined) return;
			let properties = conflictProps(dashCase(utility), css);
			if (
				utility === "text" &&
				properties.includes("font-size") &&
				properties.includes("line-height")
			) {
				properties = ["font-size"];
			}
			if (properties.length > 0) candidates.push({ candidate, properties });
		});
	}

	const sampleByGroup = new Map<string, string>();
	for (const { candidate, properties } of candidates) {
		const key = directionalGroupKey(properties);
		if (!sampleByGroup.has(key)) sampleByGroup.set(key, candidate);
	}
	const groups = [...sampleByGroup.entries()];
	const kills = new Map<string, Set<string>>();
	for (const [newKey, newCandidate] of groups) {
		const newProperties = new Set(newKey.split(","));
		for (const [oldKey, oldCandidate] of groups) {
			if (newKey === oldKey || oldKey.split(",").some((property) => newProperties.has(property))) {
				continue;
			}
			const merged = twMerge(`${oldCandidate} ${newCandidate}`).split(/\s+/);
			if (!merged.includes(oldCandidate) && merged.includes(newCandidate)) {
				const targets = kills.get(newKey) ?? new Set<string>();
				targets.add(oldKey);
				kills.set(newKey, targets);
			}
		}
	}
	if (kills.size === 0) return undefined;
	return {
		kills: Object.fromEntries(
			[...kills]
				.toSorted(([a], [b]) => a.localeCompare(b, "en"))
				.map(([source, targets]) => [source, [...targets].toSorted()]),
		),
	};
};

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
export function buildConflicts(
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
	/**
	 * Per-utility value sets for utilities whose conflict entries collapsed
	 * to the `"*"` wildcard (all known values share one property shape).
	 * The map alone cannot distinguish a real theme value from a typo for
	 * these; this catalog carries the real design-system values so strict
	 * candidate verification stays exact-match.
	 */
	wildcardValues?: Record<string, ReadonlySet<string>>;
	/**
	 * Reverse catalog: class prefix -> resolved raw CSS value -> the token
	 * spelling whose compiled declaration value is an exact match. Built by
	 * probing every class-list candidate and resolving its declaration
	 * values through the design system's own theme resolver. Values that
	 * still contain `var(` after resolution, and values claimed by more
	 * than one token (ambiguous), are omitted — remapping must be provable,
	 * never plausible. Empty utilities are omitted from the map.
	 */
	valueTokens?: Record<string, Readonly<Record<string, string>>>;
	/**
	 * Directional group relationships that the CSS-property map cannot model.
	 * Keys and values are canonical property-group keys; the codegen probe is
	 * backed by the installed tailwind-merge contract.
	 */
	directionalConflicts?: { kills: Record<string, readonly string[]> };
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
	const themeValues = new Map<string, string>();
	const resolveTheme = (system as { resolveThemeValue?: (name: string) => string | undefined })
		.resolveThemeValue;
	const resolveValue = (value: string): string => {
		if (resolveTheme === undefined) return value;
		const memo = themeValues.get(value);
		if (memo !== undefined) return memo;
		const resolved = simplifyCalc(resolveVar(value, resolveTheme));
		themeValues.set(value, resolved);
		return resolved;
	};
	for (const batch of chunk(probes, 300)) {
		const results = system.candidatesToCss(batch.map((probe) => probe.candidate));
		batch.forEach((probe, index) => {
			const result = results[index];
			if (result === undefined || result === null) return;
			const props = conflictProps(dashCase(probe.utility), result);
			const samples = sampleProps.get(probe.utility) ?? [];
			samples.push({ value: probe.value, props });
			sampleProps.set(probe.utility, samples);
		});
	}

	// Raw-value reverse catalog: probe class-list candidates that belong to
	// the typed utilities and record their resolved declaration values. A
	// utility prefix claims a raw value only once (ambiguity omitted) and
	// only when resolution removed every `var(` reference.
	const rawValueByPrefix = new Map<string, Map<string, string>>();
	if (resolveTheme !== undefined) {
		const typedPrefixes = new Set<string>();
		for (const name of types.keys()) {
			if (functional.has(name)) typedPrefixes.add(dashCase(name));
		}
		const classCandidates: Array<{ candidate: string; prefix: string; suffix: string }> = [];
		for (const [candidate] of classList) {
			const best = longestFunctionalPrefix(candidate, functionalKeys);
			if (best === undefined || !typedPrefixes.has(dashCase(best))) continue;
			const value = candidate === best ? "" : candidate.slice(best.length + 1);
			if (value === "" || value.includes("[")) continue;
			classCandidates.push({ candidate, prefix: dashCase(best), suffix: value });
		}
		for (const batch of chunk(classCandidates, 200)) {
			const results = system.candidatesToCss(batch.map((probe) => probe.candidate));
			batch.forEach((probe, index) => {
				const css = results[index];
				if (css === null || css === undefined) return;
				const { values } = walkCss(css);
				for (const declaration of values.values()) {
					const resolved = resolveValue(declaration);
					if (resolved === "" || resolved.includes("var(")) continue;
					const byValue = rawValueByPrefix.get(probe.prefix) ?? new Map<string, string>();
					if (byValue.has(resolved)) {
						if (byValue.get(resolved) !== probe.candidate) byValue.set(resolved, "");
					} else {
						byValue.set(resolved, probe.suffix);
					}
					rawValueByPrefix.set(probe.prefix, byValue);
				}
			});
		}
	}
	const valueTokens: Record<string, Readonly<Record<string, string>>> = {};
	for (const [prefix, byValue] of rawValueByPrefix) {
		const catalog: Record<string, string> = {};
		for (const [resolved, candidate] of byValue) {
			if (candidate === "") continue;
			catalog[resolved] = candidate;
		}
		if (Object.keys(catalog).length > 0) valueTokens[prefix] = catalog;
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
	const wildcardValues: Record<string, ReadonlySet<string>> = {};
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
		const utility = dashCase(name);
		conflicts[utility] = { "*": defaultProps, ...overrides };
		// Values hidden by the wildcard (props equal the utility default) are
		// invisible to exact conflict-map matching, so they are recorded in a
		// per-utility real value set for strict candidate verification.
		const knownValues = types.get(name);
		if (knownValues) {
			const hidden = new Set<string>();
			for (const value of knownValues) {
				if (typeof value !== "string" || value === "") continue;
				if (overrides[value] !== undefined) continue;
				hidden.add(value);
			}
			if (hidden.size > 0) wildcardValues[utility] = hidden;
		}
	}
	return {
		conflicts,
		compose: [...COMPOSE_KEYS].filter((key) => conflicts[key] !== undefined),
		wildcardValues,
		valueTokens,
		directionalConflicts: buildDirectionalConflicts(system, classList, functionalKeys, conflicts),
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
