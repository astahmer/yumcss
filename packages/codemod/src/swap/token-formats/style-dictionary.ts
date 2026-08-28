import { tokenSetCodec } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const styleDictionaryTokenFormat: TokenFormatAdapter = {
	id: "sd",
	importText: tokenSetCodec.importStyleDictionary,
	exportText: tokenSetCodec.exportStyleDictionary,
};
