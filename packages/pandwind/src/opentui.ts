/**
 * `pandwind/opentui` — the design vocabulary lowered to OpenTUI style
 * plain objects (plans/021). Runtime-only: no build integration, no
 * opentui imports (plain structurally-typed objects).
 *
 * ```ts
 * import { createDesignCss, createCx } from "pandwind/opentui";
 * import { examplePreset } from "./pandwind.preset.ts";
 *
 * const dss = createDesignCss(examplePreset, { isDark: () => scheme === "dark" });
 * const cx = createCx();
 *
 * const styles = {
 *   panel: dss({
 *     $frame: { fill: "$surface", corners: "lg", pad: [1, 2] },
 *     _dark: { $frame: { fill: "$surface-dark" } },
 *   }),
 * };
 * // <box style={styles.panel}>…</box>
 * ```
 *
 * Lengths quantize to terminal cells (`round(px / cellSize)`, cellSize
 * defaults to 4 — plan 021's declared-with-default policy; pass
 * `createDesignCss(preset, { cellSize: 8 })` to override). Hex colors are
 * attested OpenTUI inputs and pass through unchanged. `_dark` participates
 * when the resolver returns true (re-resolve on scheme change); any other
 * condition throws. Identical styles resolve to the same reference, so
 * memoization sees stable identity.
 */
import type { DesignPreset, DesignStyleObject } from "./design/types.ts";
import { createDesignObjectCss, createObjectCx, type ObjectCxFn } from "./backends/object.ts";
import { createOpentuiBackend, type OpentuiBackendOptions } from "./backends/opentui.ts";

/** An OpenTUI style object: camelCase props, unitless cell counts. */
export type OpentuiStyle = Record<string, unknown>;

export interface OpentuiCssFn<TPreset extends DesignPreset> {
	(...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>): OpentuiStyle;
	raw: (...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>) => OpentuiStyle;
}

export function createDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: OpentuiBackendOptions = {},
): OpentuiCssFn<TPreset> {
	const backend = createOpentuiBackend(options);
	return createDesignObjectCss(preset, backend) as OpentuiCssFn<TPreset>;
}

/** Last-wins merge of OpenTUI style objects (registered, stable identity). */
export function createCx(): ObjectCxFn {
	return createObjectCx(createOpentuiBackend());
}

export { createOpentuiBackend } from "./backends/opentui.ts";
export { createObjectCss, createObjectCx } from "./backends/object.ts";
export type { ObjectCssFn, ObjectCxFn, ObjectBackend, TargetStyle } from "./backends/object.ts";
