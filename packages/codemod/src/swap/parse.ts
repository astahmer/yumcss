/**
 * Swap parsers (plans/022): source-API call sites -> SwapIR.
 *
 * Three shapes are recognized, each matched OUTSIDE comments and string
 * literals via the oxc mask (`computeExcludedRanges`) — closing the gap
 * where only styled-components had context protection:
 *
 * - `tw({ key: value, hover: {...} })`  — resolved offline through the
 *   generated metadata: key -> utility class (same rules as tw/compile.ts),
 *   class -> {property, value} through the inverted bridge. Bridge misses
 *   become `unknown-value` residuals; the call site is left untouched.
 * - `css.class({...})` / `css({...})`    — flat camelCase literals with
 *   `_condition` nesting; values stay AS WRITTEN (the engine resolves
 *   preset tokens at runtime; no app-preset properties config is loaded).
 * - design-vocabulary `css.class({ $frame: ... })` — lowered offline via
 *   resolveDesignStyle + flattie, so entries carry concrete values.
 */
import type { PandwindMeta } from "../meta.ts";
import { UTILITY_SUBKEYS } from "../../../pandwind/src/tw/compile.ts";
import { flattenStyle } from "../../../pandwind/src/lib/utils.ts";
import { resolveDesignStyle } from "../../../pandwind/src/design/resolve.ts";
import { examplePreset } from "../../../pandwind/src/preset/example-preset.ts";
import { matchBlock } from "../sources.ts";
import type { SwapIR } from "./ir.ts";

/* ------------------------------------------------------------------ */
/* literal object parser                                               */
/* ------------------------------------------------------------------ */

export interface LiteralObject {
	/** Insertion-ordered keys. */
	keys: Array<{ key: string; value: LitValue }>;
}

export type LitValue = string | number | boolean | Array<LitValue> | LiteralObject;

/**
 * Parse a JS object-literal body into ordered literal entries. Returns null
 * on anything non-literal: identifiers, template literals (even without
 * substitutions — conservative), spreads, functions. Comments are skipped.
 */
export function parseObjectLiteral(body: string): LiteralObject | null {
	const entries: Array<{ key: string; value: LitValue }> = [];
	let i = 0;
	const skipWsAndComments = (): void => {
		for (;;) {
			while (i < body.length && /\s/.test(body[i]!)) i++;
			if (body.startsWith("//", i)) {
				while (i < body.length && body[i] !== "\n") i++;
				continue;
			}
			if (body.startsWith("/*", i)) {
				const end = body.indexOf("*/", i);
				if (end === -1) i = body.length;
				else i = end + 2;
				continue;
			}
			break;
		}
	};
	const parseString = (): string | null => {
		const quote = body[i];
		if (quote !== '"' && quote !== "'" && quote !== "`") return null;
		i++;
		let out = "";
		while (i < body.length) {
			const ch = body[i]!;
			if (ch === "\\" && i + 1 < body.length) {
				out += body.slice(i, i + 2);
				i += 2;
				continue;
			}
			if (ch === quote) {
				i++;
				return out;
			}
			out += ch;
			i++;
		}
		return null;
	};
	const parseValue = (): LitValue | "dynamic" | null => {
		skipWsAndComments();
		if (i >= body.length) return null;
		const ch = body[i]!;
		if (ch === '"' || ch === "'" || ch === "`") return parseString();
		if (ch === "{" || ch === "[") return parseContainer();
		const start = i;
		while (i < body.length && /[0-9]/.test(body[i]!)) i++;
		if (i > start) return Number(body.slice(start, i));
		if (body.startsWith("true", i)) {
			i += 4;
			return true;
		}
		if (body.startsWith("false", i)) {
			i += 5;
			return false;
		}
		if (body.startsWith("null", i)) {
			i += 4;
			return "dynamic";
		}
		// Identifiers / template literals / anything else — dynamic.
		return "dynamic";
	};

	const parseContainer = (): LitValue | "dynamic" | null => {
		const isOpenBrace = body[i] === "{";
		i++;
		skipWsAndComments();
		if (isOpenBrace && body[i] === "}") {
			i++;
			return { keys: [] };
		}
		if (!isOpenBrace && body[i] === "]") {
			i++;
			return [];
		}
		if (isOpenBrace) {
			const obj: LiteralObject = { keys: [] };
			for (;;) {
				skipWsAndComments();
				if (i >= body.length) return null;
				if (body.startsWith("...", i)) return "dynamic"; // spread
				let key: string;
				const quote = body[i];
				if (quote === '"' || quote === "'" || quote === "`") {
					const parsed = parseString();
					if (parsed === null) return null;
					key = parsed;
				} else {
					const start = i;
					while (i < body.length && /[\w$-]/.test(body[i]!)) i++;
					key = body.slice(start, i);
				}
				if (key === "") return null;
				skipWsAndComments();
				if (body[i] !== ":") return null;
				i++;
				const value = parseValue();
				if (value === "dynamic") return "dynamic";
				if (value === null) return null;
				if (obj.keys.some((k) => k.key === key)) return "dynamic"; // duplicate key
				obj.keys.push({ key, value });
				skipWsAndComments();
				if (body[i] === ",") {
					i++;
					continue;
				}
				if (body[i] === "}") {
					i++;
					return obj;
				}
				return null;
			}
		}
		const arr: LitValue[] = [];
		for (;;) {
			skipWsAndComments();
			if (i >= body.length) return null;
			if (body.startsWith("...", i)) return "dynamic"; // spread
			const v = parseValue();
			if (v === "dynamic") return "dynamic";
			if (v === null) return null;
			arr.push(v);
			skipWsAndComments();
			if (body[i] === ",") {
				i++;
				continue;
			}
			if (body[i] === "]") {
				i++;
				return arr;
			}
			return null;
		}
	};

	// top level: the body IS the inside of `{ ... }`
	for (;;) {
		skipWsAndComments();
		if (i >= body.length) return entries.length > 0 ? { keys: entries } : null;
		if (body[i] === "...") return null;
		const quote = body[i];
		let key: string;
		if (quote === '"' || quote === "'" || quote === "`") {
			const parsed = parseString();
			if (parsed === null) return null;
			key = parsed;
		} else {
			const start = i;
			while (i < body.length && /[\w$-]/.test(body[i]!)) i++;
			key = body.slice(start, i);
			if (key === "") return null;
		}
		skipWsAndComments();
		if (body[i] !== ":") return null;
		i++;
		const value = parseValue();
		if (value === null || value === "dynamic") return null;
		if (entries.some((k) => k.key === key)) return null;
		entries.push({ key, value });
		skipWsAndComments();
		if (body[i] === ",") {
			i++;
			continue;
		}
		if (i >= body.length) return { keys: entries };
		return null;
	}
}

