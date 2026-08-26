/**
 * Token-config conversions (plans/022 follow-up): a normalized TokenSet IR
 * with importers/exporters for the systems design systems actually store
 * tokens in:
 *
 *   DTCG JSON  <->  tailwind @theme css  <->  definePreset (pandwind)
 *                                              <->  panda.config tokens
 *
 * The set is deliberately flat per group (`colors["blue-500"] -> "#3182ce"`)
 * — every target format nests/flattens differently, and flat is the honest
 * common denominator. Adding a config system = one importer + one exporter.
 */
import { pathToFileURL } from "node:url";

export interface TokenSet {
	/** group -> token key -> resolved value. */
	groups: Record<string, Record<string, string>>;
}

/** Prefix map for tailwind @theme custom properties. */
const THEME_PREFIX_TO_GROUP: Record<string, string> = {
	color: "colors",
	spacing: "spacing",
	radius: "radii",
	text: "fontSizes",
	"font-weight": "fontWeights",
	font: "fonts",
	leading: "lineHeights",
	tracking: "letterSpacings",
};
const GROUP_TO_THEME_PREFIX: Record<string, string> = Object.fromEntries(
	Object.entries(THEME_PREFIX_TO_GROUP).map(([prefix, group]) => [group, prefix]),
);

/* ------------------------------------------------------------------ */
/* importers                                                           */
/* ------------------------------------------------------------------ */

function walkDtcg(node: unknown, path: string[], out: TokenSet): void {
	if (typeof node !== "object" || node === null) return;
	const record = node as Record<string, unknown>;
	const rawValue = (record as { $value?: unknown }).$value;
	if (typeof rawValue === "string") {
		const group = path[0] ?? "misc";
		const key = path.slice(1).join("-");
		const groups = out.groups[group] ?? (out.groups[group] = {});
		if (groups[key] === undefined) groups[key] = rawValue;
		return;
	}
	for (const [segment, child] of Object.entries(record)) {
		walkDtcg(child, [...path, segment], out);
	}
}

export function fromDtcgJson(text: string): TokenSet {
	const out: TokenSet = { groups: {} };
	walkDtcg(JSON.parse(text), [], out);
	return out;
}

export function fromThemeCss(text: string): TokenSet {
	const out: TokenSet = { groups: {} };
	for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
		const rawName = match[1]!;
		const dot = rawName.indexOf("-");
		const prefix = dot === -1 ? rawName : rawName.slice(0, dot);
		const rest = dot === -1 ? "" : rawName.slice(dot + 1);
		const group = THEME_PREFIX_TO_GROUP[prefix] ?? prefix;
		const groups = out.groups[group] ?? (out.groups[group] = {});
		if (groups[rest] === undefined) groups[rest] = match[2]!.trim();
	}
	return out;
}

type AnyModule = Record<string, unknown>;

async function importModule(path: string): Promise<AnyModule> {
	return (await import(pathToFileURL(path).href)) as AnyModule;
}

/** Find the exported object holding `.tokens` (definePreset output shape). */
function findPresetTokens(mod: AnyModule): Record<string, Record<string, string>> | null {
	for (const exported of Object.values(mod)) {
		if (typeof exported !== "object" || exported === null) continue;
		const tokens = (exported as { tokens?: unknown }).tokens;
		if (typeof tokens === "object" && tokens !== null) {
			return tokens as Record<string, Record<string, string>>;
		}
	}
	return null;
}

function flattenNested(
	node: Record<string, unknown>,
	prefix: string[],
	out: Record<string, string>,
): void {
	for (const [key, value] of Object.entries(node)) {
		if (typeof value === "string") {
			out[[...prefix, key].join("-")] = value;
		} else if (typeof value === "object" && value !== null) {
			const leaf = (value as Record<string, unknown>).value;
			if (typeof leaf === "string") {
				out[[...prefix, key].join("-")] = leaf;
			} else {
				flattenNested(value as Record<string, unknown>, [...prefix, key], out);
			}
		}
	}
}

