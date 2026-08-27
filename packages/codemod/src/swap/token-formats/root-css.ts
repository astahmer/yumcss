import { exportRootCss, importRootCss } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const rootCssTokenFormat: TokenFormatAdapter = {
	id: "rootcss",
	importText: importRootCss,
	exportText: exportRootCss,
};
