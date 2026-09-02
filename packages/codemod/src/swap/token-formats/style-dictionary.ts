import {
	createTokenSet,
	putToken,
	exportNested,
	TokenTreeWalker,
} from "../token-format-support.ts";
import { TokenFormatId, type TokenFormatAdapter } from "../token-format-contracts.ts";
export const styleDictionaryTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: TokenFormatId.StyleDictionary,
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		TokenTreeWalker.visit(JSON.parse(text), (record, path) => {
			const value = record.value;
			if (typeof value !== "string") return;
			putToken(out, path[0] ?? "misc", path.slice(1).join("-"), value);
			return true;
		});
		return out;
	},
	export(set) {
		return exportNested(set.groups, (value) => ({
			value,
			...(/^#|^rgb|^hsl/i.test(value) ? { type: "color" } : {}),
		}));
	},
};
