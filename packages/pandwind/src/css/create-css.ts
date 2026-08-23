import { assign, cssVar, type FlatStyles, flattenStyle } from "../lib/utils.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
	TypedStyleObject,
} from "../types/typings.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "./atoms.ts";
import {
	normalizeStrategy,
	type AnyClassNameStrategy,
	type ClassNameFn,
	type ClassNameStrategy,
} from "./class-name-strategy.ts";
import { createHashFn } from "./hash.ts";

/** @deprecated Legacy callable form — see `ClassNameStrategy` in class-name-strategy.ts. */
export type { ClassNameFn };
export type { AnyClassNameStrategy, ClassNameStrategy };

type CompiledStyles = Record<string, string>;
type CssStyle = Record<string, string>;

const DYNAMIC = Symbol("dynamic");

/**
 * Untyped convenience — useful for throwaway styles or before the preset
 * types are wired up. Values are loose strings / nested objects.
 */
export function createCss(options?: CreateCssOptions): CssFn<StyleObject>;
/** Fully typed against a preset: every value is a token or a constrained option. */
export function createCss<
	TPreset extends CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>,
>(
	options?: CreateCssOptions,
): CssFn<TypedStyleObject<TPreset["_config"], TPreset["tokens"], TPreset>>;
export function createCss(options: CreateCssOptions = {}): CssFn<StyleObject> {
	const debug = options.debug ?? false;
	const hashFn = options.hashFn ?? createHashFn(debug);
	const strategy = normalizeStrategy(options.className);
	const sheetBacked = strategy?.sheetBacked === true;
	const atoms: AtomRegistry = new Map();

	const compile = (style: FlatStyles): CompiledStyles => {
		const css = {} as CompiledStyles;
		for (const key in style) {
			css[key] = register(key, style[key]!);
		}

		return css;
	};

	const register = (key: string, value: string) => {
		const rawValue = String(value);
		if (strategy !== undefined) {
			const custom = strategy.toClassName(key, rawValue);
			if (custom !== null) {
				// Sheet-backed strategies compile through this engine's own
				// stylesheet, so their classes join the atom registry — that is
				// what keeps cx() merging and the generated rules working.
				if (sheetBacked && !atoms.has(custom)) atoms.set(custom, key);
				return custom;
			}
		}
		const atom = hashFn(key, rawValue);
		if (!atoms.has(atom)) atoms.set(atom, key);
		return atom;
	};

	const compileStyles = (...styles: Array<StyleObject>) => {
		const merged = assign(...styles);
		const flat = flattenStyle(merged);
		return compile(flat);
	};

	const transform = (styles: StyleObject | DynamicStyles) => {
		if ("$input" in styles) {
			// Omit the $input property before flattening
			const { $input: _$input, ...rest } = styles as DynamicStyles;

			// DynamicStyles -> DynamicFn
			const flat = flattenStyle(rest);
			const compiled = {} as CompiledStyles;

			Object.entries(flat).forEach(([key, value]) => {
				if (typeof value === "string" && value.startsWith("input>$")) {
					const varName = value.slice("input>$".length);
					compiled[key] = register(key, `$${varName}`);
					return;
				}

				compiled[key] = register(key, value);
			});

			return (input: AnyInput) => {
				const style = {} as CssStyle;
				Object.entries(input).forEach(([key, value]) => {
					style[cssVar(key)] = value as string;
				});

				return {
					[DYNAMIC]: true as const,
					style: style,
					compiled: compiled,
				} as DynamicReturn;
			};
		}

		// StyleObject -> CompiledStyles
		return compileStyles(styles);
	};

	// `{ color: "red" }` -> `{ color: "color__red" }`
	const css = (...styles: Array<StyleObject>) => {
		return compileStyles(...styles);
	};

	// `{ color: "red" }` -> `color__red`
	css.class = (...styles: Array<StyleObject>) => {
		return Object.values(compileStyles(...styles)).join(" ");
	};

	// `{ color: "red" }` -> `{ color: "red" }`
	css.raw = (...styles: Array<StyleObject>) => {
		return assign(...styles) as never;
	};

	// `{ color: "red" }` -> { style: undefined, className: "color__red" }
	css.props = (...props: Array<CompiledStyles | DynamicReturn>): PropsReturn => {
		const compiled = [] as Array<CompiledStyles>;
		const styles = [] as Array<CssStyle>;

		props.forEach((current) => {
			if (DYNAMIC in current) {
				compiled.push(current.compiled);
				styles.push(current.style);
				return;
			}

			compiled.push(current);
		});

		return {
			style: styles.length ? assign(...styles) : undefined,
			className: compiled.length ? Object.values(assign(...compiled)).join(" ") : undefined,
		};
	};

	// `{ btn: { color: "red" } }` -> { btn: { color: "color__red" } }
	css.group = <TGroup extends Record<string, StyleObject | DynamicStyles<StyleObject>>>(
		groups: TGroup,
	) => {
		const merged: Record<string, CompiledStyles | DynamicFn<AnyInput>> = {};

		Object.keys(groups).forEach((currentGroup) => {
			const groupStyles = groups[currentGroup];
			merged[currentGroup] = transform(groupStyles!);
		});

		return merged as never;
	};

	css.input = (name: string) => `input>$${name}` as never;

	// Exposed for createCx: resolve an atom back to its flattened style key.
	(css as CssFn & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY] = atoms;

	return css;
}

export interface CreateCssOptions {
	debug?: boolean;
	hashFn?: (key: string, value: string | true) => string;
	className?: AnyClassNameStrategy;
}

interface DynamicReturn {
	[DYNAMIC]: true;
	style: CssStyle;
	compiled: CompiledStyles;
}

interface PropsReturn {
	style: CssStyle | undefined;
	className: string | undefined;
}

type AnyInput = Record<string, unknown>;
type DynamicFn<TInput extends AnyInput> = (input: TInput) => DynamicReturn;

type DynamicStyles<
	TStyles extends StyleObject = StyleObject,
	TInput extends AnyInput = AnyInput,
> = TStyles & {
	$input: TInput;
};

export interface CssFn<TStyles extends StyleObject = StyleObject> {
	(...styles: Array<TStyles>): CompiledStyles;
	class: (...styles: Array<TStyles>) => string;
	raw: (...styles: Array<TStyles>) => StyleObject;
	props: (...styles: Array<CompiledStyles | DynamicReturn>) => PropsReturn;
	group: <TGroup extends Record<string, TStyles | DynamicStyles<TStyles>>>(
		styles: TGroup,
	) => {
		[Key in keyof TGroup]: TGroup[Key] extends { $input: infer TInput }
			? TInput extends AnyInput
				? DynamicFn<TInput>
				: never
			: CompiledStyles;
	};
	input: (name: string) => never;
}
