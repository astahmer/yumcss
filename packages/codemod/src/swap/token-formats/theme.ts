import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenFormatLoss,
} from "../token-format-contracts.ts";
import {
	createScalarTokenImport,
	cssScopedTokenLosses,
	putScalarTokenWithLoss,
	scalarFormatOutput,
	scalarImportToDocument,
	type ScalarTokenImport,
} from "../token-format-support.ts";

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

const serialize = (groups: ScalarTokenImport): string => {
	const lines = ["@theme {"];
	for (const [group, values] of Object.entries(groups))
		for (const [key, value] of Object.entries(values))
			lines.push(`\t--${reverse[group] ?? group}-${key}: ${value};`);
	lines.push("}");
	return `${lines.join("\n")}\n`;
};

export const themeTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/2",
	id: TokenFormatId.Theme,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "partial",
		export: "partial",
		preserves: ["static scalar values", "recognized theme prefixes"],
		mayLose: [
			"token metadata",
			"structured values",
			"references",
			"resolver contexts",
			"unknown at-rules",
		],
	},
	importText(text) {
		const tokens = createScalarTokenImport();
		const losses: TokenFormatLoss[] = [...cssScopedTokenLosses(text)];
		for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
			const raw = match[1]!;
			const index = raw.indexOf("-");
			putScalarTokenWithLoss(
				tokens,
				prefixes[index === -1 ? raw : raw.slice(0, index)] ??
					(index === -1 ? raw : raw.slice(0, index)),
				index === -1 ? "" : raw.slice(index + 1),
				match[2]!.trim(),
				losses,
				`/css/${raw}`,
			);
		}
		return scalarImportToDocument(TokenFormatId.Theme, tokens, text, losses);
	},
	export: (document) => scalarFormatOutput(document, serialize),
};
