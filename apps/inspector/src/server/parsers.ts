/** Pure parsers for generated artifacts — unit-tested, no I/O. */

import type { ThemeVar, TokenSection, UtilityUnion } from "../types.ts";

/**
 * Parse `@theme { --name: value; }` lines from a generated bridge document.
 * Non-theme content (override rules etc.) is ignored.
 */
export const parseThemeVars = (bridgeCss: string): Array<ThemeVar> => {
	const start = bridgeCss.indexOf("@theme {");
	if (start === -1) return [];
	const open = bridgeCss.indexOf("{", start);
	const close = bridgeCss.indexOf("\n}", open);
	const body = bridgeCss.slice(open + 1, close === -1 ? undefined : close);
	const vars: Array<ThemeVar> = [];
	for (const line of body.split("\n")) {
		const match = /^\s*(--[\w-]+)\s*:\s*(.+?);?\s*$/.exec(line);
		if (match !== null) vars.push({ name: match[1]!, value: match[2]! });
	}
	return vars;
};

/**
 * Summarize the per-key literal unions in a generated types.d.ts.
 * Lines look like `type TextColorValue = WithOpacityModifiers<"a" | "b">;`
 * or `type XValue = "a" | "b";`. The `(string & {})` escape hatch is
 * reported as `openEnded` instead of counted.
 */
export const parseUtilityUnions = (dts: string): Array<UtilityUnion> => {
	const out: Array<UtilityUnion> = [];
	for (const match of dts.matchAll(/^type (\w+)Value = (.+?);$/gm)) {
		const key = match[1]!;
		const body = match[2]!;
		const values = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
		out.push({
			key,
			count: values.length,
			sample: values.slice(0, 8),
			openEnded: body.includes("(string & {})"),
		});
	}
	return out.toSorted((a, b) => b.count - a.count);
};

/**
 * Flatten preset theme token groups into display sections. String values
 * pass through; object values (condition-bound tokens) render as compact
 * JSON with a marker so the UI can badge them.
 */
export const flattenTokenGroups = (
	groups: Record<string, Record<string, unknown>>,
	labels?: Record<string, string>,
): Array<TokenSection> => {
	return Object.entries(groups).map(([group, entries]) => ({
		id: group,
		label: labels?.[group] ?? group,
		entries: Object.entries(entries).map(([name, value]) => ({
			name,
			value:
				typeof value === "string"
					? value
					: (JSON.stringify(value) + " ⛭ condition-bound").slice(0, 120),
		})),
	}));
};

/** Count top-level property groups and leaf mappings in a generated bridge. */
export const parseBridgeStats = (source: string): { properties: number; mappings: number } => {
	const properties = [...source.matchAll(/^\t([A-Za-z-]+): \{/gm)].length;
	const mappings = [...source.matchAll(/^\t\t"/gm)].length;
	return { properties, mappings };
};