/* ------------------------------------------------------------------ */
/* shared helpers                                                      */
/* ------------------------------------------------------------------ */

const dashCase = (key: string): string => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const camelProp = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

/** Split a flattened `_hover___dark__prop` key: conditions outermost-first. */
function splitFlatKey(key: string): { conditions: string[]; prop: string } {
	const parts = key.split("__");
	return {
		conditions: parts.slice(0, -1).map((c) => c.replace(/^_/, "")),
		prop: parts[parts.length - 1]!,
	};
}

/** Is this tw object key a variant (recursable) rather than a utility? */
function isVariantKey(meta: PandwindMeta, key: string): boolean {
	if (meta.variants.has(key) || key === "*" || key === "**") return true;
	return /^(?:group|peer)-(?:data|aria)-\[/.test(key);
}

/* ------------------------------------------------------------------ */
/* tw() parser                                                         */
/* ------------------------------------------------------------------ */

const COMPOUND_FLEX = new Set(["col", "row", "col-reverse", "row-reverse"]);

function walkTwEntries(
	meta: PandwindMeta,
	obj: LiteralObject,
	conditions: string[],
	ir: SwapIR,
): void {
	for (const { key, value } of obj.keys) {
		if (isVariantKey(meta, key)) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				ir.residuals.push({
					kind: "dynamic",
					text: `${key}: ${formatLit(value)}`,
					hint: `variant "${key}" must nest an object`,
				});
				continue;
			}
			walkTwEntries(meta, value, [...conditions, key], ir);
			continue;
		}
		const parts = Array.isArray(value) ? value : [value];
		if (parts.some((p) => typeof p === "object")) {
			ir.residuals.push({ kind: "dynamic", text: `${key}: [...]`, hint: "nested containers" });
			continue;
		}
		const utility = UTILITY_SUBKEYS[key] ?? dashCase(key);
		const emitted: string[] = [];
		const compound = key === "flex" && parts.some((p) => COMPOUND_FLEX.has(String(p)));
		if (compound || parts.includes(true)) emitted.push(utility);
		for (const part of parts.filter((p) => typeof p !== "boolean")) {
			const str = String(part);
			emitted.push(str === "" ? utility : `${utility}-${str}`);
		}
		for (const cls of emitted) {
			const bridgeHit = meta.bridgeInverse.get(cls);
			if (bridgeHit === undefined) {
				ir.residuals.push({
					kind: "unknown-value",
					text: cls,
					hint: `tw({ ${key}: ... }) — utility "${cls}" has no bridge entry`,
				});
				continue;
			}
			ir.entries.push({
				conditions,
				prop: camelProp(bridgeHit.property),
				value: bridgeHit.value,
			});
		}
	}
}

