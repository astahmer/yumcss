import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
} from "../types/typings.ts";
import { cssPropertyFromKey } from "../backends/css.ts";
import { validateColorPaletteValue } from "./color-palette-validation.ts";
import { attachCssFactoryMetadata, CssFactoryKind } from "./factory-metadata.ts";
import {
	createCssRuntime,
	type CreateCssOptions,
	type RuntimeCssAttachment,
	type RuntimeCssFunction,
} from "./runtime-base.ts";
import { createPresetValueNormalizer } from "./preset-value-normalization.ts";
import { createRuntimeTokenResolver } from "./runtime-token-resolver.ts";

export type TypedPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

const isPreset = (value: unknown): value is TypedPreset =>
	typeof value === "object" &&
	value !== null &&
	"conditions" in value &&
	"properties" in value &&
	"strict" in value;

const runtimeTokenName = /^[$a-zA-Z0-9_.-]+$/u;

const createRuntimeValueResolver = (
	preset: TypedPreset,
	debug: boolean,
	tokenVariableNames: CreateCssOptions["tokenVariableNames"],
) => {
	const normalizeValue = createPresetValueNormalizer(preset);
	const resolveToken = createRuntimeTokenResolver(preset, debug, tokenVariableNames);
	return (property: string, value: string | number) => {
		const normalized = normalizeValue(property, value);
		return runtimeTokenName.test(normalized) ? resolveToken(property, normalized) : normalized;
	};
};

export const createPresetCssRuntime = (
	preset: TypedPreset,
	options: CreateCssOptions = {},
	attachments: readonly RuntimeCssAttachment[] = [],
): RuntimeCssFunction => {
	if (!isPreset(preset)) {
		throw new Error(
			'yumcss/css: createCss requires a preset. For unbound or runtime-discovered styles, import createUnsafeCss from "yumcss/unsafe/css".',
		);
	}
	const css = createCssRuntime(
		{ ...options, conditions: preset.conditions },
		attachments,
		createRuntimeValueResolver(preset, Boolean(options.debug), options.tokenVariableNames),
		(key, value) => {
			if (cssPropertyFromKey(key, preset.conditions) === "colorPalette")
				validateColorPaletteValue(preset, value);
		},
		createPresetValueNormalizer(preset),
	);
	attachCssFactoryMetadata(css, {
		kind: CssFactoryKind.Css,
		preset,
		options,
	});
	return css;
};
