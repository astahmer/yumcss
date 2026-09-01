// Generated from the workspace-linked pandwind package. Do not edit.
type Values = Set<string | true>;
type UtilityMap = Map<string, Values>;
/**
 * Utilities that accept an opacity modifier (`bg-red-500/50`), detected by
 * compiling a sample candidate through Tailwind's own engine. The value type
 * stays a bounded template-literal union instead of a pre-enumerated
 * color x step product — TS keeps template unions lazy, so this adds
 * completions without the TS2589/TS2590 blowup an explicit cross product
 * would cause.
 */
export declare function detectModifierUtilities(system: {
    candidatesToCss: (candidates: string[]) => (string | null)[];
}, types: UtilityMap): Set<string>;
/**
 * Expand shorthands so equivalent longhand sets compare equal. Exported so
 * the Tailwind-parity tests canonicalize real compiler output with the exact
 * table the generated conflict map was built from.
 */
export declare function canonicalProps(properties: string[]): string[];
/**
 * Build the utility conflict map: utility (dash-case) -> value -> the CSS
 * properties that class sets (canonicalized). `"*"` is the per-utility
 * fallback. Only values whose properties differ from the utility's default
 * are emitted, keeping the generated map small — the overloaded utilities
 * (`text`, `border`, `bg`) are the ones that need per-value entries.
 */
export declare function buildConflicts(system: {
    candidatesToCss: (candidates: string[]) => (string | null)[];
    getClassList: () => Array<[string, unknown]>;
    utilities: {
        keys: (kind: "functional" | "static") => string[];
        getCompletions: (name: string) => unknown[];
    };
}, types: UtilityMap, functionalKeys: string[]): {
    conflicts: Record<string, Record<string, string[]>>;
    compose: string[];
};
export {};
/**
 * Detect the separator a variant uses before its argument by compiling sample
 * candidates with Tailwind's own engine — the source of truth, whatever the
 * variant's internal shape is. `before:` joins with `:`, `group-not:` with
 * `-`, `@3xs:` with `` (nothing).
 *
 * Probes several modifiers per variant because e.g. `group-hover:` is valid
 * while `group-not:` (the first value in the design system) is not.
 */
