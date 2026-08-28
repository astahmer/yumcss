import { tokenSetCodec } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const stylexTokenFormat: TokenFormatAdapter = {
	id: "stylex",
	exportText: tokenSetCodec.exportStylexVars,
};
