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

/* -----------------------------------------------------------------------------
 * properties config
 * -----------------------------------------------------------------------------*/

/** A CSS property configuration supplied by the project's type vocabulary. */
export interface AnyCssConfig {
	[key: string]: any;
}

interface AnyCssPropConf<TConfig, TName extends keyof TConfig> extends Record<
	string,
	TConfig[TName]
> {}

type CssValuesOf<TConfig, TName extends keyof TConfig> = AnyCssPropConf<TConfig, TName>;

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
	? Value | `${Value}/${OpacityModifier}`
	: Value;

type MaybeColorOpacity<TName, Value> = TName extends ColorPropertyName
	? WithOpacityModifiers<Value>
	: Value;

type PropConfigValues<
	TConfig,
	TName extends keyof TConfig,
	Value extends CssValuesOf<TConfig, TName>,
> = Value | true;

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
export type AnyPresetProperties<TConfig, TTokens> = {
	[PropName in keyof TConfig]?: PropConfigValues<
		TConfig,
		PropName,
		CssValuesOf<TConfig, PropName>
	> & {
		$strictness?: "inherits";
		$tokens?: keyof TTokens;
	};
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

/** The authored raw-token shape accepted by {@link defineTokens}. */
export type AnySimpleTokens = Record<string, Record<string, string>>;

/** Condition-aware token shape accepted by {@link defineSemanticTokens}. */
export type AnySemanticTokens<TConds extends string> = Record<
	string,
	Record<string, Partial<Record<TConds, string>>>
>;

/** Every `group.name` path available in a token catalog. */
export type TokenReference<TTokens> = {
	[TGroup in Extract<keyof TTokens, string>]: `${TGroup}.${Extract<keyof TTokens[TGroup], string>}`;
}[Extract<keyof TTokens, string>];

/** A condition-aware token layer whose values must reference the catalog. */
export type SemanticTokenLayer<TConditions extends AnyConditions, TTokens> = {
	[TGroup in Extract<keyof TTokens, string>]?: {
		[TTokenName: string]: Partial<
			Record<Extract<keyof TConditions, string>, TokenReference<TTokens>>
		>;
	};
};

/** The normalized token shape carried by a compiled preset. */
export type AnyTokens = Record<string, Record<string, Token["value"]>>;

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
	TConfig extends AnyCssConfig = AnyCssConfig,
	TTokens extends AnyTokens = AnyTokens,
	TConditions extends AnyConditions = AnyConditions,
	TProps extends AnyPresetProperties<TConfig, TTokens> = AnyPresetProperties<TConfig, TTokens>,
> {
	/** Condition names mapped to selectors or at-rules. */
	conditions: TConditions;
	/** CSS properties and the token groups allowed for each property. */
	properties: TProps;
	/** Whether mapped properties default to token-only values. */
	strict: boolean;
}

/** Values portion passed to {@link definePreset}. */
export interface DefinePresetOptions<
	TConfig extends AnyCssConfig = AnyCssConfig,
	TTokens extends AnyTokens = AnyTokens,
> {
	config: TConfig;
	tokens: TTokens;
}

/** Theme values combined with preset behavior. */
export interface CssConfigReturn<
	TTheme extends DefinePresetOptions = DefinePresetOptions,
> extends CssPreset<TTheme["config"]> {
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

type InferPropValues<TTokens, Value> = Value extends {
	$tokens: infer TTokenName;
}
	? TTokenName extends keyof TTokens
		? Extract<keyof TTokens[TTokenName], AuthoredValueName> | ExplicitTokenNames<Value>
		: ExplicitTokenNames<Value>
	: ExplicitTokenNames<Value>;

type StrictValue<TConfig, TTokens, TName extends keyof TConfig, Value> = Value extends {
	$strictness: "inherits";
}
	? MaybeColorOpacity<TName, InferPropValues<TTokens, Value>> | TConfig[TName]
	: MaybeColorOpacity<TName, InferPropValues<TTokens, Value>>;

type PropValue<TConfig, TTokens, TName extends keyof TConfig, Value, Strict> =
	| (Value extends boolean
			? TConfig[TName]
			: Strict extends true | undefined
				? StrictValue<TConfig, TTokens, TName, Value>
				: InferPropValues<TTokens, Value> | TConfig[TName])
	| null;

type ConditionalValue<V, TConds extends string> = [TConds] extends [never]
	? V
	: V | { [K in TConds]?: ConditionalValue<V, TConds> };

type Nested<TStyle, TConds extends string> = TStyle & {
	[K in AnySelector]?: Nested<TStyle, TConds>;
} & {
	[K in TConds]?: Nested<TStyle, TConds>;
};

type ThemeConds<
	TConfig extends AnyCssConfig,
	TPreset extends CssPreset<TConfig>,
	TKeys = keyof TPreset["conditions"],
> = TKeys extends string ? TKeys : never;

type InitialCssTypesValues<TConfig, TAll, PropName extends keyof TConfig> = TAll extends true
	? TConfig[PropName]
	: never;

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
 * @typeParam TConfig - The CSS property configuration.
 * @typeParam TTokens - The preset token groups.
 * @typeParam TPreset - The complete preset metadata.
 * @typeParam TConds - The condition keys accepted by nested styles.
 * @category styling
 * @since 0.1.0
 */
export type TypedStyleObject<
	TConfig extends AnyCssConfig,
	TTokens extends AnyTokens,
	TPreset extends CssPreset<TConfig>,
	TConds extends string = ThemeConds<TConfig, TPreset>,
	TAll = TPreset["properties"] extends { $all: true } ? true : false,
	TList extends string = Exclude<Extract<keyof TPreset["properties"], string>, "$all">,
	TCssPropName = Extract<keyof TConfig, string>,
	TPropList extends string = TAll extends true ? Extract<keyof TConfig, string> | TList : TList,
> = Nested<
	{
		[PropName in TPropList]?: PropName extends TCssPropName
			? PropName extends keyof TPreset["properties"]
				? ConditionalValue<
						PropValue<
							TConfig,
							TTokens,
							PropName,
							TPreset["properties"][PropName],
							TPreset["strict"]
						>,
						TConds
					>
				: ConditionalValue<InitialCssTypesValues<TConfig, TAll, PropName>, TConds>
			: "Not a part of the `TConfig` interface" & {
					_error: typeof ErrorSymbol;
				};
	},
	TConds
>;
