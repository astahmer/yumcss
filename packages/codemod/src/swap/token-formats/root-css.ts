import { createTokenSet, putToken } from "../token-format-support.ts";
import type { TokenFormatAdapter } from "../token-format-contracts.ts";
const prefixes: Record<string, string> = {
	color: "colors",
	spacing: "spacing",
	radius: "radii",
	text: "fontSizes",
	"font-weight": "fontWeights",
	font: "fonts",
	leading: "lineHeights",
	tracking: "letterSpacings",
};
const reverse = Object.fromEntries(Object.entries(prefixes).map(([key, value]) => [value, key]));
const blocks = (text: string): string[] =>
	[...text.matchAll(/:root\s*\{/g)].flatMap((match) => {
		const open = (match.index ?? 0) + match[0].length - 1;
		let depth = 0;
		for (let index = open; index < text.length; index++) {
			if (text[index] === "{") depth++;
			else if (text[index] === "}" && --depth === 0) return [text.slice(open + 1, index)];
		}
		return [];
	});
export const rootCssTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: "rootcss",
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		for (const block of blocks(text))
			for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
				const raw = match[1]!;
				const index = raw.indexOf("-");
				const prefix = index === -1 ? raw : raw.slice(0, index);
				putToken(
					out,
					prefixes[prefix] ?? prefix,
					index === -1 ? "" : raw.slice(index + 1),
					match[2]!.trim(),
				);
			}
		return out;
	},
	export(set) {
		const lines = [":root {"];
		for (const [group, values] of Object.entries(set.groups))
			for (const [key, value] of Object.entries(values))
				lines.push(`\t--${reverse[group] ?? group}-${key}: ${value};`);
		lines.push("}");
		return `${lines.join("\n")}\n`;
	},
};
