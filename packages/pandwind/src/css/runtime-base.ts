import { assign, dashCase, type FlatStyles, flattenStyle } from "../lib/utils.ts";
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

/** Backend options shared by the public factory and its runtime attachments. */
export interface CreateCssOptions extends CssBackendOptions {}

type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

/** Atomic declaration names mapped to emitted class names. */
export type CompiledStyles = Record<string, string>;
/** Inline style/custom-property values carried by dynamic projections. */
export type CssStyle = Record<string, string>;
/** Unconstrained input record used by runtime group functions. */
export type AnyInput = Record<string, unknown>;

/** Internal marker that distinguishes a dynamic group result from compiled styles. */
export const DYNAMIC = Symbol("dynamic");

/** Serializable result of evaluating a dynamic group input. */
export interface DynamicReturn {
	readonly [DYNAMIC]: true;
	readonly style: CssStyle;
	readonly compiled: CompiledStyles;
}

/** Style declarations containing the named input contract used by `css.group`. */
export type DynamicStyles<
	TStyles extends StyleObject = StyleObject,
	TInput extends AnyInput = AnyInput,
> = TStyles & { $input: TInput };

/** Runtime evaluator produced for a dynamic group entry. */
export type DynamicFn<TInput extends AnyInput> = (input: TInput) => DynamicReturn;

/**
 * Minimal callable runtime shared by all optional method attachments.
 *
 * Attachments deliberately extend this value instead of making the core know
 * every projection. That keeps the runtime tree-shakeable and lets compiler
 * integrations install only the methods a module actually uses.
 */
export interface RuntimeCssFunction {
	(...styles: Array<StyleObject>): CompiledStyles;
	[ATOM_REGISTRY]?: AtomRegistry;
	[key: string]: unknown;
}

/** Services and backend state provided to an attachment during construction. */
export interface RuntimeCssContext {
	readonly backendOptions: CreateCssOptions;
	readonly backend: ReturnType<typeof createCssBackend>;
	readonly atoms: AtomRegistry;
	readonly compileStyles: (...styles: Array<StyleObject>) => CompiledStyles;
	readonly compileClass: (...styles: Array<StyleObject>) => string;
	readonly flatten: (style: StyleObject) => FlatStyles;
	readonly assign: (...styles: Array<StyleObject>) => StyleObject;
}

/** One independently replaceable method installation for the CSS runtime. */
export type RuntimeCssAttachment = (css: RuntimeCssFunction, context: RuntimeCssContext) => void;

/**
 * Replace Chakra/Panda-style null resets without copying ordinary style
 * objects. Most runtime calls contain no nulls, so clone only the branch that
 * actually changes; this keeps the common path allocation-light and preserves
 * the input object for callers that reuse style constants.
 */
const preserveNullResets = (value: unknown, property = ""): unknown => {
	if (value === null) {
		const cssProperty = dashCase(property);
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

const normalizeStyleInput = (style: StyleObject): StyleObject => {
	for (const key in style) {
		const value = style[key];
		if (value == null || typeof value === "object") return preserveNullResets(style) as StyleObject;
	}
	return style;
};

const isFlatStyle = (style: StyleObject): boolean => {
	for (const key in style) {
		const value = style[key];
		if (value == null || typeof value === "object") return false;
	}
	return true;
};

const isPreset = (value: CreateCssOptions | TypedPreset): value is TypedPreset =>
	typeof value === "object" &&
	value !== null &&
	"conditions" in value &&
	"properties" in value &&
	"strict" in value;

/**
 * Build the callable declaration compiler and install the requested method
 * attachments. The default empty attachment list is intentional: low-level
 * integrations can compose a minimal runtime, while `createCss` supplies the
 * complete public surface.
 */
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
		if (styles.length === 1 && isFlatStyle(styles[0]!)) {
			const compiled = {} as CompiledStyles;
			for (const key in styles[0]) {
				compiled[key] = backend.declare(key, styles[0]![key]! as string);
			}
			Object.defineProperty(compiled, "$$css", { value: true, enumerable: false });
			return compiled;
		}
		let source: StyleObject;
		if (styles.length === 1) {
			source = normalizeStyleInput(styles[0]!);
		} else {
			source = {};
			for (const style of styles) Object.assign(source, normalizeStyleInput(style));
		}
		const flat = flattenStyle(source);
		const compiled = {} as CompiledStyles;
		for (const key in flat) compiled[key] = backend.declare(key, flat[key]!);
		Object.defineProperty(compiled, "$$css", { value: true, enumerable: false });
		return compiled;
	};
	const compileClass = (...styles: Array<StyleObject>): string => {
		if (styles.length === 1 && isFlatStyle(styles[0]!)) {
			let className = "";
			for (const key in styles[0]) {
				if (className) className += " ";
				className += backend.declare(key, styles[0]![key]! as string);
			}
			return className;
		}
		const compiled = compileStyles(...styles);
		let className = "";
		for (const key in compiled) {
			if (className) className += " ";
			className += compiled[key]!;
		}
		return className;
	};

	const context: RuntimeCssContext = {
		backendOptions,
		backend,
		atoms,
		compileStyles,
		compileClass,
		flatten: flattenStyle,
		assign: assign as (...styles: Array<StyleObject>) => StyleObject,
	};
	const css = ((...styles: Array<StyleObject>) => compileStyles(...styles)) as RuntimeCssFunction;
	css[ATOM_REGISTRY] = atoms;
	for (const attach of attachments) attach(css, context);
	return css;
}

/** Add preset-derived style typing to a runtime callable without changing its implementation. */
export type TypedRuntimeCssFunction<TPreset extends TypedPreset> = RuntimeCssFunction &
	((
		...styles: Array<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>
	) => CompiledStyles);
