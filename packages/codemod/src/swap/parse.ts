/**
 * Swap parsers (plans/022): source-API call sites -> SwapIR.
 *
 * Three shapes are recognized, each matched OUTSIDE comments and string
 * literals via the oxc mask (`computeExcludedRanges`) — closing the gap
 * where only styled-components had context protection:
 *
 * - `tw({ key: value, hover: {...} })`  — resolved offline through the
 *   generated metadata: key -> utility class (same rules as tw/compile.ts),
 *   class -> {property, value} through the inverted bridge. A bridge miss can
 *   still resolve when the generated project token catalog proves that the
 *   utility names one exact token; ambiguous or undocumented values remain
 *   `unknown-value` residuals and the call site is left untouched.
 * - `css.class({...})` / `css({...})`    — flat camelCase literals with
 *   `_condition` nesting; values stay AS WRITTEN (the engine resolves
 *   preset tokens at runtime; no app-preset properties config is loaded).
 * - design-vocabulary `css.class({ $frame: ... })` — lowered offline via
 *   resolveDesignStyle + the owned flattener, so entries carry concrete values.
 */
import type { YumCSSMeta } from "../meta.ts";
import { UTILITY_SUBKEYS } from "yumcss/tw/compile";
import { flattenStyle } from "yumcss/lib/utils";
import { resolveDesignStyle } from "yumcss/design/resolve";
import type { AnyTokens } from "yumcss/types/typings";
import { SourcePass } from "../source-pass-utils.ts";
import type { SwapIR } from "./ir.ts";
import { SwapResidualKindTag } from "./ir.ts";
import {
	normalizeTokenKey,
	resolvedAuthoredToken,
	suggestionLookup,
	type GovernanceSuggestionInput,
} from "./tokens.ts";
import { variantPathForKey } from "./variant-hoisting.ts";

