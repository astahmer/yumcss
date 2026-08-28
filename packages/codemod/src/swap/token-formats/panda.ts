import { tokenSetCodec } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const pandaTokenFormat: TokenFormatAdapter = {
	id: "panda",
	importFile: tokenSetCodec.fromPandaConfig,
	exportText: tokenSetCodec.toPandaConfigSnippet,
};
