import { camelCaseProperty } from "./camelcase-property.ts";
import { UTILITY_SUBKEYS } from "yumcss/tw/compile";

type Values = Set<string | true>;
export type UtilityMap = Map<string, Values>;
const dashCase = (name: string): string =>
	name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

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

export function getFunctionalTypes(system: {
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

export function longestFunctionalPrefix(
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

export class TailwindUtilityCatalog {
	collect(system: Parameters<typeof getFunctionalTypes>[0]): UtilityMap {
		const functional = getFunctionalTypes(system);
		const functionalKeys = system.utilities.keys("functional");
		mergeStaticUtilities(system, functionalKeys, functional);
		return functional;
	}

	expand(types: UtilityMap, conflicts: Record<string, Record<string, string[]>>): void {
		expandSubkeys(types, conflicts);
	}
}
