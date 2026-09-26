import {
	createScalarTokenImport,
	cssScopedTokenLosses,
	putScalarTokenWithLoss,
	scalarFormatOutput,
	scalarImportToDocument,
	type ScalarTokenImport,
} from "../token-format-support.ts";
import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenFormatLoss,
} from "../token-format-contracts.ts";
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
const blocks = (text: string): Array<{ readonly start: number; readonly end: number }> =>
	[...text.matchAll(/:root\s*\{/g)].flatMap((match) => {
		const open = (match.index ?? 0) + match[0].length - 1;
		let depth = 0;
		for (let index = open; index < text.length; index++) {
			if (text[index] === "{") depth++;
			else if (text[index] === "}" && --depth === 0) return [{ start: open + 1, end: index }];
		}
		return [];
	});

const serialize = (groups: ScalarTokenImport): string => {
	const lines = [":root {"];
	for (const [group, values] of Object.entries(groups))
		for (const [key, value] of Object.entries(values))
			lines.push(`\t--${reverse[group] ?? group}-${key}: ${value};`);
	lines.push("}");
	return `${lines.join("\n")}\n`;
};

export const rootCssTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/2",
	id: TokenFormatId.RootCss,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "partial",
		export: "partial",
		preserves: ["root custom properties", "static CSS values"],
		mayLose: [
			"CSS cascade",
			"media and selector scope",
			"comments",
			"token metadata",
			"resolver contexts",
		],
	},
	importText(text) {
		const tokens = createScalarTokenImport();
		const rootBlocks = blocks(text);
		const losses: TokenFormatLoss[] = [...cssScopedTokenLosses(text)];
		for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
			const declaration = match.index ?? 0;
			if (!rootBlocks.some((block) => declaration >= block.start && declaration < block.end)) {
				losses.push({
					path: `/css/${match[1]}`,
					feature: "non-root custom property",
					reason: "root CSS importer preserves only declarations inside :root blocks",
				});
				continue;
			}
			const raw = match[1]!;
			const index = raw.indexOf("-");
			const prefix = index === -1 ? raw : raw.slice(0, index);
			putScalarTokenWithLoss(
				tokens,
				prefixes[prefix] ?? prefix,
				index === -1 ? "" : raw.slice(index + 1),
				match[2]!.trim(),
				losses,
				`/css/${raw}`,
			);
		}
		return scalarImportToDocument(TokenFormatId.RootCss, tokens, text, losses);
	},
	export: (document) => scalarFormatOutput(document, serialize),
};
