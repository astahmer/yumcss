/**
 * Panda inbound parser (plan 024): literal panda `css({})` / `cva({})` /
 * `sva({})` / `defineRecipe({})` call sites -> SwapIR.
 *
 * Follows the parse.ts conventions: object literals are parsed with
 * `parseObjectLiteral` (null on ANY non-literal — identifiers, template
 * literals, spreads — which becomes a `dynamic` residual, never a
 * half-conversion), and IR entries carry conditions outermost-first.
 *
 * Panda-specific semantics:
 * - shorthands expand to canonical camelCase properties (`px` -> `paddingX`);
 * - `_hover`/`_dark`/breakpoint keys become condition scopes;
 * - per-property conditional values fan out
 *   (`mt: { base: '6', _first: '0' }` -> two entries);
 * - `'!'`-important values and CSS custom-property declarations pass through
 *   verbatim (never dropped);
 * - semantic token references resolve to authored `$token` refs when the
 *   ingested host theme knows them; otherwise they fall back to panda's
 *   generated CSS var + an explicit residual (plan 024 two-pass token flow);
 * - `textStyle: '<name>'` expands inline from the ingested theme (a
 *   textStyle is bundled utilities); unknown names are residuals.
 */
import type { SwapEntry, SwapIR, SwapResidual } from "./ir.ts";
import { parseObjectLiteral, type LiteralObject, type LitValue } from "./parse.ts";
import type { PandaTheme } from "./panda-theme.ts";
import { emptyPandaTheme } from "./panda-theme.ts";
import { matchBlock } from "../sources.ts";

// Re-exported for tests/consumers that only import this module.
export { parseObjectLiteral } from "./parse.ts";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/* ------------------------------------------------------------------ */
/* tables                                                              */
/* ------------------------------------------------------------------ */

/** panda shorthand / alias key -> canonical camelCase CSS property. */
export const PANDA_ALIASES: ReadonlyMap<string, string> = new Map([
	["p", "padding"],
	["px", "paddingX"],
	["py", "paddingY"],
	["pt", "paddingTop"],
	["pb", "paddingBottom"],
	["pl", "paddingLeft"],
	["pr", "paddingRight"],
	["m", "margin"],
	["mx", "marginX"],
	["my", "marginY"],
	["mt", "marginTop"],
	["mb", "marginBottom"],
	["ml", "marginLeft"],
	["mr", "marginRight"],
	["ms", "marginInlineStart"],
	["me", "marginInlineEnd"],
	["bg", "backgroundColor"],
	["rounded", "borderRadius"],
	["w", "width"],
	["h", "height"],
	["minW", "minWidth"],
	["minH", "minHeight"],
	["maxW", "maxWidth"],
	["maxH", "maxHeight"],
	["pos", "position"],
	["shadow", "boxShadow"],
]);

/** Top-level keys that open a condition scope instead of declaring. */
export function isConditionKey(key: string): boolean {
	return key.startsWith("_") || key === "base";
}

const camelProp = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

/** Canonical property for a style key (alias expansion + dash-casing). */
function canonicalProp(key: string): string {
	if (key.startsWith("--")) return key; // CSS custom property — verbatim
	const alias = PANDA_ALIASES.get(key);
	if (alias !== undefined) return alias;
	return camelProp(key);
}

/* ------------------------------------------------------------------ */
/* value handling                                                      */
/* ------------------------------------------------------------------ */

/**
 * Token-reference candidate: dotted path like `fg.muted` / `neutral.700`
 * (letters/digits segments only — excludes rgba(), lengths, keyword lists).
 */
