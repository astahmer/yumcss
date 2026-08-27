import { fromThemeCss, toThemeCss } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const themeTokenFormat: TokenFormatAdapter = {
	id: "theme",
	importText: fromThemeCss,
	exportText: toThemeCss,
};
