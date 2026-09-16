import type { AnySelector } from "./selectors.d.ts";

/** A value accepted in a Pandwind style object, including nested conditions. */
export type StyleValue = string | number | null | StyleObject | readonly StyleValue[] | undefined;

/**
 * Open style shape used by runtime and migration APIs.
 *
 * @example
 * ```ts
 * import type { StyleObject } from "pandwind/types/typings";
 *
 * const style: StyleObject = {
 *   color: "var(--runtime-color)",
 *   _hover: { opacity: 0.8 },
 * };
 * ```
 *
 * @category styling
 * @since 0.1.0
 */
export interface StyleObject extends Record<string, StyleValue> {}

/** Runtime style input accepted only by `css.vars`. */
export type DynamicStyleValue =
	| string
	| number
	| boolean
	| null
	| DynamicStyleObject
	| readonly DynamicStyleValue[]
	| undefined;

export interface DynamicStyleObject extends Record<string, DynamicStyleValue> {}

/* -----------------------------------------------------------------------------
 * properties config
 * -----------------------------------------------------------------------------*/

/** A CSS property configuration supplied by the project's type vocabulary. */
export type AnyCssConfig = object;

type ColorPropertyName =
	| "color"
	| "background"
	| "backgroundColor"
	| "borderColor"
	| "borderTopColor"
	| "borderRightColor"
	| "borderBottomColor"
	| "borderLeftColor"
	| "outlineColor"
	| "textDecorationColor"
	| "textEmphasisColor"
	| "fill"
	| "stroke";

type OpacityModifier =
	| "0"
	| "5"
	| "10"
	| "15"
	| "20"
	| "25"
	| "30"
	| "35"
	| "40"
	| "45"
	| "50"
	| "55"
	| "60"
	| "65"
	| "70"
	| "75"
	| "80"
	| "85"
	| "90"
	| "95"
	| "100";

type WithOpacityModifiers<Value> = Value extends string
	? string extends Value
		? Value
		: Value | `${Value}/${OpacityModifier}`
	: Value;

type MaybeColorOpacity<TName, Value> = TName extends ColorPropertyName
	? WithOpacityModifiers<Value>
	: Value;

type PropConfigValues<TConfig, TName extends keyof TConfig, TTokens> =
	| true
	| (Record<string, TConfig[TName]> & {
			$strictness?: "inherits";
			$tokens?: TokenGroupKey<TTokens>;
	  });

/**
 * Maps CSS properties to raw values or named token groups in a preset.
 *
 * `true` uses the CSS config; `$tokens` binds a token group; `$all` includes
 * all configured properties; `$strictness: "inherits"` also allows raw values.
 *
 * @typeParam TConfig - The CSS property configuration.
 * @typeParam TTokens - The token groups available to the preset.
 * @category presets
 * @since 0.1.0
 */
export type AnyPresetProperties<TConfig extends object, TTokens> = {
	[PropName in Exclude<keyof TConfig, "colorPalette">]?: PropConfigValues<
		TConfig,
		PropName,
		TTokens
	>;
} & {
	$all?: true;
};

/** Condition names mapped to selectors, at-rules, or ordered selector lists. */
export type AnyConditions = Record<string, string | string[]>;

/** A statically resolved token entry produced by stylesheet analysis. */
export interface SimpleToken {
	path: string;
	name: string;
	value: string;
	hash: string;
}

/** A token whose value changes under one or more preset conditions. */
export interface SemanticToken<TConds = string> extends Omit<SimpleToken, "value"> {
	group: string;
	cssVar: string;
	value: string | Record<string, TConds>;
}

/** Either a raw token or a condition-aware semantic token. */
export type Token<TConds = string> = SimpleToken | SemanticToken<TConds>;

/** A serialized token declaration and its cascade priority. */
export interface TokenDeclaration {
	declaration: string;
	priority: number;
}

/** The authored raw-token shape accepted by {@link define.tokens}. */
export type AnySimpleTokens = Record<string, Record<string, string>>;

/** Condition-aware token shape accepted by a token catalog's `defineSemanticTokens`. */
export type AnySemanticTokens<TConds extends string> = Record<
	string,
	Record<string, Partial<Record<TConds, string>>>
>;

type TokenValue = string | Record<string, string>;
type TokenCatalogMethod = (...args: never[]) => unknown;

/** Token maps plus the non-enumerable composers returned by `define.tokens`. */
export type AnyTokens = Record<string, Record<string, TokenValue> | TokenCatalogMethod>;

