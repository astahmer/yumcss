/**
 * React Strict DOM's style carrier without importing React Strict DOM.
 *
 * React Strict DOM's web export consumes StyleX-compatible compiled objects
 * through `style`, while its native export consumes React Native style
 * objects. This surface keeps that platform choice explicit and leaves
 * element creation to React Strict DOM itself (`html.*`).
 */
import { assign } from "./lib/utils.ts";
import {
	createDesignObjectCss,
	createObjectCx,
	type ObjectBackend,
	type ObjectCxFn,
} from "./backends/object.ts";
import {
	createReactStrictDomBackend,
	ReactStrictDomPlatform,
	type ReactStrictDomBackendOptions,
	type ReactStrictDomStyle,
} from "./backends/react-strict-dom.ts";
import type { DesignPreset, DesignStyleObject } from "./design/types.ts";
import type { StyleObject } from "./types/typings.ts";

type MaybeStyle<TStyle extends StyleObject> = TStyle | undefined | null | false;
type StyleDefinition<TStyle extends StyleObject> = TStyle | ((...args: any[]) => TStyle);

type CreatedStyles<TDefinitions extends Record<string, StyleDefinition<StyleObject>>> = {
	-readonly [TKey in keyof TDefinitions]: TDefinitions[TKey] extends (
		...args: infer TArgs
	) => StyleObject
		? (...args: TArgs) => ReactStrictDomStyle
		: ReactStrictDomStyle;
};

/** The `css.create`-shaped style compiler used by both RSD platforms. */
export interface ReactStrictDomCssFn<TStyle extends StyleObject = StyleObject> {
	(...styles: Array<MaybeStyle<TStyle>>): ReactStrictDomStyle;
	create<TDefinitions extends Record<string, StyleDefinition<TStyle>>>(
		styles: TDefinitions,
	): CreatedStyles<TDefinitions>;
	raw(...styles: Array<MaybeStyle<TStyle>>): StyleObject;
}

/** Compile raw CSS-property style objects for the selected RSD platform. */
export function createCss(options: ReactStrictDomBackendOptions = {}): ReactStrictDomCssFn {
	const backend = createReactStrictDomBackend(options);
	const compile = (...styles: Array<MaybeStyle<StyleObject>>): ReactStrictDomStyle =>
		backend.resolve(assign(...(styles.filter(Boolean) as StyleObject[])));
	const css = ((...styles: Array<MaybeStyle<StyleObject>>) =>
		compile(...styles)) as ReactStrictDomCssFn;

	css.create = ((definitions: Record<string, StyleDefinition<StyleObject>>) =>
		Object.fromEntries(
			Object.entries(definitions).map(([name, definition]) => [
				name,
				typeof definition === "function"
					? (...args: any[]) => compile(definition(...args))
					: compile(definition),
			]),
		)) as ReactStrictDomCssFn["create"];
	css.raw = (...styles) => assign(...(styles.filter(Boolean) as StyleObject[]));
	return css;
}

/** Typed Pandwind design-vocabulary surface for RSD's `style` prop. */
export interface ReactStrictDomDesignCssFn<TPreset extends DesignPreset> {
	(...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>): ReactStrictDomStyle;
	raw(...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>): StyleObject;
}

export function createDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: ReactStrictDomBackendOptions = {},
): ReactStrictDomDesignCssFn<TPreset> {
	const backend = createReactStrictDomBackend(options) as ObjectBackend;
	return createDesignObjectCss(preset, backend) as ReactStrictDomDesignCssFn<TPreset>;
}

/** Merge already compiled RSD style objects with platform-native semantics. */
export function createCx(options: ReactStrictDomBackendOptions = {}): ObjectCxFn {
	return createObjectCx(createReactStrictDomBackend(options) as ObjectBackend);
}

export {
	createReactStrictDomBackend,
	ReactStrictDomPlatform,
} from "./backends/react-strict-dom.ts";
export type {
	ReactStrictDomBackend,
	ReactStrictDomBackendOptions,
	ReactStrictDomCompiledStyle,
	ReactStrictDomNativeBackendOptions,
	ReactStrictDomPlatform as ReactStrictDomPlatformType,
	ReactStrictDomStyle,
	ReactStrictDomWebBackendOptions,
} from "./backends/react-strict-dom.ts";
