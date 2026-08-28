import { tokenSetCodec } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const themeTokenFormat: TokenFormatAdapter = {
	id: "theme",
	importText: tokenSetCodec.fromThemeCss,
	exportText: tokenSetCodec.toThemeCss,
};