/** The authored token-group keys, excluding the catalog's composer methods. */
export type TokenGroupKey<TTokens> = string extends keyof TTokens
	? string
	: {
			[TGroup in Extract<keyof TTokens, string>]: TTokens[TGroup] extends Record<string, TokenValue>
				? TGroup
				: never;
		}[Extract<keyof TTokens, string>];

/** The token group at one authored catalog key. */
export type TokenGroup<TTokens, TGroup extends string> = TGroup extends keyof TTokens
	? TTokens[TGroup] extends Record<string, TokenValue>
		? TTokens[TGroup]
		: never
	: never;

/** Every `group.name` path available in a token catalog. */
export type TokenReference<TTokens> = {
	[TGroup in TokenGroupKey<TTokens>]: `${TGroup}.${Extract<
		keyof TokenGroup<TTokens, TGroup>,
		string
	>}`;
}[TokenGroupKey<TTokens>];

type SemanticTokenValue<TTokens, TValue> = TValue extends string
	? TValue extends TokenReference<TTokens>
		? TValue
		: TValue extends `${TokenGroupKey<TTokens>}.${string}`
			? never
			: TValue
	: never;

type ValidatedSemanticTokens<
	TConditions extends AnyConditions,
	TTokens,
	TLayer extends AnySemanticTokens<Extract<keyof TConditions, string>>,
> = {
	[TGroup in keyof TLayer]: {
		[TTokenName in keyof TLayer[TGroup]]: TLayer[TGroup][TTokenName] extends infer TValues
			? TValues extends object
				? {
						[TCondition in keyof TValues]: TCondition extends Extract<keyof TConditions, string>
							? SemanticTokenValue<TTokens, TValues[TCondition]>
							: never;
					}
				: never
			: never;
	};
};

/** The normalized token shape carried by a compiled preset. */
export type TokenCatalog<TTokens extends AnyTokens> = TTokens & {
	readonly defineSemanticTokens: <
		const TConditions extends AnyConditions,
		const TLayer extends AnySemanticTokens<Extract<keyof TConditions, string>>,
	>(
		conditions: TConditions,
		semanticTokens: TLayer & ValidatedSemanticTokens<TConditions, TTokens, TLayer>,
	) => TokenCatalog<TTokens & TLayer>;
	/** Define named color roles checked against this token catalog. */
	readonly defineColorPalettes: <TPalettes extends ColorPaletteDefinitions<TTokens>>(
		palettes: TPalettes,
	) => TPalettes;
};

type ColorTokenName<TTokens extends AnyTokens> = Extract<
	keyof TokenGroup<TTokens, "colors">,
	string
>;

type ColorPalettePrefix<TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
	? Tail extends `${string}.${string}`
		? Head | `${Head}.${ColorPalettePrefix<Tail>}`
		: Head
	: TPath;

type ColorPaletteSourcePath<TTokens extends AnyTokens> =
	ColorTokenName<TTokens> extends infer TPath
		? TPath extends string
			? `colors.${ColorPalettePrefix<TPath>}`
			: never
		: `colors.${string}`;

type ColorPaletteTokenPath<TTokens extends AnyTokens> =
	Extract<TokenReference<TTokens>, `colors.${string}`> extends infer TPath
		? [TPath] extends [never]
			? `colors.${string}`
			: TPath
		: never;

/** A static color subtree or a named map of color token references. */
export type ColorPaletteSource<TTokens extends AnyTokens = AnyTokens> =
	| ColorPaletteSourcePath<TTokens>
	| { readonly [TName: string]: ColorPaletteTokenPath<TTokens> };

/** Color palettes accepted by a preset, keyed by the authored palette name. */
export type ColorPaletteDefinitions<TTokens extends AnyTokens = AnyTokens> = {
	readonly [TName: string]: ColorPaletteSource<TTokens>;
};

/** Runtime and typing metadata consumed by Pandwind CSS factories.
 *
 * @typeParam TConfig - The project's CSS property configuration.
 * @typeParam TTokens - The preset token groups.
 * @typeParam TConditions - The condition names and selectors.
 * @typeParam TProps - The property-to-token vocabulary.
 * @category presets
 * @since 0.1.0
 */
export interface CssPreset<
	TConfig extends object = AnyCssConfig,
	TTokens extends AnyTokens = AnyTokens,
	TConditions extends AnyConditions = AnyConditions,
	TProps extends AnyPresetProperties<TConfig, TTokens> = AnyPresetProperties<TConfig, TTokens>,
	TColorPalettes extends ColorPaletteDefinitions<TTokens> = ColorPaletteDefinitions<TTokens>,
