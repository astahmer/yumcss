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

const preserveNullResets = (value: unknown, property = ""): unknown => {
	if (value === null) {
		const cssProperty = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
		return cssProperty.endsWith("-width") && cssProperty.includes("border-") ? 0 : "initial";
	}
	if (Array.isArray(value)) return value.map((item) => preserveNullResets(item, property));
	if (typeof value !== "object" || value === undefined) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, child]) => [key, preserveNullResets(child, key)]),
	);
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
		const flat = flattenStyle(
			assign(...styles.map((style) => preserveNullResets(style) as StyleObject)),
		);
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