export async function fromPandaConfig(path: string): Promise<TokenSet> {
	const mod = await importModule(path);
	const config = (mod.default ?? Object.values(mod)[0]) as
		| { theme?: { extend?: { tokens?: unknown }; tokens?: unknown } }
		| undefined;
	const raw = config?.theme?.extend?.tokens ?? config?.theme?.tokens ?? null;
	if (raw === null || typeof raw !== "object") {
		throw new Error(`codemod tokens: no theme tokens found in ${path}`);
	}
	const out: TokenSet = { groups: {} };
	for (const [group, values] of Object.entries(raw as Record<string, unknown>)) {
		const flat: Record<string, string> = {};
		if (typeof values === "object" && values !== null) {
			flattenNested(values as Record<string, unknown>, [], flat);
		}
		out.groups[group] = flat;
	}
	return out;
}

export async function fromDefinePreset(path: string): Promise<TokenSet> {
	const mod = await importModule(path);
	const tokens = findPresetTokens(mod);
	if (tokens === null) throw new Error(`codemod tokens: no preset with .tokens found in ${path}`);
	const out: TokenSet = { groups: {} };
	for (const [group, values] of Object.entries(tokens)) {
		const flat: Record<string, string> = {};
		if (typeof values === "object" && values !== null) {
			flattenNested(values as Record<string, unknown>, [], flat);
		}
		out.groups[group] = flat;
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* exporters                                                           */
/* ------------------------------------------------------------------ */

export function toDtcgJson(set: TokenSet): string {
	const root: Record<string, unknown> = {};
	for (const [group, values] of Object.entries(set.groups)) {
		const groupNode: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			let node = groupNode;
			const segments = key.split("-");
			for (const segment of segments.slice(0, -1)) {
				node[segment] = (node[segment] as Record<string, unknown>) ?? {};
				node = node[segment] as Record<string, unknown>;
			}
			node[segments[segments.length - 1]!] = { $value: value };
		}
		root[group] = groupNode;
	}
	return `${JSON.stringify(root, null, "\t")}\n`;
}

export function toThemeCss(set: TokenSet): string {
	const lines: string[] = ["@theme {"];
	for (const [group, values] of Object.entries(set.groups)) {
		const prefix = GROUP_TO_THEME_PREFIX[group] ?? group;
		for (const [key, value] of Object.entries(values)) {
			lines.push(`\t--${prefix}-${key}: ${value};`);
		}
	}
	lines.push("}");
	return `${lines.join("\n")}\n`;
}

function renderTokenNode(node: Record<string, unknown>, indent: string): string {
	return `{\n${Object.entries(node)
		.map(([k, v]) =>
			typeof v === "object" && v !== null && !("value" in v)
				? `${indent}\t${JSON.stringify(k)}: ${renderTokenNode(v as Record<string, unknown>, `${indent}\t`)},`
				: `${indent}\t${JSON.stringify(k)}: { value: ${JSON.stringify((v as { value: unknown }).value)} },`,
		)
		.join("\n")}\n${indent}}`;
}

function renderTokenTree(values: Record<string, string>): string {
	const tree: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values)) {
		let node = tree;
		const segments = key.split("-");
		for (const segment of segments.slice(0, -1)) {
			node[segment] = (node[segment] as Record<string, unknown>) ?? {};
			node = node[segment] as Record<string, unknown>;
		}
		node[segments[segments.length - 1]!] = { value };
	}
	return renderTokenNode(tree, "\t\t");
}

/** Panda-style nested tokens with `{ value }` leaves, as a JS object literal. */
export function toPandaConfigSnippet(set: TokenSet): string {
	const groupLines = Object.entries(set.groups)
		.map(([group, values]) => `\t\t${JSON.stringify(group)}: ${renderTokenTree(values)},`)
		.join("\n");
	return `// generated by pandwind-codemod tokens\nexport const tokens = {\n${groupLines}\n};\n`;
}

