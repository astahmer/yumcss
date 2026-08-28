import { TokenFormatId, type TokenFormatAdapter } from "../token-format-contracts.ts";
export const stylexTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: TokenFormatId.StyleX,
	canImport: false,
	canExport: true,
	export(set) {
		return `import { defineVars } from "@stylexjs/stylex";\n\n${Object.entries(set.groups)
			.map(
				([group, values]) =>
					`export const ${group} = defineVars({\n${Object.entries(values)
						.map(([key, value]) => `\t${JSON.stringify(key)}: ${JSON.stringify(value)},`)
						.join("\n")}\n});`,
			)
			.join("\n\n")}\n`;
	},
};
