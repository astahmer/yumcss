import {
	findPresetTokens,
	flattenNestedWithLosses,
	importModule,
	scalarFormatOutput,
	scalarImportToDocument,
	type ScalarTokenImport,
} from "../token-format-support.ts";
import type { TokenFormatLoss } from "../token-format-contracts.ts";
import { TokenFormatId, type TokenFormatAdapter } from "../token-format-contracts.ts";

const read = async (path: string) => {
	const raw = findPresetTokens(await importModule(path));
	if (raw === undefined) throw new Error(`codemod tokens: no preset tokens found in ${path}`);
	const tokens: ScalarTokenImport = {};
	const losses: TokenFormatLoss[] = [];
	for (const [group, value] of Object.entries(raw)) {
		const values: Record<string, string> = {};
		flattenNestedWithLosses(value, [], values, losses);
		tokens[group] = values;
	}
	return scalarImportToDocument(TokenFormatId.Preset, tokens, path, losses);
};

export const presetTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/2",
	id: TokenFormatId.Preset,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "partial",
		export: "partial",
		preserves: ["static scalar token values", "top-level token group"],
		mayLose: [
			"token aliases",
			"structured values",
			"token metadata",
			"condition scopes",
			"resolver contexts",
		],
	},
	importFile: read,
	export(document) {
		return scalarFormatOutput(
			document,
			(groups) =>
				`import { define } from "pandwind/preset";\n\nexport const tokens = define.tokens({\n${Object.entries(
					groups,
				)
					.map(
						([group, values]) =>
							`\t\t${JSON.stringify(group)}: {\n${Object.entries(values)
								.map(([key, value]) => `\t\t\t${JSON.stringify(key)}: ${JSON.stringify(value)},`)
								.join("\n")}\n\t\t},`,
					)
					.join("\n")}\n});\n`,
		);
	},
};
