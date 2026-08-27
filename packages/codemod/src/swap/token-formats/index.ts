import type { TokenFormatAdapter } from "../token-format.ts";
import { dtcgTokenFormat } from "./dtcg.ts";
import { figmaTokenFormat } from "./figma.ts";
import { pandaTokenFormat } from "./panda.ts";
import { presetTokenFormat } from "./preset.ts";
import { rootCssTokenFormat } from "./root-css.ts";
import { styleDictionaryTokenFormat } from "./style-dictionary.ts";
import { stylexTokenFormat } from "./stylex.ts";
import { themeTokenFormat } from "./theme.ts";

export const tokenFormatAdapters: readonly TokenFormatAdapter[] = [
	dtcgTokenFormat,
	themeTokenFormat,
	pandaTokenFormat,
	presetTokenFormat,
	styleDictionaryTokenFormat,
	figmaTokenFormat,
	rootCssTokenFormat,
	stylexTokenFormat,
];
