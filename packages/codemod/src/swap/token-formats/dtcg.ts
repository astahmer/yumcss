import { fromDtcgJson, toDtcgJson } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const dtcgTokenFormat: TokenFormatAdapter = {
	id: "dtcg",
	importText: fromDtcgJson,
	exportText: toDtcgJson,
};
