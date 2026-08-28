import { createTokenSet, putToken, exportNested } from "../token-format-support.ts";
import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenSet,
} from "../token-format-contracts.ts";
const walk = (node: unknown, path: string[], out: TokenSet): void => {
	if (typeof node !== "object" || node === null) return;
	const value = (node as { value?: unknown }).value;
	if (typeof value === "string") {
		putToken(out, path[0] ?? "misc", path.slice(1).join("-"), value);
		return;
	}
	for (const [key, child] of Object.entries(node)) walk(child, [...path, key], out);
};
export const styleDictionaryTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: TokenFormatId.StyleDictionary,
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		walk(JSON.parse(text), [], out);
		return out;
	},
	export(set) {
		return exportNested(set.groups, (value) => ({
			value,
			...(/^#|^rgb|^hsl/i.test(value) ? { type: "color" } : {}),
		}));
	},
};
