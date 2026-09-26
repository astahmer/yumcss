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

const types: Record<string, string> = {
	color: "colors",
	spacing: "spacing",
	borderRadius: "radii",
	fontSizes: "fontSizes",
	fontWeights: "fontWeights",
};
const reverse = Object.fromEntries(Object.entries(types).map(([key, value]) => [value, key]));

export const figmaTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/2",
	id: TokenFormatId.Figma,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "partial",
		export: "partial",
		preserves: ["static string values", "recognized top-level type group"],
		mayLose: [
			"Figma metadata",
			"structured values",
			"references",
			"resolver contexts",
			"unknown types",
		],
	},
	importText(text) {
		const tokens = createScalarTokenImport();
		const losses: TokenFormatLoss[] = [];
		TokenTreeWalker.visit(JSON.parse(text), (record, path) => {
			if (!Object.hasOwn(record, "value")) return;
			const fullPath = `/${path.join("/")}`;
			if (typeof record.value !== "string") {
				losses.push({
					path: `${fullPath}/value`,
					feature: "typed value",
					reason: "Figma importer supports static strings only",
				});
				return true;
			}
			const typeName = typeof record.type === "string" ? record.type : undefined;
			const group = types[typeName ?? ""] ?? path[0] ?? "misc";
			if (typeName !== undefined)
				losses.push({
					path: `${fullPath}/type`,
					feature: "Figma token type",
					reason: "Figma type was projected into the group name",
				});
			for (const key of Object.keys(record).filter(
				(candidate) => candidate !== "value" && candidate !== "type",
			))
				losses.push({
					path: `${fullPath}/${key}`,
					feature: "Figma metadata",
					reason: "metadata is not carried into the scalar import",
				});
			if (path.length > 2)
				losses.push({
					path: fullPath,
					feature: "hierarchy",
					reason: "nested source path is flattened into a delimited token name",
				});
			putScalarTokenWithLoss(
				tokens,
				group,
				path.slice(1).join("-"),
				record.value,
				losses,
				fullPath,
			);
			return true;
		});
		return scalarImportToDocument(TokenFormatId.Figma, tokens, text, losses);
	},
	export(document) {
		return scalarFormatOutput(document, (groups) =>
			exportNested(groups, (value, group) => ({ value, type: reverse[group] ?? group })),
		);
	},
};