/** pandwind definePreset-compatible snippet using defineTokens. */
export function toDefinePresetSnippet(set: TokenSet): string {
	const groupLines = Object.entries(set.groups)
		.map(([group, values]) => {
			const body = Object.entries(values)
				.map(([k, v]) => `\t\t${JSON.stringify(k)}: ${JSON.stringify(v)},`)
				.join("\n");
			return `\t\t${JSON.stringify(group)}: {\n${body}\n\t\t},`;
		})
		.join("\n");
	return [
		'import { defineTokens } from "pandwind/preset";',
		"",
		"export const tokens = defineTokens({",
		groupLines,
		"});",
		"",
	].join("\n");
}

/* ------------------------------------------------------------------ */
/* Style Dictionary v4                                                 */
/* ------------------------------------------------------------------ */

const HEX_OR_RGB = /^#|^rgb|^hsl/i;

function walkStyleDictionary(node: unknown, path: string[], out: TokenSet): void {
	if (typeof node !== "object" || node === null) return;
	const record = node as Record<string, unknown>;
	const rawValue = (record as { value?: unknown }).value;
	if (typeof rawValue === "string") {
		const group = path[0] ?? "misc";
		const key = path.slice(1).join("-");
		const groups = out.groups[group] ?? (out.groups[group] = {});
		if (groups[key] === undefined) groups[key] = rawValue;
		return;
	}
	for (const [segment, child] of Object.entries(record)) {
		walkStyleDictionary(child, [...path, segment], out);
	}
}

/** Style Dictionary v4 JSON — leaves are `{ value, type? }` objects. */
export function importStyleDictionary(text: string): TokenSet {
	const out: TokenSet = { groups: {} };
	walkStyleDictionary(JSON.parse(text), [], out);
	return out;
}

/** Inverse: nests keys by `-`, infers `type: "color"` for hex/rgb values. */
export function exportStyleDictionary(set: TokenSet): string {
	const root: Record<string, unknown> = {};
	for (const [group, values] of Object.entries(set.groups)) {
		const groupNode: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			let node = groupNode;
			const segments = key.split("-");
			for (const segment of segments.slice(0, -1)) {
				node[segment] = (node[segment] as Record<string, unknown>) ?? {};
				node = node[segment] as Record<string, unknown>;
			}
			const leaf: Record<string, string> = { value };
			if (HEX_OR_RGB.test(value)) leaf.type = "color";
			node[segments[segments.length - 1]!] = leaf;
		}
		root[group] = groupNode;
	}
	return `${JSON.stringify(root, null, "\t")}\n`;
}

/* ------------------------------------------------------------------ */
/* Figma Tokens plugin JSON                                            */
/* ------------------------------------------------------------------ */

const FIGMA_TYPE_TO_GROUP: Record<string, string> = {
	color: "colors",
	spacing: "spacing",
	borderRadius: "radii",
	fontSizes: "fontSizes",
	fontWeights: "fontWeights",
};
const GROUP_TO_FIGMA_TYPE: Record<string, string> = {
	colors: "color",
	spacing: "spacing",
	radii: "borderRadius",
	fontSizes: "fontSizes",
	fontWeights: "fontWeights",
};

function walkFigma(node: unknown, path: string[], out: TokenSet): void {
	if (typeof node !== "object" || node === null) return;
	const record = node as Record<string, unknown>;
	const rawValue = (record as { value?: unknown }).value;
	const rawType = (record as { type?: unknown }).type;
	if (typeof rawValue === "string") {
		const mapped = typeof rawType === "string" ? FIGMA_TYPE_TO_GROUP[rawType] : undefined;
		const group = mapped ?? path[0] ?? "misc";
		// The top-level segment is the file's container node, not part of the
		// token name (the group already came from the leaf's `type`).
		const key = path.slice(1).join("-");
		const groups = out.groups[group] ?? (out.groups[group] = {});
		if (groups[key] === undefined) groups[key] = rawValue;
		return;
	}
	for (const [segment, child] of Object.entries(record)) {
		walkFigma(child, [...path, segment], out);
	}
}

