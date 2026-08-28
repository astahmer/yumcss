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
const reverse = Object.fromEntries(
	Object.entries(prefixes).map(([prefix, group]) => [group, prefix]),
);
export const themeTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: "theme",
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
			const raw = match[1]!;
			const index = raw.indexOf("-");
			putToken(
				out,
				prefixes[index === -1 ? raw : raw.slice(0, index)] ??
					(index === -1 ? raw : raw.slice(0, index)),
				index === -1 ? "" : raw.slice(index + 1),
				match[2]!.trim(),
			);
		}
		return out;
	},
	export(set) {
		const lines = ["@theme {"];
		for (const [group, values] of Object.entries(set.groups))
			for (const [key, value] of Object.entries(values))
				lines.push(`\t--${reverse[group] ?? group}-${key}: ${value};`);
		lines.push("}");
		return `${lines.join("\n")}\n`;
	},
};
