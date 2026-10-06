import { TokenFormatId, type TokenFormatAdapter } from "../token-format-contracts.ts";
import {
	createTokenDocument,
	parseDtcgResolverDocument,
	serializeTokenResolverDocument,
	type TokenGroup,
} from "../token-document.ts";

const emptyRoot: TokenGroup = { kind: "group", children: {} };

export const dtcgResolverTokenFormat: TokenFormatAdapter = {
	schema: "yumcss.token-format/1",
	id: TokenFormatId.DtcgResolver,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "lossless",
		export: "lossless",
		preserves: ["sets", "modifiers", "contexts", "resolution order", "resolver metadata"],
		mayLose: [],
	},
	importText(text) {
		const resolver = parseDtcgResolverDocument(text);
		return createTokenDocument({
			format: TokenFormatId.DtcgResolver,
			formatVersion: resolver.version,
			root: emptyRoot,
			resolver,
			sourceText: text,
		});
	},
	export(document) {
		if (document.resolver === undefined)
			throw new Error("codemod tokens: DTCG Resolver export requires resolver data");
		return {
			text: serializeTokenResolverDocument(document.resolver),
			fidelity: { status: "lossless", losses: [] },
		};
	},
};