function formatLit(value: LitValue): string {
	return typeof value === "object" ? "{...}" : String(value);
}

const TW_CALL_REGEX = /\btw\s*\(\s*\{/g;

/** Extract every literal `tw({...})` call into IR. */
export function parseTwCalls(
	source: string,
	meta: PandwindMeta,
	excluded: (start: number) => boolean,
): Array<{ start: number; end: number; ir: SwapIR }> {
	const out: Array<{ start: number; end: number; ir: SwapIR }> = [];
	for (const match of source.matchAll(TW_CALL_REGEX)) {
		const start = match.index ?? 0;
		if (excluded(start)) continue;
		const open = start + match[0].length - 1;
		const block = matchBlock(source, open);
		if (block === null) continue;
		const parsed = parseObjectLiteral(block.body);
		if (parsed === null) {
			out.push({
				start,
				end: block.end,
				ir: {
					entries: [],
					residuals: [{ kind: "dynamic", text: "tw({...})", hint: "non-literal object" }],
				},
			});
			continue;
		}
		const ir: SwapIR = { entries: [], residuals: [] };
		walkTwEntries(meta, parsed, [], ir);
		out.push({ start, end: block.end, ir });
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* css.class / css(...) literal parser                                 */
/* ------------------------------------------------------------------ */

const CSS_CALL_REGEX = /(?<![\w.])(\w+)\s*\.\s*class\s*\(\s*\{/g;
const BARE_CSS_CALL_REGEX = /(?<![\w.])css\s*\(\s*\{/g;

/** LiteralObject -> plain JS object (deep), ready for resolveDesignStyle. */
function toPlain(value: LitValue): unknown {
	if (Array.isArray(value)) return value.map((v) => toPlain(v));
	if (typeof value === "object" && value !== null) {
		const out: Record<string, unknown> = {};
		for (const { key, value: nested } of value.keys) out[key] = toPlain(nested);
		return out;
	}
	return value;
}

function flattenToIr(flat: Record<string, unknown>): SwapIR {
	const ir: SwapIR = { entries: [], residuals: [] };
	for (const [key, raw] of Object.entries(flattenStyle(flat as never))) {
		const { conditions, prop } = splitFlatKey(key);
		ir.entries.push({
			conditions,
			prop: camelProp(prop),
			value: typeof raw === "string" ? raw : (raw as string),
		});
	}
	return ir;
}

/**
 * Every `.class({...})` member call and bare `css({...})` call. The DESIGN
 * vs CSS distinction happens per call site by inspecting `$module` keys:
 * design calls are lowered via resolveDesignStyle; css calls keep authored
 * values verbatim.
 */
export function parseCssLiterals(
	source: string,
	excluded: (start: number) => boolean,
): Array<{ start: number; end: number; ir: SwapIR; design: boolean; binding: string }> {
	const out: Array<{ start: number; end: number; ir: SwapIR; design: boolean; binding: string }> =
		[];
	const scan = (regex: RegExp, binding: string, bare: boolean): void => {
		for (const match of source.matchAll(regex)) {
			const start = match.index ?? 0;
			if (excluded(start)) continue;
			const open = start + match[0].length - 1;
			const block = matchBlock(source, open);
			if (block === null) continue;
			const parsed = parseObjectLiteral(block.body);
			const bindingName = bare ? "css" : match[1]!;
			if (parsed === null) {
				out.push({
					start,
					end: block.end,
					ir: {
						entries: [],
						residuals: [
							{ kind: "dynamic", text: `${bindingName}.class({...})`, hint: "non-literal object" },
						],
					},
					design: false,
					binding: bindingName,
				});
				continue;
			}
			const style: Record<string, unknown> = {};
			for (const { key, value } of parsed.keys) style[key] = toPlain(value);
			const design = Object.keys(style).some((k) => k.startsWith("$"));
			const ir = design
				? flattenToIr(resolveDesignStyle(style, examplePreset.tokens) as never)
				: flattenToIr(style);
			out.push({ start, end: block.end, ir, design, binding: bindingName });
		}
	};
	scan(CSS_CALL_REGEX, "", false);
	scan(BARE_CSS_CALL_REGEX, "css", true);
	return out.toSorted((a, b) => a.start - b.start);
}
