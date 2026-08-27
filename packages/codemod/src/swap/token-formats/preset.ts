import { fromDefinePreset, toDefinePresetSnippet } from "../token-set.ts";
import type { TokenFormatAdapter } from "../token-format.ts";

export const presetTokenFormat: TokenFormatAdapter = {
	id: "preset",
	importFile: fromDefinePreset,
	exportText: toDefinePresetSnippet,
};
