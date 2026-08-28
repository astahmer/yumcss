import { tokenSetCodec } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const presetTokenFormat: TokenFormatAdapter = {
	id: "preset",
	importFile: tokenSetCodec.fromDefinePreset,
	exportText: tokenSetCodec.toDefinePresetSnippet,
};
