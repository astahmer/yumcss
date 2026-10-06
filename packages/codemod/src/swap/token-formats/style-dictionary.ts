import {
	createScalarTokenImport,
	exportNested,
	putScalarTokenWithLoss,
	scalarFormatOutput,
	scalarImportToDocument,
	TokenTreeWalker,
} from "../token-format-support.ts";
import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenFormatLoss,
} from "../token-format-contracts.ts";

export const styleDictionaryTokenFormat: TokenFormatAdapter = {
	schema: "yumcss.token-format/1",
	id: TokenFormatId.StyleDictionary,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "partial",
		export: "partial",
		preserves: ["static string values", "nested path"],
		mayLose: [
			"token type",
			"description",
			"extensions",
			"structured values",
			"references",
			"resolver contexts",
			"other SD metadata",
		],
	},
	importText(text) {
		const tokens = createScalarTokenImport();
		const losses: TokenFormatLoss[] = [];
		TokenTreeWalker.visit(JSON.parse(text), (record, path) => {
			if (!Object.hasOwn(record, "value")) return;
			const fullPath = `/${path.join("/")}`;
			if (typeof record.value !== "string" && typeof record.value !== "number") {
				losses.push({
					path: `${fullPath}/value`,
					feature: "structured value",
					reason: "Style Dictionary importer supports scalar string and number values",
				});
				return true;
			}
			if (typeof record.value === "number")
				losses.push({
					path: `${fullPath}/value`,
					feature: "number value",
					reason: "importer stores scalar values as strings",
				});
			for (const key of Object.keys(record).filter((candidate) => candidate !== "value"))
				losses.push({
					path: `${fullPath}/${key}`,
					feature: "token metadata",
					reason: "Style Dictionary metadata is not carried into the scalar import",
				});
			if (path.length > 2)
				losses.push({
					path: fullPath,
					feature: "hierarchy",
					reason: "nested source path is flattened into a delimited token name",
				});
			putScalarTokenWithLoss(
				tokens,
				path[0] ?? "misc",
				path.slice(1).join("-"),
				String(record.value),
				losses,
				fullPath,
			);
			return true;
		});
		return scalarImportToDocument(TokenFormatId.StyleDictionary, tokens, text, losses);
	},
	export(document) {
		return scalarFormatOutput(document, (groups) =>
			exportNested(groups, (value) => ({
				value,
				...(/^#|^rgb|^hsl/i.test(value) ? { type: "color" } : {}),
			})),
		);
	},
};
