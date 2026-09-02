import {
	createTokenSet,
	putToken,
	exportNested,
	TokenTreeWalker,
} from "../token-format-support.ts";
import { TokenFormatId, type TokenFormatAdapter } from "../token-format-contracts.ts";
const types: Record<string, string> = {
	color: "colors",
	spacing: "spacing",
	borderRadius: "radii",
	fontSizes: "fontSizes",
	fontWeights: "fontWeights",
};
const reverse = Object.fromEntries(Object.entries(types).map(([key, value]) => [value, key]));
export const figmaTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: TokenFormatId.Figma,
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		TokenTreeWalker.visit(JSON.parse(text), (record, path) => {
			if (typeof record.value !== "string") return;
			putToken(
				out,
				types[String(record.type)] ?? path[0] ?? "misc",
				path.slice(1).join("-"),
				record.value,
			);
			return true;
		});
		return out;
	},
	export(set) {
		return exportNested(set.groups, (value, group) => ({ value, type: reverse[group] ?? group }));
	},
};
