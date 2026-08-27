import { exportStyleDictionary, importStyleDictionary } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const styleDictionaryTokenFormat: TokenFormatAdapter = {
	id: "sd",
	importText: importStyleDictionary,
	exportText: exportStyleDictionary,
};
