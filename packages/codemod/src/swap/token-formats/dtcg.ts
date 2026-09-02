import {
	createTokenSet,
	exportNested,
	putToken,
	TokenTreeWalker,
} from "../token-format-support.ts";
import { TokenFormatId, type TokenFormatAdapter } from "../token-format-contracts.ts";

export const dtcgTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: TokenFormatId.Dtcg,
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		TokenTreeWalker.visit(JSON.parse(text), (record, path) => {
			if (typeof record.$value !== "string") return;
			putToken(out, path[0] ?? "misc", path.slice(1).join("-"), record.$value);
			return true;
		});
		return out;
	},
	export(set) {
		return exportNested(set.groups, (value) => ({ $value: value }));
	},
};
