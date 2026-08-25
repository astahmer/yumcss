import { assign, cssVar, type FlatStyles, flattenStyle } from "../lib/utils.ts";
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
import type {
	AnyClassNameStrategy,
	ClassNameFn,
	ClassNameStrategy,
} from "./class-name-strategy.ts";
import { encodeVars, VARS_ATOMS, type VarAtom, type VarsOutput } from "./vars.ts";

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
	// The web backend owns declaration lowering (hash/strategy/atom registry,
	// plans/021); everything below is the css surface built on top of it.
	const backend = createCssBackend(options);
	const atoms = backend.atoms;

	const compile = (style: FlatStyles): CompiledStyles => {
		const css = {} as CompiledStyles;
		for (const key in style) {
			css[key] = backend.declare(key, style[key]!);
		}

		return css;
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
					compiled[key] = backend.declare(key, `$${varName}`);
					return;
				}

				compiled[key] = backend.declare(key, value);
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

	// Dynamic VALUES -> inline custom properties + toggle-rule classes.
	// `{ color: value }` -> `{ class: "pw-color", style: { "--pw-c-color": value } }`.
	// The class/style pair rides the element as usual; the VALUE never enters
	// any generated stylesheet (plans/014 §1).
	css.vars = (...styles: Array<StyleObject>): VarsOutput => {
		const flat = flattenStyle(assign(...styles));
		const { atoms: varAtoms, style: varStyle } = encodeVars(flat);
		const output: VarsOutput = {
			class: varAtoms.map((atom) => atom.cls).join(" "),
			style: varStyle,
		};
		if (varAtoms.length > 0) {
			(output as { [VARS_ATOMS]?: Array<VarAtom> })[VARS_ATOMS] = varAtoms;
		}
		return output;
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

/** Backend options (plans/021): forwarded to the css backend unchanged. */
export interface CreateCssOptions extends CssBackendOptions {}

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
	/**
	 * Dynamic values as inline custom properties (plans/014): returns a
	 * `{ class, style }` pair. Keys share the css() typings; values are
	 * delivered inline, so nothing enters the generated stylesheet.
	 */
	vars: (...styles: Array<TStyles>) => VarsOutput;
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