> {
	/** Condition names mapped to selectors or at-rules. */
	conditions: TConditions;
	/** CSS properties and the token groups allowed for each property. */
	properties: TProps;
	/** Whether mapped properties default to token-only values. */
	strict: boolean;
	/** Static palette assignments for the virtual `colorPalette.*` token family. */
	colorPalettes?: TColorPalettes;
}

/** Values portion passed to {@link define.preset}. */
export interface DefinePresetOptions<
	TConfig extends object = AnyCssConfig,
	TTokens extends AnyTokens = AnyTokens,
> {
	config: TConfig;
	tokens: TTokens;
}

/** Theme values combined with preset behavior. */
export interface CssConfigReturn<
	TTheme extends DefinePresetOptions = DefinePresetOptions,
> extends CssPreset<
	TTheme["config"],
	TTheme["tokens"],
	AnyConditions,
	AnyPresetProperties<TTheme["config"], TTheme["tokens"]>,
	ColorPaletteDefinitions<TTheme["tokens"]>
> {
	_config: TTheme["config"];
	tokens: TTheme["tokens"];
}

/* -----------------------------------------------------------------------------
 * `css({ ... })` typings
 * -----------------------------------------------------------------------------*/

type AuthoredValueName = string | number;

type ExplicitTokenNames<Value> = Extract<
	Exclude<keyof Value, "$strictness" | "$tokens">,
	AuthoredValueName
>;

type ColorPaletteConfig<TPreset> = TPreset extends { colorPalettes: infer TColorPalettes }
	? NonNullable<TColorPalettes>
	: never;

type ColorPaletteNames<TPreset> = [ColorPaletteConfig<TPreset>] extends [never]
	? never
	: Extract<keyof ColorPaletteConfig<TPreset>, string>;

type ColorPaletteSuffixes<
	TTokens extends AnyTokens,
	TSource,
> = TSource extends `colors.${infer TPrefix}`
	? ColorTokenName<TTokens> extends infer TPath
		? TPath extends TPrefix
			? ""
			: TPath extends `${TPrefix}.${infer TSuffix}`
				? TSuffix
				: never
		: never
	: TSource extends { readonly [TName: string]: string }
		? Extract<keyof TSource, string>
		: never;

type ColorPaletteVirtualNames<TTokens extends AnyTokens, TPreset> =
	ColorPaletteNames<TPreset> extends infer TPalette
		? TPalette extends keyof ColorPaletteConfig<TPreset>
			? ColorPaletteSuffixes<TTokens, ColorPaletteConfig<TPreset>[TPalette]> extends infer TSuffix
				? TSuffix extends string
					? TSuffix extends ""
						? "colorPalette"
						: `colorPalette.${TSuffix}`
					: never
				: never
			: never
		: never;

type ColorPaletteValue<
	TName extends string,
	TTokens extends AnyTokens,
	TPreset,
> = TName extends ColorPropertyName ? ColorPaletteVirtualNames<TTokens, TPreset> : never;

type ColorPaletteReference<TPreset> = [ColorPaletteNames<TPreset>] extends [never]
	? never
	:
			| ColorPaletteNames<TPreset>
			| {
					readonly [condition: string]: ColorPaletteReference<TPreset>;
			  };

type PresetStyleValue<TPreset extends CssPreset, TAdditionalValue> =
	| string
	| number
	| TAdditionalValue
	| null
	| undefined
	| PresetStyleObject<TPreset, TAdditionalValue>
	| readonly PresetStyleValue<TPreset, TAdditionalValue>[];

type PresetStyleObject<TPreset extends CssPreset, TAdditionalValue> = {
	readonly [property: string]: PresetStyleValue<TPreset, TAdditionalValue>;
	readonly colorPalette?: ColorPaletteReference<TPreset>;
};

/** Raw CSS style objects with preset palette assignments checked when present. */
export type TypedRawStyleObject<TPreset extends CssPreset> = PresetStyleObject<TPreset, never>;

/** Dynamic style objects with preset palette assignments checked when present. */
export type TypedDynamicStyleObject<TPreset extends CssPreset> = PresetStyleObject<
	TPreset,
	boolean
>;

type InferPropValues<TTokens extends AnyTokens, Value> = Value extends {
	$tokens: infer TTokenName;
}
	? TTokenName extends TokenGroupKey<TTokens>
		? Extract<keyof TokenGroup<TTokens, TTokenName>, AuthoredValueName> | ExplicitTokenNames<Value>
		: ExplicitTokenNames<Value>
	: ExplicitTokenNames<Value>;

