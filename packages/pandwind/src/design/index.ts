import { type CreateCssOptions, type CssFn, createCss } from "../css/create-css.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "../css/atoms.ts";
import type { StyleObject } from "../types/typings.ts";
import { resolveDesignStyle } from "./resolve.ts";
import type { DesignPreset, DesignStyleObject } from "./types.ts";

/**
 * The `pandwind/design` entrypoint exposes the intent-oriented CSS factory and
 * its preset-aware style types.
 *
 * Use `pandwind/css` when ordinary CSS property names are the better fit.
 *
 * @category design system
 * @since 0.1.0
 */

type Maybe<T> = T | undefined | null | false;

/**
 * Create the design-system CSS function used by the `pandwind/design` lane.
 *
 * This factory has the same projections as {@link createCss}, but its style
 * object is organized by intent: `$frame` describes the box, `$layout`
 * describes its children, and `$text` describes typography. Raw CSS stays
 * explicit under `$raw` so the top-level vocabulary remains constrained.
 *
 * The preset is required because it supplies both the token names and the
 * conditions used by the design modules. Use `createCss` when you want the
 * ordinary CSS property vocabulary instead.
 *
 * @example A design-vocabulary button
 * ```ts
 * import { createDesignCss } from "pandwind/design";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const dss = createDesignCss(examplePreset);
 *
 * const className = dss.class({
 *   $frame: { corners: "lg", fill: "$blue-500", pad: [8, 16] },
 *   $layout: { flow: "stackX", align: "center", gap: 8 },
 *   $text: { color: "$gray-50", weight: "semibold" },
 *   _hover: { $frame: { fill: "$blue-600" } },
 * });
 * ```
 *
 * @typeParam TPreset - A design-compatible preset carrying tokens and conditions.
 * @param preset - The preset that defines the design token vocabulary.
 * @param options - CSS backend options such as a class-name strategy.
 * @returns A preset-aware {@link CssFn} over {@link DesignStyleObject} values.
 * @see {@link createCss} for ordinary CSS property objects.
 * @category factories
 * @since 0.1.0
 */
export const createDesignCss = <TPreset extends DesignPreset>(
	preset: TPreset,
	options: CreateCssOptions = {},
): CssFn<DesignStyleObject<TPreset>> => {
	const engine = createCss({ ...options, conditions: preset.conditions }) as CssFn<StyleObject>;
	type Design = DesignStyleObject<TPreset>;

	const resolve = (style: Design): StyleObject =>
		resolveDesignStyle(style as unknown as Record<string, unknown>, preset.tokens);

	const dss = (...styles: Array<Maybe<Design>>) =>
		engine(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	dss.class = (...styles: Array<Maybe<Design>>) =>
		engine.class(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	dss.raw = (...styles: Array<Maybe<Design>>) =>
		engine.raw(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	// Dynamic values ride inline custom properties; design-layer tokens are
	// resolved first so the inline value is concrete.
	dss.vars = (...styles: Array<Maybe<Design>>) => {
		const resolvedStyles: StyleObject = {};
		for (const style of styles) {
			if (!style) continue;
			Object.assign(resolvedStyles, resolve(style));
		}
		return engine.vars(resolvedStyles as never);
	};

	dss.props = engine.props;
	dss.input = engine.input;

	dss.group = ((groups: Record<string, Maybe<Design> | ((...args: any[]) => Design)>) => {
		const resolved: Record<string, StyleObject | ((...args: any[]) => StyleObject)> = {};
		for (const key of Object.keys(groups)) {
			const value = groups[key];
			if (typeof value === "function") {
				resolved[key] = (...args: any[]) => resolve(value(...args));
			} else if (value) {
				resolved[key] = resolve(value);
			}
		}
		return engine.group(resolved as never);
	}) as never;

	// Share the inner engine's atom registry so cx can resolve design atoms.
	(dss as CssFn & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY] = (
		engine as CssFn & { [ATOM_REGISTRY]?: AtomRegistry }
	)[ATOM_REGISTRY];

	return dss as CssFn<Design>;
};

export type { DesignPreset, DesignStyleObject } from "./types.ts";
