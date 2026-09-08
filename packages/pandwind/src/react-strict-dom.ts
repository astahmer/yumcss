/**
 * React Strict DOM's style carrier without importing React Strict DOM.
 *
 * React Strict DOM's web export consumes StyleX-compatible compiled objects
 * through `style`, while its native export consumes React Native style
 * objects. This surface keeps that platform choice explicit and leaves
 * element creation to React Strict DOM itself (`html.*`).
 */
import { assign } from "./lib/utils.ts";
import { createDesignObjectCss, createObjectCx, type ObjectBackend } from "./backends/object.ts";
import {
	createReactStrictDomBackend,
	ReactStrictDomPlatform,
	type ReactStrictDomBackendOptions,
	type ReactStrictDomNativeBackendOptions,
	type ReactStrictDomStyleFor,
	type ReactStrictDomWebBackendOptions,
	type ReactStrictDomStyle,
} from "./backends/react-strict-dom.ts";
import type { DesignPreset, DesignStyleObject } from "./design/types.ts";
import type { StyleObject } from "./types/typings.ts";

type MaybeStyle<TStyle extends StyleObject> = TStyle | undefined | null | false;
type StyleDefinition<TStyle extends StyleObject> = TStyle | ((...args: any[]) => TStyle);

type CreatedStyles<
	TDefinitions extends Record<string, StyleDefinition<StyleObject>>,
	TPlatform extends ReactStrictDomPlatform,
> = {
	-readonly [TKey in keyof TDefinitions]: TDefinitions[TKey] extends (
		...args: infer TArgs
	) => StyleObject
		? (...args: TArgs) => ReactStrictDomStyleFor<TPlatform>
		: ReactStrictDomStyleFor<TPlatform>;
};

/** The `css.create`-shaped style compiler used by both RSD platforms. */
export interface ReactStrictDomCssFn<
	TStyle extends StyleObject = StyleObject,
	TPlatform extends ReactStrictDomPlatform = typeof ReactStrictDomPlatform.Web,
> {
	(...styles: Array<MaybeStyle<TStyle>>): ReactStrictDomStyleFor<TPlatform>;
	create<TDefinitions extends Record<string, StyleDefinition<TStyle>>>(
		styles: TDefinitions,
	): CreatedStyles<TDefinitions, TPlatform>;
	raw(...styles: Array<MaybeStyle<TStyle>>): StyleObject;
}

/** Compile raw CSS-property style objects for the selected RSD platform. */
export function createCss(
	options: ReactStrictDomNativeBackendOptions,
): ReactStrictDomCssFn<StyleObject, typeof ReactStrictDomPlatform.Native>;
export function createCss(
	options?: ReactStrictDomWebBackendOptions,
): ReactStrictDomCssFn<StyleObject, typeof ReactStrictDomPlatform.Web>;
export function createCss(
	options: ReactStrictDomBackendOptions = {},
): ReactStrictDomCssFn<StyleObject, ReactStrictDomPlatform> {
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
export interface ReactStrictDomDesignCssFn<
	TPreset extends DesignPreset,
	TPlatform extends ReactStrictDomPlatform = typeof ReactStrictDomPlatform.Web,
> {
	(
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): ReactStrictDomStyleFor<TPlatform>;
	raw(...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>): StyleObject;
}

export function createDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: ReactStrictDomNativeBackendOptions,
): ReactStrictDomDesignCssFn<TPreset, typeof ReactStrictDomPlatform.Native>;
export function createDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options?: ReactStrictDomWebBackendOptions,
): ReactStrictDomDesignCssFn<TPreset, typeof ReactStrictDomPlatform.Web>;
export function createDesignCss<TPreset extends DesignPreset>(
	preset: TPreset,
	options: ReactStrictDomBackendOptions = {},
): ReactStrictDomDesignCssFn<TPreset, ReactStrictDomPlatform> {
	const backend = createReactStrictDomBackend(
		options.platform === ReactStrictDomPlatform.Native
			? options
			: { ...options, conditions: options.conditions ?? preset.conditions },
	) as ObjectBackend;
	return createDesignObjectCss(preset, backend) as ReactStrictDomDesignCssFn<TPreset>;
}

/** Merge already compiled RSD style objects with platform-native semantics. */
export interface ReactStrictDomCxFn<
	TPlatform extends ReactStrictDomPlatform = typeof ReactStrictDomPlatform.Web,
> {
	(
		...inputs: Array<
			| ReactStrictDomStyleFor<TPlatform>
			| undefined
			| null
			| false
			| Array<ReactStrictDomStyleFor<TPlatform> | undefined | null | false>
		>
	): ReactStrictDomStyleFor<TPlatform>;
}

export function createCx(
	options: ReactStrictDomNativeBackendOptions,
): ReactStrictDomCxFn<typeof ReactStrictDomPlatform.Native>;
export function createCx(
	options?: ReactStrictDomWebBackendOptions,
): ReactStrictDomCxFn<typeof ReactStrictDomPlatform.Web>;
export function createCx(
	options: ReactStrictDomBackendOptions = {},
): ReactStrictDomCxFn<ReactStrictDomPlatform> {
	return createObjectCx(
		createReactStrictDomBackend(options) as ObjectBackend,
	) as ReactStrictDomCxFn;
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
	ReactStrictDomNativeStyle,
	ReactStrictDomPlatform as ReactStrictDomPlatformType,
	ReactStrictDomStyle,
	ReactStrictDomStyleFor,
	ReactStrictDomWebBackendOptions,
} from "./backends/react-strict-dom.ts";
