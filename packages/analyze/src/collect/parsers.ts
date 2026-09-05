/** Pure parsers for generated artifacts — unit-tested, no I/O. */

import type { ThemeVar, TokenSection, UtilityUnion } from "./types.ts";

/**
 * Parse `@theme { --name: value; }` lines from a generated bridge document.
 * Non-theme content (override rules etc.) is ignored.
 */
/**
 * Parse `@theme [modifier] { --name: value; }` blocks from any css source.
 * Handles multiple blocks, modifiers (`inline`, `default`, `static`, …),
 * brace-matched bodies (the old single-block index scan missed every file
 * whose block wasn't literally `@theme {` on one line).
 */
export const parseThemeVars = (bridgeCss: string): Array<ThemeVar> => {
	const vars: Array<ThemeVar> = [];
	const seen = new Set<string>();
	for (const header of bridgeCss.matchAll(/@theme[^{]*\{/g)) {
		const open = header.index! + header[0].length - 1;
		let depth = 0;
		let end = bridgeCss.length;
		for (let i = open; i < bridgeCss.length; i++) {
			if (bridgeCss[i] === "{") depth++;
			else if (bridgeCss[i] === "}") {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		const body = bridgeCss.slice(open + 1, end);
		for (const line of body.split("\n")) {
			const match = /^\s*(--[\w-]+)\s*:\s*(.+?);?\s*$/.exec(line);
			if (match !== null && !seen.has(match[1]!)) {
				seen.add(match[1]!);
				vars.push({ name: match[1]!, value: match[2]! });
			}
		}
	}
	return vars;
};

/**
 * Parse flat CSS custom-property scopes such as `[data-theme="dark"] {
 * --color-surface: #111; }`. The selector is preserved verbatim: theme
 * names are project policy, while the inspector only needs the CSS cascade
 * boundary. Blocks containing ordinary declarations are ignored so a
 * component rule cannot be mistaken for a theme scope.
 */
export const parseThemeScopes = (css: string): Array<ThemeVar> => {
	const vars: Array<ThemeVar> = [];
	for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selector = match[1]?.trim();
		const body = match[2] ?? "";
		if (selector === undefined || selector === "" || selector.startsWith("@")) continue;
		const declarations = body
			.split(";")
			.map((declaration) => declaration.trim())
			.filter((declaration) => declaration !== "");
		if (declarations.length === 0) continue;
		const parsed = declarations.map((declaration) =>
			/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/.exec(declaration),
		);
		if (parsed.some((declaration) => declaration === null)) continue;
		for (const declaration of parsed) {
			if (declaration === null) continue;
			vars.push({ name: declaration[1]!, value: declaration[2]!, scope: selector });
		}
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
/**
 * Count bridge property groups and leaf mappings. The generated bridge has
 * two shapes: the pretty-printed multi-line layout and the current
 * single-line `as const` export. For the single-line layout the stats are
 * derived from balanced-brace body scans instead of line shapes.
 */
export const parseBridgeStats = (source: string): { properties: number; mappings: number } => {
	const properties = [...source.matchAll(/^\t([A-Za-z-]+): \{/gm)].length;
	const mappings = [...source.matchAll(/^\t\t"/gm)].length;
	if (properties > 0) return { properties, mappings };

	// Single-line `as const` export: body-scan the bridge literal.
	const anchor = source.indexOf("export const bridge =");
	if (anchor === -1) return { properties: 0, mappings: 0 };
	const open = source.indexOf("{", anchor);
	if (open === -1) return { properties: 0, mappings: 0 };
	let depth = 0;
	let end = source.length;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	const body = source.slice(open + 1, end);
	// Top-level property groups = depth-1 keys; mappings = leaf string pairs.
	const perProperty = body.split(/(?<=\}),\s*"[\w$-]+":\s*\{/);
	const counted = perProperty.map((section) => ({
		mappings: [...section.matchAll(/"(?:[^"\\]|\\.)*":\s*"(?:[^"\\]|\\.)*"/g)].length,
	}));
	return {
		properties: perProperty.length,
		mappings: counted.reduce((sum, c) => sum + c.mappings, 0),
	};
};

/**
 * Bucket a @theme custom-property name into its preview category.
 * Covers the Tailwind v4 namespace conventions the example preset emits.
 */
export type ThemeVarCategory =
	| "color"
	| "font-size"
	| "font-weight"
	| "font-family"
	| "tracking"
	| "leading"
	| "radius"
	| "shadow"
	| "spacing"
	| "other";

export const categorizeThemeVar = (name: string): ThemeVarCategory => {
	if (name.startsWith("--color-")) return "color";
	if (name.startsWith("--text-")) return "font-size";
	if (name.startsWith("--font-weight-")) return "font-weight";
	if (name.startsWith("--font-")) return "font-family";
	if (name.startsWith("--tracking-")) return "tracking";
	if (name.startsWith("--leading-")) return "leading";
	if (name.startsWith("--radius-")) return "radius";
	if (name.startsWith("--shadow-")) return "shadow";
	if (name.startsWith("--spacing")) return "spacing";
	return "other";
};

export const groupThemeVars = (
	vars: Array<ThemeVar>,
): Record<ThemeVarCategory, Array<ThemeVar>> => {
	const out = {
		color: [],
		"font-size": [],
		"font-weight": [],
		"font-family": [],
		tracking: [],
		leading: [],
		radius: [],
		shadow: [],
		spacing: [],
		other: [],
	} as Record<ThemeVarCategory, Array<ThemeVar>>;
	for (const v of vars) out[categorizeThemeVar(v.name)].push(v);
	return out;
};

const CONDITION_MARKER = " ⛭ condition-bound";

/**
 * Split a flattened token entry back into its parts: condition-bound
 * entries carry a JSON payload before the marker; plain values pass
 * through untouched.
 */
export const splitTokenValue = (
	value: string,
): { conditionBound: boolean; json: Record<string, string> | null; raw: string } => {
	if (!value.endsWith(CONDITION_MARKER)) {
		return { conditionBound: false, json: null, raw: value };
	}
	const jsonPart = value.slice(0, -CONDITION_MARKER.length);
	try {
		return {
			conditionBound: true,
			json: JSON.parse(jsonPart) as Record<string, string>,
			raw: value,
		};
	} catch {
		// truncated payload — surface what we have
		return { conditionBound: true, json: null, raw: jsonPart };
	}
};

/**
 * Follow `$name` references through a raw-token lookup until a literal
 * value is reached (`$green-500` -> `#60A3BC`). Cycles and unknown refs
 * terminate the chain; the starting value is always chain[0].
 */
export const resolveChain = (value: string, lookup: ReadonlyMap<string, string>): Array<string> => {
	const chain = [value];
	const seen = new Set([value]);
	let current = value;
	while (current.startsWith("$")) {
		const next = lookup.get(current);
		if (next === undefined || seen.has(next)) break;
		seen.add(next);
		chain.push(next);
		current = next;
	}
	return chain;
};