type StrictValue<
	TConfig,
	TTokens extends AnyTokens,
	TName extends string,
	Value,
	TPreset,
> = Value extends {
	$strictness: "inherits";
}
	?
			| MaybeColorOpacity<
					TName,
					InferPropValues<TTokens, Value> | ColorPaletteValue<TName, TTokens, TPreset>
			  >
			| ConfigPropertyValue<TConfig, TName>
	: MaybeColorOpacity<
			TName,
			InferPropValues<TTokens, Value> | ColorPaletteValue<TName, TTokens, TPreset>
		>;

type PropValue<TConfig, TTokens extends AnyTokens, TName extends string, Value, Strict, TPreset> =
	| (Value extends boolean
			? ConfigPropertyValue<TConfig, TName>
			: Strict extends true | undefined
				? StrictValue<TConfig, TTokens, TName, Value, TPreset>
				:
						| InferPropValues<TTokens, Value>
						| ColorPaletteValue<TName, TTokens, TPreset>
						| ConfigPropertyValue<TConfig, TName>)
	| null;

type ConditionalValue<V, TConds extends string> = [TConds] extends [never]
	? V
	: V | { [K in TConds]?: ConditionalValue<V, TConds> };

type Nested<TStyle, TConds extends string> = TStyle & {
	[K in AnySelector | TConds]?: Nested<TStyle, TConds>;
};

type TypedStylePreset = {
	_config: object;
	tokens: AnyTokens;
	conditions: AnyConditions;
	properties: object;
	strict: boolean;
};

type ThemeConds<TPreset extends TypedStylePreset> = Extract<keyof TPreset["conditions"], string>;

type ConfigPropertyNames<TConfig> = [keyof TConfig] extends [never]
	? string
	: Extract<keyof TConfig, string>;

type ConfigPropertyValue<TConfig, PropName extends string> = PropName extends keyof TConfig
	? TConfig[PropName]
	: [keyof TConfig] extends [never]
		? string | number
		: never;

type InitialCssTypesValues<TConfig, TAll, PropName extends string> = TAll extends true
	? ConfigPropertyValue<TConfig, PropName>
	: never;

type PresetStylePropertyNames<TPreset extends TypedStylePreset> =
	| (TPreset["properties"] extends { $all: true }
			? Exclude<ConfigPropertyNames<TPreset["_config"]>, "colorPalette">
			: never)
	| Exclude<Extract<keyof TPreset["properties"], string>, "$all" | "colorPalette">
	| ([ColorPaletteNames<TPreset>] extends [never] ? never : "colorPalette");

type PresetPaletteProperty<TPreset extends TypedStylePreset> = [
	ColorPaletteNames<TPreset>,
] extends [never]
	? { colorPalette?: never }
	: {};

declare const ErrorSymbol: unique symbol;

/**
 * Preset-aware style object accepted by `createCss(preset)`.
 *
 * @example
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const css = createCss(examplePreset);
 *
 * css.class({
 *   backgroundColor: "$blue-500",
 *   _hover: { backgroundColor: "$blue-600" },
 * });
 * ```
 *
 * @typeParam TPreset - The complete preset metadata.
 * @typeParam TConds - The condition keys accepted by nested styles.
 * @category styling
 * @since 0.1.0
 */
export type TypedStyleObject<
	TPreset extends TypedStylePreset,
	TConds extends string = ThemeConds<TPreset>,
> = Nested<
	{
		[PropName in PresetStylePropertyNames<TPreset>]?: PropName extends "colorPalette"
			? ConditionalValue<ColorPaletteNames<TPreset>, TConds>
			: PropName extends ConfigPropertyNames<TPreset["_config"]>
				? PropName extends keyof TPreset["properties"]
					? ConditionalValue<
							PropValue<
								TPreset["_config"],
								TPreset["tokens"],
								PropName,
								TPreset["properties"][PropName],
								TPreset["strict"],
								TPreset
							>,
							TConds
						>
					: ConditionalValue<
							InitialCssTypesValues<
								TPreset["_config"],
								TPreset["properties"] extends { $all: true } ? true : false,
								PropName
							>,
							TConds
						>
				: "Not a part of the `TConfig` interface" & {
						_error: typeof ErrorSymbol;
					};
	} & PresetPaletteProperty<TPreset>,
	TConds
>;
