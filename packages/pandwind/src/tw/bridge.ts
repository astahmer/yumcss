/**
 * Utility bridge — the inverted Tailwind design system.
 *
 * `tw()` emits literal utilities by construction. For `css()` to emit the
 * *same* class for the same intent, the engine needs the reverse lookup:
 * `(canonical CSS property, resolved value) -> utility class`. This module
 * generates that map from the real Tailwind compiler — every candidate in
 * `getClassList()` is compiled, its declarations resolved against the
 * entry's `@theme`, canonicalized, and indexed by property and value.
 *
 * Candidates that only set Tailwind's internal `--tw-*` custom properties
 * (ring colors, shadow colors, transforms), that target children or
 * pseudo-elements (`space-x-*`, `divide-x`, `placeholder-*`), or whose
 * values stay runtime-dependent (`var(--tw-*)` without a theme value) are
 * skipped — they can't stand in for the element's own declaration. When
 * more than one utility sets the same (property, value), the one whose
 * canonical property set is a single property wins (`w-4` over `size-4`),
 * then the shorter name (`text-blue-500` over `placeholder-blue-500`).
 * Multi-property utilities are only used when nothing else exists (`text-sm`
 * sets font-size + line-height).
 */
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { parse } from "postcss";
import type { Rule } from "postcss";
import selectorParser from "postcss-selector-parser";
import { canonicalProps } from "./generate-types.ts";
import { resolveVar, simplifyCalc } from "./theme.ts";

/** `property -> resolved value -> utility class`. */
export type { UtilityBridge } from "./bridge-generator.ts";
export { BRIDGE_PROPS } from "./bridge-generator.ts";
import { UtilityBridgeGenerator } from "./bridge-generator.ts";

export async function generateUtilityBridge(
	entry: string,
	base: string,
	options: { props?: readonly string[]; values?: ReadonlySet<string> } = {},
): Promise<import("./bridge-generator.ts").UtilityBridge> {
	return new UtilityBridgeGenerator().generate(entry, base, options);
}