const TOKEN_PATH_RE = /^[a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+$/;

const COLOR_TOKEN_HEADS = new Set([
	"fg",
	"bg",
	"accent",
	"primary",
	"secondary",
	"neutral",
	"gray",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"pink",
	"teal",
	"cyan",
	"indigo",
]);

/** Best-effort panda CSS-var group for an unmapped dotted token. */
export function fallbackVarForPath(path: string): string {
	const segments = path.split(".");
	const group = COLOR_TOKEN_HEADS.has(segments[0] ?? "") ? "colors" : (segments[0] ?? "tokens");
	return `var(--${group}-${segments.map((segment) => segment.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)).join("-")})`;
}

/** Authored pandwind token ref for a known host-theme path (`fg.muted` -> `$fg-muted`). */
export function authoredRefForPath(path: string): string {
	return `$${path.replace(/\./g, "-")}`;
}

interface ResolvedValue {
	value: string | number | true;
	residual?: SwapResidual;
}

function resolveValue(
	raw: string | number | boolean,
	prop: string,
	theme: PandaTheme,
): ResolvedValue {
	if (typeof raw !== "string") return { value: raw === false ? "false" : raw };
	// '!'-important suffix survives resolution verbatim.
	const important = raw.endsWith("!");
	const bare = important ? raw.slice(0, -1) : raw;
	let resolved: ResolvedValue;
	if (theme.tokenVars.has(bare)) {
		resolved = { value: authoredRefForPath(bare) };
	} else if (TOKEN_PATH_RE.test(bare)) {
		// Dotted candidate the theme does not know — transitional var() fallback
		// into panda's generated custom properties + explicit residual.
		const fallback = fallbackVarForPath(bare);
		resolved = {
			value: fallback,
			residual: {
				kind: "unknown-value",
				text: `${prop}: '${raw}'`,
				hint: `token "${bare}" is not in the ingested panda theme — emitted as ${fallback}; lift it via pass 1`,
			},
		};
	} else {
		// Plain CSS value (rgba(), '1.5rem', 'flex', 'tight', …) — verbatim.
		resolved = { value: bare };
	}
	return important ? { ...resolved, value: `${String(resolved.value)}!` } : resolved;
}

/* ------------------------------------------------------------------ */
/* style walker                                                        */
/* ------------------------------------------------------------------ */

const BREAKPOINT_RE = /^(?:sm|md|lg|xl|2xl|3xl|4xl|5xl)$/;
const isConditionishKey = (key: string): boolean =>
	key === "base" || key.startsWith("_") || BREAKPOINT_RE.test(key);

function pushEntries(ir: SwapIR, entries: Array<SwapEntry>): void {
	ir.entries.push(...entries);
}

function walkStyle(
	style: Record<string, unknown>,
	conditions: string[],
	ir: SwapIR,
	theme: PandaTheme,
): void {
	for (const [key, raw] of Object.entries(style)) {
		if (key.startsWith("&") || key.startsWith("@")) {
			ir.residuals.push({
				kind: "unrepresentable",
				text: `${key}: {...}`,
				hint: "nested selector / at-rule stays manual",
			});
			continue;
		}
		if (isConditionKey(key) || BREAKPOINT_RE.test(key)) {
			if (!isPlainObject(raw)) {
				ir.residuals.push({
					kind: "dynamic",
					text: `${key}: ${JSON.stringify(raw)}`,
					hint: `condition "${key}" must nest an object`,
				});
				continue;
			}
			// A literal `base:` key applies declarations under the current chain.
			if (key === "base") {
				walkStyle(raw, conditions, ir, theme);
				continue;
			}
			const condition = key.startsWith("_") ? key.slice(1) : key;
			walkStyle(raw, [...conditions, condition], ir, theme);
			continue;
		}
		walkDeclaration(key, raw, conditions, ir, theme);
	}
}

function walkDeclaration(
	key: string,
	raw: unknown,
	conditions: string[],
	ir: SwapIR,
	theme: PandaTheme,
): void {
	const prop = canonicalProp(key);

	// textStyle expands to its bundled declarations.
	if (prop === "textStyle" && typeof raw === "string") {
		const textStyle = theme.textStyles.get(raw);
		if (textStyle === undefined) {
			ir.residuals.push({
				kind: "unknown-value",
				text: `textStyle: '${raw}'`,
				hint: `textStyle "${raw}" not in ingested panda theme — lift textStyles in pass 1 or migrate manually`,
			});
			return;
		}
		walkStyle(textStyle, conditions, ir, theme);
		return;
	}

	// Per-property conditional fan-out: mt: { base: '6', _first: '0' }.
	if (isPlainObject(raw) && Object.keys(raw).length > 0 && isConditionishMap(raw)) {
		for (const [cond, value] of Object.entries(raw)) {
			if (cond === "base") {
				walkDeclaration(key, value, conditions, ir, theme);
				continue;
			}
			const nested = cond.startsWith("_") ? cond.slice(1) : cond;
			walkDeclaration(key, value, [...conditions, nested], ir, theme);
		}
		return;
	}

	if (
		raw === null ||
		raw === undefined ||
		(typeof raw !== "string" && typeof raw !== "number" && raw !== true)
	) {
		ir.residuals.push({
			kind: "dynamic",
			text: `${key}: ${isPlainObject(raw) || Array.isArray(raw) ? "{...}" : JSON.stringify(raw)}`,
			hint: "non-literal or unsupported value shape",
		});
		return;
	}

	const resolved = resolveValue(raw, prop, theme);
	if (resolved.residual !== undefined) ir.residuals.push(resolved.residual);
	pushEntries(ir, [
		{
			conditions,
			prop,
			value: resolved.value,
		},
	]);
}

/** Is every key of this object a condition-ish branch (base/_cond/breakpoint)? */
function isConditionishMap(raw: Record<string, unknown>): boolean {
	const keys = Object.keys(raw);
	return keys.length > 0 && keys.every((k) => isConditionishKey(k));
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/** Plain (already-literal) panda style object -> SwapIR. */
export function pandaStyleToIr(
	style: Record<string, unknown>,
	theme: PandaTheme = emptyPandaTheme,
): SwapIR {
	const ir: SwapIR = { entries: [], residuals: [] };
	walkStyle(style, [], ir, theme);
	return ir;
}

/** LitValue -> plain JS value (deep); caller guarantees literalness. */
export function literalToPlain(value: LitValue): unknown {
	return toPlain(value);
}

function toPlain(value: LitValue): unknown {
	if (Array.isArray(value)) return value.map(toPlain);
	if (typeof value === "object" && value !== null) {
		const out: Record<string, unknown> = {};
		for (const { key, value: nested } of value.keys) out[key] = toPlain(nested);
		return out;
	}
	return value;
}

/* ------------------------------------------------------------------ */
/* cva / sva / defineRecipe                                            */
/* ------------------------------------------------------------------ */

export interface CompoundVariantIR {
	/** Non-css matcher keys -> required variant value. */
	matchers: Record<string, string>;
	/** slot name ('' for cva) -> declarations IR. */
	slots: Record<string, SwapIR>;
}

export interface PandaRecipeIR {
	kind: "cva" | "sva";
	/** sva slot names; null for cva. */
	slots: string[] | null;
	className: string | null;
	/** Slot name -> base declarations ('' slot for cva). */
	base: Record<string, SwapIR>;
	/** variant -> variant value -> slot -> declarations. */
	variants: Record<string, Record<string, Record<string, SwapIR>>>;
	compoundVariants: Array<CompoundVariantIR>;
	defaultVariants: Record<string, string>;
	residuals: SwapResidual[];
}

function styleIrOrResidual(
	raw: unknown,
	slot: string,
	theme: PandaTheme,
	residuals: SwapResidual[],
): SwapIR {
	if (!isPlainObject(raw)) {
		residuals.push({
			kind: "dynamic",
			text: `${slot || "css"}: {...}`,
			hint: "non-literal style object",
		});
		return { entries: [], residuals: [] };
	}
	return pandaStyleToIr(raw, theme);
}

/** Parse a literal cva/sva/defineRecipe body into per-slot IR. */
export function pandaRecipeToIr(
	body: LiteralObject,
	kind: "cva" | "sva",
	theme: PandaTheme = emptyPandaTheme,
): PandaRecipeIR {
	const recipe: PandaRecipeIR = {
		kind,
		slots: null,
		className: null,
		base: {},
		variants: {},
		compoundVariants: [],
		defaultVariants: {},
		residuals: [],
	};
	const plain = toPlain(body) as Record<string, unknown>;

	if (kind === "sva" && Array.isArray(plain["slots"])) {
		recipe.slots = plain["slots"].map(String);
	}
	if (typeof plain["className"] === "string") recipe.className = plain["className"];

	const base = plain["base"];
	if (isPlainObject(base)) {
		if (kind === "sva") {
			for (const [slot, style] of Object.entries(base)) {
				recipe.base[slot] = styleIrOrResidual(style, slot, theme, recipe.residuals);
			}
		} else {
			recipe.base[""] = styleIrOrResidual(base, "", theme, recipe.residuals);
		}
	}

	const variants = plain["variants"];
	if (isPlainObject(variants)) {
		for (const [variantName, values] of Object.entries(variants)) {
			if (!isPlainObject(values)) {
				recipe.residuals.push({
					kind: "dynamic",
					text: `${variantName}: {...}`,
					hint: "non-literal variant values",
				});
				continue;
			}
			recipe.variants[variantName] = {};
			for (const [valueName, style] of Object.entries(values)) {
				recipe.variants[variantName]![valueName] = {};
				if (kind === "sva") {
					if (!isPlainObject(style)) {
						recipe.residuals.push({
							kind: "dynamic",
							text: `${variantName}.${valueName}`,
							hint: "non-literal sva variant style",
						});
						continue;
					}
					for (const [slot, slotStyle] of Object.entries(style)) {
						recipe.variants[variantName]![valueName]![slot] = styleIrOrResidual(
							slotStyle,
							slot,
							theme,
							recipe.residuals,
						);
					}
				} else {
					recipe.variants[variantName]![valueName]![""] = styleIrOrResidual(
						style,
						"",
						theme,
						recipe.residuals,
					);
				}
			}
		}
	}

	const defaults = plain["defaultVariants"];
	if (isPlainObject(defaults)) {
		for (const [k, v] of Object.entries(defaults)) {
			if (typeof v === "string") recipe.defaultVariants[k] = v;
		}
	}

	const compounds = plain["compoundVariants"];
	if (Array.isArray(compounds)) {
		for (const compound of compounds) {
			if (!isPlainObject(compound)) {
				recipe.residuals.push({
					kind: "dynamic",
					text: "compoundVariants: [...]",
					hint: "non-literal compound variant",
				});
				continue;
			}
			const css = compound["css"];
			const matchers: Record<string, string> = {};
			for (const [k, v] of Object.entries(compound)) {
				if (k === "css") continue;
				if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
					matchers[k] = String(v);
				} else if (Array.isArray(v)) {
					matchers[k] = v.map(String).join("|"); // array = any-of matchers
				} else {
					recipe.residuals.push({
						kind: "dynamic",
						text: `compoundVariants: ${k}: {...}`,
						hint: "non-literal compound matcher",
					});
				}
			}
			const slots: Record<string, SwapIR> = {};
			if (kind === "sva" && isPlainObject(css)) {
				for (const [slot, slotStyle] of Object.entries(css)) {
					slots[slot] = styleIrOrResidual(slotStyle, slot, theme, recipe.residuals);
				}
			} else {
				slots[""] = styleIrOrResidual(css, "", theme, recipe.residuals);
			}
			recipe.compoundVariants.push({ matchers, slots });
		}
	}

	return recipe;
}

/* ------------------------------------------------------------------ */
/* source scanning                                                     */
/* ------------------------------------------------------------------ */

export type PandaCallKind = "css" | "cva" | "sva";

export interface PandaCall {
	start: number;
	end: number;
	kind: PandaCallKind;
	/** For kind === "css". */
	ir?: SwapIR;
	/** For cva/sva kinds. */
	recipe?: PandaRecipeIR;
}

const PANDA_CSS_CALL_RE = /(?<![\w.])css\s*\(\s*\{/g;
const PANDA_CVA_CALL_RE = /(?<![\w.])(?:cva|defineRecipe)\s*\(\s*\{/g;
const PANDA_SVA_CALL_RE = /(?<![\w.])(?:sva|defineSlotRecipe)\s*\(\s*\{/g;

/** Recipe-shaped placeholder carrying a single dynamic residual. */
function dynamicRecipe(kind: "cva" | "sva"): PandaRecipeIR {
	return {
		kind,
		slots: null,
		className: null,
		base: {},
		variants: {},
		compoundVariants: [],
		defaultVariants: {},
		residuals: [
			{ kind: "dynamic", text: `${kind}({...})`, hint: "non-literal body (spread/dynamic values)" },
		],
	};
}

function scanCalls(
	source: string,
	regex: RegExp,
	excluded: (start: number) => boolean,
	handle: (match: RegExpExecArray, block: { body: string; end: number }) => PandaCall | null,
	calls: PandaCall[],
): void {
	regex.lastIndex = 0;
	for (let match = regex.exec(source); match !== null; match = regex.exec(source)) {
		const start = match.index;
		if (excluded(start)) continue;
		const open = start + match[0].length - 1;
		const block = matchBlock(source, open);
		if (block === null) continue;
		const call = handle(match, block);
		if (call !== null) calls.push(call);
	}
}

/**
 * Scan source text for literal panda styling calls. `excluded(start)` must
 * mask comments/string literals (the oxc excluded-ranges convention shared
 * with the other parsers).
 */
export function parsePandaCalls(
	source: string,
	excluded: (start: number) => boolean,
	options: { theme?: PandaTheme } = {},
): Array<PandaCall> {
	const theme = options.theme ?? emptyPandaTheme;
	const calls: PandaCall[] = [];

	scanCalls(
		source,
		PANDA_CSS_CALL_RE,
		excluded,
		(match, block) => {
			const parsed = parseObjectLiteral(block.body);
			if (parsed === null) {
				return {
					start: match.index,
					end: block.end,
					kind: "css",
					ir: {
						entries: [],
						residuals: [{ kind: "dynamic", text: "css({...})", hint: "non-literal object" }],
					},
				};
			}
			return {
				start: match.index,
				end: block.end,
				kind: "css",
				ir: pandaStyleToIr(toPlain(parsed) as never, theme),
			};
		},
		calls,
	);

	scanCalls(
		source,
		PANDA_CVA_CALL_RE,
		excluded,
		(match, block) => {
			const parsed = parseObjectLiteral(block.body);
			if (parsed === null) {
				return {
					start: match.index,
					end: block.end,
					kind: "cva",
					recipe: dynamicRecipe("cva"),
				};
			}
			return {
				start: match.index,
				end: block.end,
				kind: "cva",
				recipe: pandaRecipeToIr(parsed, "cva", theme),
			};
		},
		calls,
	);

	scanCalls(
		source,
		PANDA_SVA_CALL_RE,
		excluded,
		(match, block) => {
			const parsed = parseObjectLiteral(block.body);
			if (parsed === null) {
				return {
					start: match.index,
					end: block.end,
					kind: "sva",
					recipe: dynamicRecipe("sva"),
				};
			}
			return {
				start: match.index,
				end: block.end,
				kind: "sva",
				recipe: pandaRecipeToIr(parsed, "sva", theme),
			};
		},
		calls,
	);

	return calls.toSorted((a, b) => a.start - b.start);
}
