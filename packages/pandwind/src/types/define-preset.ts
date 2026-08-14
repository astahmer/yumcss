import type {
	AnyConditions,
	AnyPresetProperties,
	AnySemanticTokens,
	AnySimpleTokens,
	CssPreset,
	DefinePresetOptions,
} from "./typings.ts";

export * from "./typings.ts";

export const defineTheme = <TTheme extends DefinePresetOptions>(theme: TTheme) => theme;

export function definePreset<
	TTheme extends DefinePresetOptions<any, any>,
	TConfig extends TTheme["config"],
	TTokens extends TTheme["tokens"],
	TPreset extends CssPreset<TConfig, TTokens>,
>(theme: TTheme, preset: TPreset) {
	return { ...preset, tokens: theme.tokens } as TPreset & {
		_config: TConfig;
		tokens: TTokens;
	};
}

export const defineTokens = <T extends AnySimpleTokens>(tokens: T) => tokens;
export const defineSemanticTokens = <
	TConditions extends AnyConditions,
	TTokens extends AnySemanticTokens<keyof TConditions & string>,
>(
	_conditions: TConditions,
	tokens: TTokens,
) => tokens;
export const defineConditions = <T extends AnyConditions>(cond: T) => cond;
export const defineProperties = <T extends AnyPresetProperties<any, any>>(props: T) => props;

export const define = {
	theme: defineTheme,
	tokens: defineTokens,
	semanticTokens: defineSemanticTokens,
	conditions: defineConditions,
	properties: defineProperties,
};
