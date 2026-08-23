/**
 * Named-atoms class-name strategy — the second consumer of the
 * `ClassNameStrategy` contract, proving "same `css()` API, swappable
 * output" beyond the tailwind adapter.
 *
 * Where the default mode hashes `(key, value)` into opaque classes
 * (`k2x9f1a`) and the tailwind adapter maps declarations onto literal
 * Tailwind utilities, the named-atoms mode emits **readable** class names
 * derived from the declaration itself:
 *
 *   css({ color: "$blue-500" })        -> "pw-color-$blue-500"
 *   css({ _hover: { color: "red" } })  -> "pw-_hover-color-red"
 *
 * Unlike the tailwind adapter this strategy IS sheet-backed
 * (`sheetBacked: true`): pandwind's own generated stylesheet compiles the
 * emitted classes, so `cx()` merging and the atom registry keep working
 * exactly like the default mode — only the class spelling changes. Use it
 * when debuggable markup matters more than minimal bytes.
 *
 * Key canonicalization: condition paths arrive as `__`-joined flattened
 * keys whose part order follows the written nesting
 * (`_hover__color` vs `color___hover`). The stylesheet generator
 * canonicalizes by sorting the parts; this strategy applies the same sort
 * so both sides derive byte-identical names independently.
 */
import { pairs } from "../lib/utils.ts";
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import { escapeIdentifier } from "./hash.ts";

export const createNamedAtomsStrategy = (prefix = "pw"): ClassNameStrategy => {
	return {
		name: "named-atoms",
		sheetBacked: true,
		toClassName(key, value) {
			const canonicalKey = pairs.join(pairs.split(key).toSorted());
			return escapeIdentifier(`${prefix}-${canonicalKey}-${value}`);
		},
	};
};