const enum LiteralParserValueTag {
	Dynamic = "dynamic",
}

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
	const parseScalar = (): LitValue | LiteralParserValueTag | null => {
		skipWsAndComments();
		if (i >= body.length) return null;
		const ch = body[i]!;
		if (ch === '"' || ch === "'" || ch === "`") return parseString();
		const numeric = /^-?\d+(?:\.\d+)?/.exec(body.slice(i));
		if (numeric !== null) {
			i += numeric[0].length;
			return Number(numeric[0]);
		}
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
			return LiteralParserValueTag.Dynamic;
		}
		// Identifiers / template literals / anything else — dynamic.
		return LiteralParserValueTag.Dynamic;
	};

	type ContainerFrame =
		| {
				readonly kind: "object";
				readonly value: LiteralObject;
				state: "key" | "colon" | "value" | "after";
				pendingKey?: string;
		  }
		| { readonly kind: "array"; readonly value: LitValue[]; state: "value" | "after" };

	const parseContainer = (): LitValue | LiteralParserValueTag | null => {
		const opening = body[i];
		if (opening !== "{" && opening !== "[") return null;
		i++;
		const stack: ContainerFrame[] = [
			opening === "{"
				? { kind: "object", value: { keys: [] }, state: "key" }
				: { kind: "array", value: [], state: "value" },
		];
		let completed: LitValue | LiteralParserValueTag | null | undefined;
		while (stack.length > 0) {
			if (completed !== undefined) {
				const parent = stack.at(-1);
				if (parent === undefined) return completed;
				if (parent.kind === "object") {
					const key = parent.pendingKey;
					if (
						key === undefined ||
						completed === null ||
						completed === LiteralParserValueTag.Dynamic
					)
						return completed === LiteralParserValueTag.Dynamic ? completed : null;
					if (parent.value.keys.some((entry) => entry.key === key)) return "dynamic";
					parent.value.keys.push({ key, value: completed });
					parent.pendingKey = undefined;
					parent.state = "after";
				} else {
					if (completed === null || completed === LiteralParserValueTag.Dynamic) return completed;
					parent.value.push(completed);
					parent.state = "after";
				}
				completed = undefined;
				continue;
			}

			const frame = stack.at(-1)!;
			skipWsAndComments();
			if (frame.kind === "object") {
				if (frame.state === "key") {
					if (i >= body.length) return null;
					if (body[i] === "}") {
						i++;
						stack.pop();
						completed = frame.value;
						continue;
					}
					if (body.startsWith("...", i)) return LiteralParserValueTag.Dynamic;
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
					}
					if (key === "") return null;
					frame.pendingKey = key;
					frame.state = "colon";
					continue;
				}
				if (frame.state === "colon") {
					if (body[i] !== ":") return null;
					i++;
					frame.state = "value";
					continue;
				}
				if (frame.state === "value") {
					if (i >= body.length) return null;
					if (body[i] === "{" || body[i] === "[") {
						stack.push(
							body[i] === "{"
								? { kind: "object", value: { keys: [] }, state: "key" }
								: { kind: "array", value: [], state: "value" },
						);
						i++;
						continue;
					}
					const value = parseScalar();
					if (value === null || value === LiteralParserValueTag.Dynamic) return value;
					frame.value.keys.push({ key: frame.pendingKey!, value });
					frame.pendingKey = undefined;
					frame.state = "after";
					continue;
				}
				if (body[i] === ",") {
					i++;
					frame.state = "key";
					continue;
				}
				if (body[i] === "}") {
					i++;
					stack.pop();
					completed = frame.value;
					continue;
				}
				return null;
			}

			if (frame.state === "value") {
				if (i >= body.length) return null;
				if (body[i] === "]") {
					i++;
					stack.pop();
					completed = frame.value;
					continue;
				}
				if (body.startsWith("...", i)) return LiteralParserValueTag.Dynamic;
				if (body[i] === "{" || body[i] === "[") {
					stack.push(
						body[i] === "{"
							? { kind: "object", value: { keys: [] }, state: "key" }
							: { kind: "array", value: [], state: "value" },
					);
					i++;
					continue;
				}
				const value = parseScalar();
				if (value === null || value === LiteralParserValueTag.Dynamic) return value;
				frame.value.push(value);
				frame.state = "after";
				continue;
			}
			if (body[i] === ",") {
				i++;
				frame.state = "value";
				continue;
			}
			if (body[i] === "]") {
				i++;
				stack.pop();
				completed = frame.value;
				continue;
			}
			return null;
		}
		return completed ?? null;
	};

	const parseValue = (): LitValue | LiteralParserValueTag | null => {
		skipWsAndComments();
		return body[i] === "{" || body[i] === "[" ? parseContainer() : parseScalar();
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
		if (value === null || value === LiteralParserValueTag.Dynamic) return null;
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

/* ------------------------------------------------------------------ */
/* tw() parser                                                         */
/* ------------------------------------------------------------------ */

const COMPOUND_FLEX = new Set(["col", "row", "col-reverse", "row-reverse"]);

interface ResolvedTokenUtility {
	readonly prop: string;
	readonly value: string | number;
}

/**
 * Recover a source utility when the bridge selected a different alias for the
 * same resolved value. The bridge intentionally stores one preferred utility
 * per `(property, value)`, so an authored `bg-blue-600` can disappear when
 * `bg-brand` resolves to the same color. The project token catalog can repair
 * that narrow loss without guessing: the utility prefix must have one
 * property rule and the suffix must name exactly one configured token.
 */
function resolveTokenUtility(
	meta: YumCSSMeta,
	utilityClass: string,
): ResolvedTokenUtility | undefined {
	if (meta.tokens === undefined) return undefined;
	const bases = [...meta.conflicts.entries()]
		.filter(([base]) => utilityClass.startsWith(`${base}-`))
		.toSorted(([left], [right]) => right.length - left.length);
	for (const [base, rules] of bases) {
		const suffix = utilityClass.slice(base.length + 1);
		const properties = rules[suffix] ?? rules["*"];
		if (properties === undefined || properties.length !== 1) continue;
		const normalizedSuffix = normalizeTokenKey(`$${suffix}`).toLowerCase();
		const matches: Array<string | number> = [];
		for (const values of Object.values(meta.tokens)) {
			for (const [key, value] of Object.entries(values)) {
				if (
					normalizeTokenKey(key.startsWith("$") ? key : `$${key}`).toLowerCase() ===
						normalizedSuffix &&
					(typeof value === "string" || typeof value === "number")
				)
					matches.push(value);
			}
		}
		if (matches.length === 1) return { prop: camelProp(properties[0]!), value: matches[0]! };
	}
	return undefined;
}

function walkTwEntries(
	meta: YumCSSMeta,
	obj: LiteralObject,
	conditions: string[],
	ir: SwapIR,
	_missResolver?: (utilityClass: string) => readonly { prop: string; value: string }[] | null,
): void {
	for (const { key, value } of obj.keys) {
		const variantPath = variantPathForKey(meta, key);
		if (variantPath !== undefined) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				ir.residuals.push({
					kind: SwapResidualKindTag.Dynamic,
					text: `${key}: ${formatLit(value)}`,
					hint: `variant "${key}" must nest an object`,
				});
				continue;
			}
			walkTwEntries(meta, value, [...conditions, ...variantPath], ir, _missResolver);
			continue;
		}
		const parts = Array.isArray(value) ? value : [value];
		if (parts.some((p) => typeof p === "object")) {
			ir.residuals.push({
				kind: SwapResidualKindTag.Dynamic,
				text: `${key}: [...]`,
				hint: "nested containers",
			});
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
				const tokenHit = resolveTokenUtility(meta, cls);
				if (tokenHit !== undefined) {
					ir.entries.push({ conditions, prop: tokenHit.prop, value: tokenHit.value });
					continue;
				}
				// --engine: resolve through the real Tailwind engine when supplied.
				const resolved = _missResolver?.(cls);
				if (resolved !== undefined && resolved !== null && resolved.length > 0) {
					for (const decl of resolved) {
						ir.entries.push({ conditions, prop: camelProp(decl.prop), value: decl.value });
					}
					continue;
				}
				ir.residuals.push({
					kind: SwapResidualKindTag.UnknownValue,
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
	meta: YumCSSMeta,
	excluded: (start: number) => boolean,
	_missResolver?: (utilityClass: string) => readonly { prop: string; value: string }[] | null,
): Array<{ start: number; end: number; ir: SwapIR }> {
	const out: Array<{ start: number; end: number; ir: SwapIR }> = [];
	for (const match of source.matchAll(TW_CALL_REGEX)) {
		const start = match.index ?? 0;
		if (excluded(start)) continue;
		const open = start + match[0].length - 1;
		const block = SourcePass.matchBlock(source, open);
		if (block === null) continue;
		const parsed = parseObjectLiteral(block.body);
		if (parsed === null) {
			out.push({
				start,
				end: block.end,
				ir: {
					entries: [],
					residuals: [
						{ kind: SwapResidualKindTag.Dynamic, text: "tw({...})", hint: "non-literal object" },
					],
				},
			});
			continue;
		}
		const ir: SwapIR = { entries: [], residuals: [] };
		walkTwEntries(meta, parsed, [], ir, _missResolver);
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
export function literalValueToPlain(value: LitValue): unknown {
	type Container = unknown[] | Record<string, unknown>;
	type Frame = { readonly value: LitValue; readonly output: Container; index: number };
	const container = (input: LitValue): Container => (Array.isArray(input) ? [] : {});
	const set = (output: Container, key: string | number, value: unknown): void => {
		if (Array.isArray(output)) output[key as number] = value;
		else output[key as string] = value;
	};
	const assign = (
		output: Container,
		key: string | number,
		child: LitValue,
		stack: Frame[],
	): void => {
		if (typeof child !== "object" || child === null) {
			set(output, key, child);
			return;
		}
		const nested = container(child);
		set(output, key, nested);
		stack.push({ value: child, output: nested, index: 0 });
	};
	let root: unknown;
	const stack: Frame[] = [];
	if (typeof value === "object" && value !== null) {
		const output = container(value);
		root = output;
		stack.push({ value, output, index: 0 });
	} else {
		root = value;
	}
	while (stack.length > 0) {
		const frame = stack.pop()!;
		if (typeof frame.value !== "object" || frame.value === null) continue;
		if (Array.isArray(frame.value)) {
			while (frame.index < frame.value.length) {
				const index = frame.index++;
				assign(frame.output, index, frame.value[index]!, stack);
			}
			continue;
		}
		while (frame.index < frame.value.keys.length) {
			const entry = frame.value.keys[frame.index++]!;
			assign(frame.output, entry.key, entry.value, stack);
		}
	}
	return root;
}

function flattenToIr(
	flat: Record<string, unknown>,
	authoredByResolvedValue: ReadonlyMap<string, string> = new Map(),
): SwapIR {
	const ir: SwapIR = { entries: [], residuals: [] };
	for (const [key, raw] of Object.entries(flattenStyle(flat as never))) {
		const { conditions, prop } = splitFlatKey(key);
		const value = typeof raw === "string" ? raw : (raw as string);
		const authored =
			typeof value === "string" ? authoredByResolvedValue.get(value.toLowerCase()) : undefined;
		ir.entries.push({
			conditions,
			prop: camelProp(prop),
			value,
			...(authored === undefined ? {} : { authored }),
		});
	}
	return ir;
}

/**
 * Keep an authored design token only when its resolved value is unique and no
 * literal in the same call could have produced it. This keeps the flat fast
 * path conservative while allowing `preserve` to retain an explicit legacy
 * spelling such as `$blue-500`.
 */
function authoredDesignTokens(
	style: unknown,
	tokens: AnyTokens | undefined,
): ReadonlyMap<string, string> {
	if (tokens === undefined) return new Map();
	const candidates = new Map<string, Set<string>>();
	const literalValues = new Set<string>();
	const visit = (value: unknown): void => {
		if (typeof value === "string") {
			if (!value.startsWith("$")) {
				literalValues.add(value.toLowerCase());
				return;
			}
			const normalized = normalizeTokenKey(value).toLowerCase();
			for (const values of Object.values(tokens)) {
				for (const [key, resolved] of Object.entries(values)) {
					if (typeof resolved === "string" && normalizeTokenKey(key).toLowerCase() === normalized) {
						const resolvedKey = resolved.toLowerCase();
						const matches = candidates.get(resolvedKey) ?? new Set<string>();
						matches.add(value);
						candidates.set(resolvedKey, matches);
					}
				}
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (typeof value === "object" && value !== null)
			for (const child of Object.values(value as Record<string, unknown>)) visit(child);
	};
	visit(style);
	const out = new Map<string, string>();
	for (const [resolved, authored] of candidates) {
		if (literalValues.has(resolved) || authored.size !== 1) continue;
		out.set(resolved, authored.values().next().value!);
	}
	return out;
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
	options: {
		tokenize?: boolean;
		tokens?: AnyTokens;
		suggestions?: ReadonlyArray<GovernanceSuggestionInput>;
	} = {},
): Array<{ start: number; end: number; ir: SwapIR; design: boolean; binding: string }> {
	const out: Array<{ start: number; end: number; ir: SwapIR; design: boolean; binding: string }> =
		[];
	const scan = (regex: RegExp, binding: string, bare: boolean): void => {
		for (const match of source.matchAll(regex)) {
			const start = match.index ?? 0;
			if (excluded(start)) continue;
			const open = start + match[0].length - 1;
			const block = SourcePass.matchBlock(source, open);
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
							{
								kind: SwapResidualKindTag.Dynamic,
								text: `${bindingName}.class({...})`,
								hint: "non-literal object",
							},
						],
					},
					design: false,
					binding: bindingName,
				});
				continue;
			}
			const style: Record<string, unknown> = {};
			for (const { key, value } of parsed.keys) style[key] = literalValueToPlain(value);
			const design = Object.keys(style).some((k) => k.startsWith("$"));
			let ir = design
				? flattenToIr(
						resolveDesignStyle(style, options.tokens) as never,
						authoredDesignTokens(style, options.tokens),
					)
				: flattenToIr(style);
			if (!design && options.tokenize === true) {
				// Tokenize-this: raw values with an authored preset token become
				// $token references (#3182ce -> $blue-500).
				const suggestions =
					options.suggestions !== undefined ? suggestionLookup(options.suggestions) : undefined;
				for (const entry of ir.entries) {
					if (typeof entry.value !== "string") continue;
					if (suggestions !== undefined) {
						// Governance evidence governs (plans/054): a property+value
						// pair with an exact suggestion uses it; a pair without one
						// is NOT rewritten — absence of evidence is not permission
						// for the heuristic to fire.
						const replacement = suggestions.get(entry.prop + "\u0000" + entry.value);
						if (replacement !== undefined) {
							entry.value = replacement;
							continue;
						}
						if (suggestions.size > 0) continue;
					}
					const authored = resolvedAuthoredToken(entry.value, options.tokens);
					if (authored !== null) entry.value = authored;
				}
			}
			out.push({ start, end: block.end, ir, design, binding: bindingName });
		}
	};
	scan(CSS_CALL_REGEX, "", false);
	scan(BARE_CSS_CALL_REGEX, "css", true);
	return out.toSorted((a, b) => a.start - b.start);
}
