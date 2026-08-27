import { fromPandaConfig, toPandaConfigSnippet } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const pandaTokenFormat: TokenFormatAdapter = {
	id: "panda",
	importFile: fromPandaConfig,
	exportText: toPandaConfigSnippet,
};
