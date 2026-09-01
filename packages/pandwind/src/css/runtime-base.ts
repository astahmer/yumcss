import { assign, type FlatStyles, flattenStyle } from "../lib/utils.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
	TypedStyleObject,
} from "../types/typings.ts";
import { createCssBackend, type CssBackendOptions } from "../backends/css.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "./atoms.ts";

export interface CreateCssOptions extends CssBackendOptions {}

type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

export type CompiledStyles = Record<string, string>;
export type CssStyle = Record<string, string>;
export type AnyInput = Record<string, unknown>;

export const DYNAMIC = Symbol("dynamic");

export interface DynamicReturn {
	readonly [DYNAMIC]: true;
	readonly style: CssStyle;
	readonly compiled: CompiledStyles;
}

export type DynamicStyles<
	TStyles extends StyleObject = StyleObject,
	TInput extends AnyInput = AnyInput,
> = TStyles & { $input: TInput };

export type DynamicFn<TInput extends AnyInput> = (input: TInput) => DynamicReturn;

export interface RuntimeCssFunction {
	(...styles: Array<StyleObject>): CompiledStyles;
	[ATOM_REGISTRY]?: AtomRegistry;
	[key: string]: unknown;
}

export interface RuntimeCssContext {
	readonly backendOptions: CreateCssOptions;
	readonly backend: ReturnType<typeof createCssBackend>;
	readonly atoms: AtomRegistry;
	readonly compileStyles: (...styles: Array<StyleObject>) => CompiledStyles;
	readonly flatten: (style: StyleObject) => FlatStyles;
	readonly assign: (...styles: Array<StyleObject>) => StyleObject;
}

export type RuntimeCssAttachment = (css: RuntimeCssFunction, context: RuntimeCssContext) => void;

/**
 * Replace Chakra/Panda-style null resets without copying ordinary style
 * objects. Most runtime calls contain no nulls, so clone only the branch that
 * actually changes; this keeps the common path allocation-light and preserves
 * the input object for callers that reuse style constants.
 */
const preserveNullResets = (value: unknown, property = ""): unknown => {
	if (value === null) {
		const cssProperty = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
		return cssProperty.endsWith("-width") && cssProperty.includes("border-") ? 0 : "initial";
	}
	if (Array.isArray(value)) {
		let copy: unknown[] | undefined;
		for (let index = 0; index < value.length; index++) {
			const item = value[index];
			const normalized = preserveNullResets(item, property);
			if (normalized !== item) {
				copy ??= value.slice(0, index);
				copy[index] = normalized;
			} else if (copy !== undefined) {
				copy[index] = item;
			}
		}
		return copy ?? value;
	}
	if (typeof value !== "object" || value === undefined) return value;
	let copy: Record<string, unknown> | undefined;
	for (const [key, child] of Object.entries(value)) {
		const normalized = preserveNullResets(child, key);
		if (normalized !== child) {
			copy ??= { ...(value as Record<string, unknown>) };
			copy[key] = normalized;
		}
	}
	return copy ?? value;
};

const isPreset = (value: CreateCssOptions | TypedPreset): value is TypedPreset =>
	typeof value === "object" &&
	value !== null &&
	"conditions" in value &&
	"properties" in value &&
	"strict" in value;

/** Build only the callable declaration compiler; optional methods are attached by adapters. */
export function createCssRuntime(
	presetOrOptions: CreateCssOptions | TypedPreset = {},
	options: CreateCssOptions = {},
	attachments: readonly RuntimeCssAttachment[] = [],
): RuntimeCssFunction {
	const backendOptions = isPreset(presetOrOptions)
		? { ...options, conditions: presetOrOptions.conditions }
		: presetOrOptions;
	const backend = createCssBackend(backendOptions);
	const atoms = backend.atoms;

	const compileStyles = (...styles: Array<StyleObject>): CompiledStyles => {
		let source: StyleObject;
		if (styles.length === 1) {
			source = preserveNullResets(styles[0]) as StyleObject;
		} else {
			source = {};
			for (const style of styles) Object.assign(source, preserveNullResets(style));
		}
		const flat = flattenStyle(source);
		const compiled = {} as CompiledStyles;
		for (const key in flat) compiled[key] = backend.declare(key, flat[key]!);
		Object.defineProperty(compiled, "$$css", { value: true, enumerable: false });
		return compiled;
	};

	const context: RuntimeCssContext = {
		backendOptions,
		backend,
		atoms,
		compileStyles,
		flatten: flattenStyle,
		assign: assign as (...styles: Array<StyleObject>) => StyleObject,
	};
	const css = ((...styles: Array<StyleObject>) => compileStyles(...styles)) as RuntimeCssFunction;
	css[ATOM_REGISTRY] = atoms;
	for (const attach of attachments) attach(css, context);
	return css;
}

export type TypedRuntimeCssFunction<TPreset extends TypedPreset> = RuntimeCssFunction &
	((
		...styles: Array<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>
	) => CompiledStyles);
