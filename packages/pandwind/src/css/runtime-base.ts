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
import { isCompilableCssValue } from "./first-that-works.ts";

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
	readonly declare: (key: string, value: string | number) => string;
	readonly validate: (key: string, value: unknown) => void;
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

/**
 * Build the callable declaration compiler and install the requested method
 * attachments. The default empty attachment list is intentional: low-level
 * integrations can compose a minimal runtime, while `createCss` supplies the
 * complete public surface.
 */
export function createCssRuntime(
	backendOptions: CreateCssOptions = {},
	attachments: readonly RuntimeCssAttachment[] = [],
	resolveRuntimeValue?: (property: string, value: string) => string,
	validateValue?: (key: string, value: unknown) => void,
): RuntimeCssFunction {
	const backend = createCssBackend(backendOptions);
	const atoms = backend.atoms;
	const validate = (key: string, value: unknown): void => {
		validateValue?.(key, value);
	};
	const declare = (key: string, value: string | number): string => {
		validate(key, value);
		return backend.declare(key, value);
	};
	const compileStyles = (...styles: Array<StyleObject>): CompiledStyles => {
		if (styles.length === 1 && isFlatStyle(styles[0])) {
			const compiled = Object.create(null) as CompiledStyles;
			for (const key of Object.keys(styles[0])) {
				const value = styles[0][key];
				if (isCompilableCssValue(value)) compiled[key] = declare(key, value);
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
			if (isCompilableCssValue(value)) compiled[key] = declare(key, value);
		}
		Object.defineProperty(compiled, "$$css", { value: true, enumerable: false });
		return compiled;
	};
	const compileClass = (...styles: Array<StyleObject>): string => {
		if (styles.length === 1 && isFlatStyle(styles[0])) {
			let className = "";
			for (const key of Object.keys(styles[0])) {
				const value = styles[0][key];
				if (!isCompilableCssValue(value)) continue;
				if (className) className += " ";
				className += declare(key, value);
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
		declare,
		validate,
		compileStyles,
		compileClass,
		flatten: (style) => flattenStyle(style, true),
		assign: assign as (...styles: Array<StyleObject>) => StyleObject,
		resolveRuntimeValue,
	};
	const css = ((...styles: Array<StyleObject>) => compileStyles(...styles)) as RuntimeCssFunction;
	css[ATOM_REGISTRY] = atoms;
	for (const attach of attachments) attach(css, context);
	return css;
}

/** Add preset-derived style typing to a runtime callable without changing its implementation. */
export type TypedRuntimeCssFunction<TPreset extends TypedPreset> = RuntimeCssFunction &
	((...styles: Array<TypedStyleObject<TPreset>>) => CompiledStyles);
