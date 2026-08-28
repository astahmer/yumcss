import type { TokenFormatAdapter, TokenSet } from "../token-format-contracts.ts";
import {
	createTokenSet,
	findPresetTokens,
	flattenNested,
	importModule,
} from "../token-format-support.ts";

const read = async (path: string): Promise<TokenSet> => {
	const raw = findPresetTokens(await importModule(path));
	if (raw === undefined) throw new Error(`codemod tokens: no preset tokens found in ${path}`);
	const out = createTokenSet();
	for (const [group, value] of Object.entries(raw)) {
		const flat: Record<string, string> = {};
		flattenNested(value, [], flat);
		out.groups[group] = flat;
	}
	return out;
};

export const presetTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: "preset",
	canImport: true,
	canExport: true,
	importFile: read,
	export: (set) =>
		`import { defineTokens } from "pandwind/preset";\n\nexport const tokens = defineTokens({\n${Object.entries(
			set.groups,
		)
			.map(
				([group, values]) =>
					`\t\t${JSON.stringify(group)}: {\n${Object.entries(values)
						.map(([key, value]) => `\t\t\t${JSON.stringify(key)}: ${JSON.stringify(value)},`)
						.join("\n")}\n\t\t},`,
			)
			.join("\n")}\n});\n`,
};
