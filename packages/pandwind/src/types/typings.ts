import type { AnySelector } from "./selectors.d.ts";

export interface StyleObject
	 extends Record<string, string | number | null | Record<string, unknown> | undefined> {}

/* -----------------------------------------------------------------------------
 * properties config
 * -----------------------------------------------------------------------------*/

export interface AnyCssConfig {
	[key: string]: any;
}

interface AnyCssPropConf<TConfig, TName extends keyof TConfig> extends Record<
	string,
	TConfig[TName]
> {}

type CssValuesOf<TConfig, TName extends keyof TConfig> = AnyCssPropConf<TConfig, TName>;

type PropConfigValues<
	TConfig,
	TName extends keyof TConfig,
	Value extends CssValuesOf<TConfig, TName>,
> = Value | true;

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

export type AnyConditions = Record<string, string | string[]>;

export interface SimpleToken {
	path: string;
	name: string;
	value: string;
	hash: string;
}

export interface SemanticToken<TConds = string> extends Omit<SimpleToken, "value"> {
	group: string;
	cssVar: string;
	value: string | Record<string, TConds>;
}

export type Token<TConds = string> = SimpleToken | SemanticToken<TConds>;

export interface TokenDeclaration {
	declaration: string;
	priority: number;
}

export type AnySimpleTokens = Record<string, Record<string, string>>;
export type AnySemanticTokens<TConds extends string> = Record<
	string,
	Record<string, Partial<Record<TConds, string>>>
>;
export type AnyTokens = Record<string, Record<string, Token["value"]>>;

export interface CssPreset<
	TConfig extends AnyCssConfig = AnyCssConfig,
	TTokens extends AnyTokens = AnyTokens,
	TConditions extends AnyConditions = AnyConditions,
	TProps extends AnyPresetProperties<TConfig, TTokens> = AnyPresetProperties<TConfig, TTokens>,
> {
	conditions: TConditions;
	properties: TProps;
	strict: boolean;
}

export interface DefinePresetOptions<
	TConfig extends AnyCssConfig = AnyCssConfig,
	TTokens extends AnyTokens = AnyTokens,
> {
	config: TConfig;
	tokens: TTokens;
}

export interface CssConfigReturn<
	TTheme extends DefinePresetOptions = DefinePresetOptions,
> extends CssPreset<TTheme["config"]> {
	_config: TTheme["config"];
	tokens: TTheme["tokens"];
}

/* -----------------------------------------------------------------------------
 * `css({ ... })` typings
 * -----------------------------------------------------------------------------*/

type InferPropValues<TTokens, Value> = Value extends {
	$tokens: infer TTokenName;
}
	? TTokenName extends keyof TTokens
		? keyof TTokens[TTokenName] | Exclude<keyof Value, "$strictness" | "$tokens">
		: Exclude<keyof Value, "$strictness" | "$tokens">
	: Exclude<keyof Value, "$strictness" | "$tokens">;

type StrictValue<TConfig, TTokens, TName extends keyof TConfig, Value> = Value extends {
	$strictness: infer TStrictness;
}
	? TStrictness extends "inherits"
		? InferPropValues<TTokens, Value> | TConfig[TName]
		: InferPropValues<TTokens, Value>
	: InferPropValues<TTokens, Value>;

type PropValue<TConfig, TTokens, TName extends keyof TConfig, Value, Strict> =
	| (Value extends boolean
			? TConfig[TName]
			: Strict extends true | undefined
				? StrictValue<TConfig, TTokens, TName, Value>
				: InferPropValues<TTokens, Value> | TConfig[TName])
	| null;

type ConditionalValue<V, TConds extends string> =
	| V
	| {
			[K in TConds]?: ConditionalValue<V, TConds>;
	  };

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

export type TypedStyleObject<
	TConfig extends AnyCssConfig,
	TTokens extends AnyTokens,
	TPreset extends CssPreset<TConfig>,
	TConds extends string = ThemeConds<TConfig, TPreset>,
	TAll = TPreset["properties"] extends { $all: true } ? true : false,
	TList extends string = keyof TPreset["properties"] extends string
		? Exclude<keyof TPreset["properties"], "$all"> // Extract<keyof TPreset["properties"], CssPropName>
		: never,
	TCssPropName = keyof TConfig extends string ? keyof TConfig : "never",
	TPropList extends string = TAll extends true
		? keyof TConfig extends string
			? keyof TConfig
			: never | TList
		: TList,
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
