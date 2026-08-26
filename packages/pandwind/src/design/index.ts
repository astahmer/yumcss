import { type CreateCssOptions, type CssFn, createCss } from "../css/create-css.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "../css/atoms.ts";
import type { StyleObject } from "../types/typings.ts";
import { resolveDesignStyle } from "./resolve.ts";
import type { DesignPreset, DesignStyleObject } from "./types.ts";

/* ---------------------------------------------------------------------------
 * createDesignCss — the Figma-inspector surface on top of the atomic engine.
 *
 * Same `css()` shape as the engine (`css(...)`, `.class`, `.raw`, `.props`,
 * `.group`, `.input`), but the style object is the design vocabulary:
 * `$frame` / `$layout` / `$text` modules with ~30 Figma-style props, typed
 * against the preset tokens. Raw CSS props only under `$raw`.
 *
 * ```ts
 * const dcss = createDesignCss(examplePreset);
 *
 * dcss.class({
 *   $frame: { w: "20", corners: "lg", fill: "$blue-500", pad: [4, 8] },
 *   $layout: { flow: "stackY", gap: "16", align: "center" },
 *   $text: { size: "20", weight: "600", color: "$red-300" },
 *   _hover: { $text: { color: "$red-400" } },
 * });
 * ```
 * -------------------------------------------------------------------------*/

type Maybe<T> = T | undefined | null | false;

export const createDesignCss = <TPreset extends DesignPreset>(
	preset: TPreset,
	options: CreateCssOptions = {},
): CssFn<DesignStyleObject<TPreset>> => {
	const engine = createCss(options) as CssFn<StyleObject>;
	type Design = DesignStyleObject<TPreset>;

	const resolve = (style: Design): StyleObject =>
		resolveDesignStyle(style as unknown as Record<string, unknown>, preset.tokens);

	const css = (...styles: Array<Maybe<Design>>) =>
		engine(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	css.class = (...styles: Array<Maybe<Design>>) =>
		engine.class(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	css.raw = (...styles: Array<Maybe<Design>>) =>
		engine.raw(...(styles.filter(Boolean) as Array<Design>).map(resolve));

	// Dynamic values ride inline custom properties; design-layer tokens are
	// resolved first so the inline value is concrete.
	css.vars = (...styles: Array<Maybe<Design>>) => {
		const resolvedStyles: StyleObject = {};
		for (const style of styles) {
			if (!style) continue;
			Object.assign(resolvedStyles, resolve(style));
		}
		return engine.vars(resolvedStyles as never);
	};

	css.props = engine.props;
	css.input = engine.input;

	css.group = (groups: Record<string, Maybe<Design>>) => {
		const resolved: Record<string, StyleObject> = {};
		for (const key of Object.keys(groups)) {
			const value = groups[key] as Maybe<Design>;
			if (value) resolved[key] = resolve(value);
		}
		return engine.group(resolved as never);
	};

	// Share the inner engine's atom registry so cx can resolve design atoms.
	(css as CssFn & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY] = (
		engine as CssFn & { [ATOM_REGISTRY]?: AtomRegistry }
	)[ATOM_REGISTRY];

	return css as CssFn<Design>;
};

export type { DesignPreset, DesignStyleObject } from "./types.ts";
