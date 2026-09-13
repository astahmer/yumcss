import { assign, isSafePathPart, type FlatStyles, flattenStyle } from "../lib/utils.ts";
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
import { createTokenResolver } from "./tokens.ts";
import { isSafeCssValue } from "./value-normalization.ts";

/**
 * Options shared by the public CSS factories.
 *
 * @category styling
 * @since 0.1.0
 */
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
	readonly resolveRuntimeValue?: (property: string, value: string) => string;
}

/** One independently replaceable method installation for the CSS runtime. */
export type RuntimeCssAttachment = (css: RuntimeCssFunction, context: RuntimeCssContext) => void;

const isStyleObject = (value: unknown): value is StyleObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const emptyStyle = Object.create(null) as StyleObject;

const normalizeStyleInput = (style: unknown): StyleObject => {
	if (!isStyleObject(style)) return emptyStyle;
	return style;
};

const isFlatStyle = (style: unknown): style is StyleObject => {
	if (!isStyleObject(style)) return false;
	for (const key of Object.keys(style)) {
		const value = style[key];
		if (!isSafePathPart(key) || value == null || typeof value === "object") return false;
	}
	return true;
};

const isPreset = (value: CreateCssOptions | TypedPreset): value is TypedPreset =>
	typeof value === "object" &&
	value !== null &&
	"conditions" in value &&
	"properties" in value &&
	"strict" in value;

const runtimeTokenName = /^[$a-zA-Z0-9_.-]+$/u;

const createRuntimeValueResolver = (preset: TypedPreset, debug: boolean) => {
	const resolveToken = createTokenResolver(preset, debug);
	return (property: string, value: string) =>
		runtimeTokenName.test(value) ? resolveToken(property, value) : value;
};

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
	const preset = isPreset(presetOrOptions) ? presetOrOptions : undefined;
	const backendOptions = isPreset(presetOrOptions)
		? { ...options, conditions: presetOrOptions.conditions }
		: presetOrOptions;
	const resolveRuntimeValue =
		preset === undefined
			? undefined
			: createRuntimeValueResolver(preset, Boolean(backendOptions.debug));
	const backend = createCssBackend(backendOptions);
	const atoms = backend.atoms;

	const compileStyles = (...styles: Array<StyleObject>): CompiledStyles => {
		if (styles.length === 1 && isFlatStyle(styles[0])) {
			const compiled = Object.create(null) as CompiledStyles;
			for (const key of Object.keys(styles[0])) {
				const value = styles[0][key];
				if (isSafeCssValue(value)) compiled[key] = backend.declare(key, value);
			}
			Object.defineProperty(compiled, "$$css", { value: true, enumerable: false });
			return compiled;
		}
		let source: StyleObject;
		if (styles.length === 1) {
			source = normalizeStyleInput(styles[0]);
		} else {
			source = assign(...styles.map(normalizeStyleInput));
		}
		const flat = flattenStyle(source, true);
		const compiled = Object.create(null) as CompiledStyles;
		for (const key of Object.keys(flat)) {
			const value = flat[key];
			if (isSafeCssValue(value)) compiled[key] = backend.declare(key, value);
		}
		Object.defineProperty(compiled, "$$css", { value: true, enumerable: false });
		return compiled;
	};
	const compileClass = (...styles: Array<StyleObject>): string => {
		if (styles.length === 1 && isFlatStyle(styles[0])) {
			let className = "";
			for (const key of Object.keys(styles[0])) {
				const value = styles[0][key];
				if (!isSafeCssValue(value)) continue;
				if (className) className += " ";
				className += backend.declare(key, value);
			}
			return className;
		}
		const compiled = compileStyles(...styles);
		let className = "";
		for (const key of Object.keys(compiled)) {
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
		flatten: (style) => flattenStyle(style, true),
		assign: assign as (...styles: Array<StyleObject>) => StyleObject,
		resolveRuntimeValue,
	};
	const css = ((...styles: Array<StyleObject>) => compileStyles(...styles)) as RuntimeCssFunction;
	css[ATOM_REGISTRY] = atoms;
	for (const attach of attachments) attach(css, context);
	if (preset !== undefined) {
		Object.defineProperty(css, Symbol.for("pandwind.css-factory"), {
			value: { kind: "css", preset, options },
		});
	}
	return css;
}

/** Add preset-derived style typing to a runtime callable without changing its implementation. */
export type TypedRuntimeCssFunction<TPreset extends TypedPreset> = RuntimeCssFunction &
	((
		...styles: Array<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>
	) => CompiledStyles);
