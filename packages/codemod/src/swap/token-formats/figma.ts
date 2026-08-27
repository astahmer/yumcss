import { exportFigmaTokens, importFigmaTokens } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const figmaTokenFormat: TokenFormatAdapter = {
	id: "figma",
	importText: importFigmaTokens,
	exportText: exportFigmaTokens,
};
