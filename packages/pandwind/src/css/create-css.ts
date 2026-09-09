import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
	TypedStyleObject,
} from "../types/typings.ts";
import {
	createCssRuntime,
	type CompiledStyles,
	type CreateCssOptions,
	type AnyInput,
	type DynamicFn,
	type DynamicReturn,
	type DynamicStyles,
} from "./runtime-base.ts";
import { attachClass } from "./runtime-method-class.ts";
import { attachGroup } from "./runtime-method-group.ts";
import { attachInput } from "./runtime-method-input.ts";
import { attachProps } from "./runtime-method-props.ts";
import { attachRaw } from "./runtime-method-raw.ts";
import { attachVars } from "./runtime-method-vars.ts";
import type { ClassNameStrategy } from "./class-name-strategy.ts";
import type { VarsOutput } from "./var-compiler.ts";

export type { ClassNameStrategy };
export type { CreateCssOptions } from "./runtime-base.ts";

type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

const ALL_RUNTIME_METHODS = [
	attachVars,
	attachClass,
	attachRaw,
	attachProps,
	attachGroup,
	attachInput,
] as const;

/**
 * Create the typed CSS function used by the public `css()` lane.
 *
 * A preset supplies the token and condition vocabulary; the returned callable
 * compiles style objects to declaration maps and exposes the attached
 * projections documented by `CssFn`. Bundler integrations may replace this
 * full runtime with a statically lowered callable or a smaller attachment set
 * without changing the source-level type surface.
 */
export function createCss<TPreset extends TypedPreset>(
	preset: TPreset,
	options?: CreateCssOptions,
): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export function createCss(options?: CreateCssOptions): CssFn<StyleObject>;
export function createCss<
	TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>,
>(
	options?: CreateCssOptions,
): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export function createCss(
	presetOrOptions: CreateCssOptions | TypedPreset = {},
	options: CreateCssOptions = {},
): CssFn<StyleObject> {
	return createCssRuntime(
		presetOrOptions,
		options,
		ALL_RUNTIME_METHODS,
	) as unknown as CssFn<StyleObject>;
}

interface PropsReturn {
	style: Record<string, string> | undefined;
	className: string | undefined;
	[key: string]: unknown;
}

type PropsInput =
	| CompiledStyles
	| DynamicReturn
	| VarsOutput
	| string
	| readonly PropsInput[]
	| false
	| null
	| undefined;

/**
 * The complete source-level contract for `createCss`.
 *
 * The callable form is the low-level declaration-map result. The named
 * methods are explicit projections for class strings, dynamic values, host
 * props, reusable groups, and raw style objects; keeping them on one typed
 * value lets compiler and runtime implementations share the same API.
 */
export interface CssFn<TStyles extends StyleObject = StyleObject> {
	/** Compile style objects to the atomic declaration map consumed by the CSS engine. */
	(...styles: Array<TStyles>): CompiledStyles;
	/** Compile style objects and return their atom classes as one class string. */
	class: (...styles: Array<TStyles>) => string;
	/** Encode style declarations as classes plus inline custom properties for dynamic values. */
	vars: (...styles: Array<TStyles>) => VarsOutput;
	/** Merge style objects without compiling them, for stylesheet and bridge consumers. */
	raw: (...styles: Array<TStyles>) => StyleObject;
	/** Normalize compiled styles, variable carriers, and class strings into host props. */
	props: (...styles: Array<PropsInput>) => PropsReturn;
	/** Build a reusable map of static, dynamic, string, or parameterized style groups. */
	group: <
		TGroup extends Record<
			string,
			TStyles | DynamicStyles<TStyles> | string | ((...args: any[]) => TStyles)
		>,
	>(
		styles: TGroup,
	) => {
		[Key in keyof TGroup]: TGroup[Key] extends { $input: infer TInput }
			? TInput extends AnyInput
				? DynamicFn<TInput>
				: never
			: TGroup[Key] extends (...args: infer TArgs) => TStyles
				? (...args: TArgs) => VarsOutput
				: TGroup[Key] extends string
					? string
					: CompiledStyles;
	};
	/** Mark a named runtime input for a dynamic `group` definition. */
	input: (name: string) => never;
}

/**
 * The style-object type accepted by a `createCss` instance's `class` method.
 *
 * Pass a `CssFn` instance to retain its preset-specific token and condition
 * types; omit the type argument for the open-ended `createCss()` form.
 */
export type AtomicStyleProps<
	TCss extends Pick<CssFn<never>, "class"> = Pick<CssFn<StyleObject>, "class">,
> = Parameters<TCss["class"]>[0];