/** Figma Tokens plugin JSON — leaves `{ value, type }`, type maps the group. */
export function importFigmaTokens(text: string): TokenSet {
	const out: TokenSet = { groups: {} };
	walkFigma(JSON.parse(text), [], out);
	return out;
}

function figmaTypeFor(group: string): string {
	return GROUP_TO_FIGMA_TYPE[group] ?? group;
}

/** Inverse: `{ value, type }` leaves with the type always set. */
export function exportFigmaTokens(set: TokenSet): string {
	const root: Record<string, unknown> = {};
	for (const [group, values] of Object.entries(set.groups)) {
		const groupNode: Record<string, unknown> = {};
		const type = figmaTypeFor(group);
		for (const [key, value] of Object.entries(values)) {
			let node = groupNode;
			const segments = key.split("-");
			for (const segment of segments.slice(0, -1)) {
				node[segment] = (node[segment] as Record<string, unknown>) ?? {};
				node = node[segment] as Record<string, unknown>;
			}
			node[segments[segments.length - 1]!] = { value, type };
		}
		root[group] = groupNode;
	}
	return `${JSON.stringify(root, null, "\t")}\n`;
}

/* ------------------------------------------------------------------ */
/* flat :root custom properties                                        */
/* ------------------------------------------------------------------ */

/** Balanced-brace extraction of every `:root { ... }` body. */
function rootBlocks(text: string): string[] {
	const blocks: string[] = [];
	const regex = /:root\s*\{/g;
	for (const match of text.matchAll(regex)) {
		const open = (match.index ?? 0) + match[0].length - 1;
		let depth = 0;
		for (let i = open; i < text.length; i++) {
			if (text[i] === "{") depth++;
			else if (text[i] === "}") {
				depth--;
				if (depth === 0) {
					blocks.push(text.slice(open + 1, i));
					break;
				}
			}
		}
	}
	return blocks;
}

/**
 * Custom properties declared in `:root` blocks only, using the @theme
 * prefix mapping (`--color-blue-500` -> colors["blue-500"]).
 */
export function importRootCss(text: string): TokenSet {
	const out: TokenSet = { groups: {} };
	for (const block of rootBlocks(text)) {
		for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
			const rawName = match[1]!;
			const dot = rawName.indexOf("-");
			const prefix = dot === -1 ? rawName : rawName.slice(0, dot);
			const rest = dot === -1 ? "" : rawName.slice(dot + 1);
			const group = THEME_PREFIX_TO_GROUP[prefix] ?? prefix;
			const groups = out.groups[group] ?? (out.groups[group] = {});
			if (groups[rest] === undefined) groups[rest] = match[2]!.trim();
		}
	}
	return out;
}

/** Flat custom properties in a single `:root` block. */
export function exportRootCss(set: TokenSet): string {
	const lines: string[] = [":root {"];
	for (const [group, values] of Object.entries(set.groups)) {
		const prefix = GROUP_TO_THEME_PREFIX[group] ?? group;
		for (const [key, value] of Object.entries(values)) {
			lines.push(`\t--${prefix}-${key}: ${value};`);
		}
	}
	lines.push("}");
	return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ */
/* stylex defineVars (export-only)                                     */
/* ------------------------------------------------------------------ */

/**
 * One `defineVars({...})` export per group. Importer intentionally NOT
 * provided — stylex configs are code consumed by the stylex compiler, and
 * no consumer asked for that direction yet.
 */
export function exportStylexVars(set: TokenSet): string {
	const blocks = Object.entries(set.groups)
		.map(([group, values]) => {
			const body = Object.entries(values)
				.map(([k, v]) => `\t${JSON.stringify(k)}: ${JSON.stringify(v)},`)
				.join("\n");
			return `export const ${group} = defineVars({\n${body}\n});`;
		})
		.join("\n\n");
	return `import { defineVars } from "@stylexjs/stylex";\n\n${blocks}\n`;
}
