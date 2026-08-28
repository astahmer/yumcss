import { createTokenSet, putToken, exportNested } from "../token-format-support.ts";
import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenSet,
} from "../token-format-contracts.ts";
const types: Record<string, string> = {
	color: "colors",
	spacing: "spacing",
	borderRadius: "radii",
	fontSizes: "fontSizes",
	fontWeights: "fontWeights",
};
const reverse = Object.fromEntries(Object.entries(types).map(([key, value]) => [value, key]));
const walk = (node: unknown, path: string[], out: TokenSet): void => {
	if (typeof node !== "object" || node === null) return;
	const record = node as { value?: unknown; type?: unknown };
	if (typeof record.value === "string") {
		putToken(
			out,
			types[String(record.type)] ?? path[0] ?? "misc",
			path.slice(1).join("-"),
			record.value,
		);
		return;
	}
	for (const [key, child] of Object.entries(node)) walk(child, [...path, key], out);
};
export const figmaTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: TokenFormatId.Figma,
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		walk(JSON.parse(text), [], out);
		return out;
	},
	export(set) {
		return exportNested(set.groups, (value, group) => ({ value, type: reverse[group] ?? group }));
	},
};
