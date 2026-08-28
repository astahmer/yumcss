import { createTokenSet, exportNested, putToken } from "../token-format-support.ts";
import type { TokenFormatAdapter, TokenSet } from "../token-format-contracts.ts";

const walk = (node: unknown, path: string[], out: TokenSet): void => {
	if (typeof node !== "object" || node === null) return;
	const record = node as Record<string, unknown>;
	if (typeof record.$value === "string") {
		putToken(out, path[0] ?? "misc", path.slice(1).join("-"), record.$value);
		return;
	}
	for (const [key, child] of Object.entries(record)) walk(child, [...path, key], out);
};

export const dtcgTokenFormat: TokenFormatAdapter = {
	schema: "pandwind.token-format/1",
	id: "dtcg",
	canImport: true,
	canExport: true,
	importText(text) {
		const out = createTokenSet();
		walk(JSON.parse(text), [], out);
		return out;
	},
	export(set) {
		return exportNested(set.groups, (value) => ({ $value: value }));
	},
};
