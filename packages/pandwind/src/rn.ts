/**
 * `pandwind/react-native` — the design vocabulary lowered to React Native
 * style objects (plans/021). Runtime-only: no Metro/babel integration, no
 * react-native imports (plain structurally-typed objects).
 *
 * ```ts
 * import { createDesignCss, createCx } from "pandwind/react-native";
 * import { examplePreset } from "./pandwind.preset.ts";
 *
 * const dcss = createDesignCss(examplePreset, { isDark: () => scheme === "dark" });
 * const cx = createCx();
 *
 * const styles = {
 *   card: css({
 *     $frame: { fill: "$surface", corners: "lg", pad: [4, 8] },
 *     _dark: { $frame: { fill: "$surface-dark" } },
 *   }),
 * };
 * // <View style={styles.card} />
 * ```
 *
 * `css()` returns a registered style object — identical styles resolve to
 * the same reference, so list rendering and memoization see stable
 * identity. `_dark` participates when the `isDark` resolver returns true
 * (re-render on scheme change re-resolves); any other condition throws.
 */
import type { DesignPreset, DesignStyleObject } from "./design/types.ts";
import { createDesignObjectCss, createObjectCx, type ObjectCxFn } from "./backends/object.ts";
import { createRnBackend, type RnBackendOptions } from "./backends/react-native.ts";

/** A React Native style object: RN prop names, unitless numeric lengths. */
export type RnStyle = Record<string, unknown>;

export interface RnCssFn<TPreset extends DesignPreset> {
	(...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>): RnStyle;
	raw: (...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>) => RnStyle;
}

export function createDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: RnBackendOptions = {},
): RnCssFn<TPreset> {
	const backend = createRnBackend(options);
	return createDesignObjectCss(preset, backend) as unknown as RnCssFn<TPreset>;
}

/** Last-wins merge of RN style objects (registered, stable identity). */
export function createCx(): ObjectCxFn {
	return createObjectCx(createRnBackend());
}

export { createRnBackend } from "./backends/react-native.ts";
export { createObjectCss, createObjectCx } from "./backends/object.ts";
export type { ObjectCssFn, ObjectCxFn, ObjectBackend, TargetStyle } from "./backends/object.ts";
