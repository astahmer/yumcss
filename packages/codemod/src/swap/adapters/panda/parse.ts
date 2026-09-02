/**
 * Panda inbound parser: literal Panda `css({})` / `cva({})` /
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
 *   generated CSS var + an explicit residual;
 * - `textStyle: '<name>'` expands inline from the ingested theme (a
 *   textStyle is bundled utilities); unknown names are residuals.
 */
import type { SwapEntry, SwapIR, SwapResidual } from "../../ir.ts";
import {
	literalValueToPlain,
	parseObjectLiteral,
	type LiteralObject,
	type LitValue,
} from "../../parse.ts";
import type { PandaTheme } from "./theme.ts";
import { emptyPandaTheme } from "./theme.ts";
import { SourcePass } from "../../../source-pass-utils.ts";
import { CSS_PROPERTY_ALIASES } from "../../property-aliases.ts";
import { PandaUtilityCatalog } from "./utilities.ts";

// Re-exported for tests/consumers that only import this module.
export { parseObjectLiteral } from "../../parse.ts";

export const enum PandaRecipeKindTag {
	Cva = "cva",
	Sva = "sva",
}

export const enum PandaCallKindTag {
	Css = "css",
	Cva = "cva",
	Sva = "sva",
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/* ------------------------------------------------------------------ */
/* tables                                                              */
/* ------------------------------------------------------------------ */

const camelProp = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

/** Canonical property for a style key (project alias expansion + dash-casing). */
function canonicalProp(key: string, utilities: PandaUtilityCatalog): string {
	if (key.startsWith("--")) return key; // CSS custom property — verbatim
	const alias = utilities.resolveProperty(key);
	if (alias !== undefined) return alias;
	return camelProp(key);
}

const RADIUS_EXPANSIONS: ReadonlyMap<string, string[]> = new Map([
	["borderTopRadius", ["borderTopLeftRadius", "borderTopRightRadius"]],
	["borderRightRadius", ["borderTopRightRadius", "borderBottomRightRadius"]],
	["borderBottomRadius", ["borderBottomLeftRadius", "borderBottomRightRadius"]],
	["borderLeftRadius", ["borderTopLeftRadius", "borderBottomLeftRadius"]],
	["borderStartRadius", ["borderStartStartRadius", "borderEndStartRadius"]],
	["borderEndRadius", ["borderStartEndRadius", "borderEndEndRadius"]],
]);

/**
 * Lower Panda utility transforms that are not ordinary CSS aliases. This is
 * shared by factory output and generated runtime pattern modules so a
 * rerun never leaves Panda-only keys behind in a Pandwind style object.
 */
export function normalizePandaStyleObject(
	style: Record<string, unknown>,
	utilities: PandaUtilityCatalog = PandaUtilityCatalog.empty(),
): Record<string, unknown> {
	type Frame = {
		readonly entries: readonly [string, unknown][];
		index: number;
		readonly target: Record<string, unknown>;
		readonly commit?: { readonly target: Record<string, unknown>; readonly key: string };
	};
	const out: Record<string, unknown> = {};
	const add = (target: Record<string, unknown>, key: string, value: unknown): void => {
		const current = target[key];
		if (isPlainObject(current) && isPlainObject(value)) target[key] = { ...current, ...value };
		else target[key] = value;
	};
	const frames: Frame[] = [{ entries: Object.entries(style), index: 0, target: out }];
	while (frames.length > 0) {
		const frame = frames.at(-1)!;
		const entry = frame.entries[frame.index++];
		if (entry === undefined) {
			frames.pop();
			if (frame.commit !== undefined) add(frame.commit.target, frame.commit.key, frame.target);
			continue;
		}
		const [rawKey, rawValue] = entry;
		const key = canonicalProp(rawKey, utilities);
		if (key === "hideFrom" || key === "hideBelow") {
			if (typeof rawValue === "string") {
				add(frame.target, key === "hideFrom" ? rawValue : `${rawValue}Down`, { display: "none" });
			} else {
				add(frame.target, key, rawValue);
			}
			continue;
		}
		if (key === "boxSize") {
			add(frame.target, "width", rawValue);
			add(frame.target, "height", rawValue);
			continue;
		}
		const radius = RADIUS_EXPANSIONS.get(key);
		if (radius !== undefined) {
			for (const property of radius) add(frame.target, property, rawValue);
			continue;
		}
		const property = CSS_PROPERTY_ALIASES.get(key) ?? key;
		if (isPlainObject(rawValue)) {
			const nested: Record<string, unknown> = {};
			frames.push({
				entries: Object.entries(rawValue),
				index: 0,
				target: nested,
				commit: { target: frame.target, key: property },
			});
		} else {
			add(frame.target, property, rawValue);
		}
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* value handling                                                      */
/* ------------------------------------------------------------------ */

/**
 * Token-reference candidate: dotted path like `fg.muted` / `neutral.700`
 * (letters/digits segments only — excludes rgba(), lengths, keyword lists).
 */
const TOKEN_PATH_RE = /^[a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+$/;

// Simple Panda values are ambiguous across token groups (`sm` is a font size,
// radius, spacing value, etc.). Only turn them into `$` references when the
// declaration has a matching theme-driven group; dotted paths remain safe to
// resolve everywhere because Panda uses them as explicit group paths.
const SIMPLE_TOKEN_PROPS = new Set([
	"color",
	"background",
	"backgroundColor",
	"borderColor",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"outlineColor",
	"fill",
	"stroke",
	"fontFamily",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"boxShadow",
	"textShadow",
	"zIndex",
]);

/** Best-effort panda CSS-var group for an unmapped dotted token. */
function fallbackVarForPath(path: string): string {
	const segments = path.split(".");
	const group = segments[0] ?? "tokens";
	return `var(--${group}-${segments.map((segment) => segment.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)).join("-")})`;
}

/** Authored pandwind token ref for a known host-theme path (`fg.muted` -> `$fg-muted`). */
function authoredRefForPath(path: string): string {
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
	if (theme.tokenVars.has(bare) && (bare.includes(".") || SIMPLE_TOKEN_PROPS.has(prop))) {
		resolved = { value: authoredRefForPath(bare) };
	} else if (TOKEN_PATH_RE.test(bare)) {
		// Dotted candidate the theme does not know — CSS-variable fallback
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

const isConditionishKey = (key: string, theme: PandaTheme): boolean =>
	key === "base" || key.startsWith("_") || theme.conditions[key] !== undefined;

function pushEntries(ir: SwapIR, entries: Array<SwapEntry>): void {
	ir.entries.push(...entries);
}

type StyleTask =
	| {
			readonly kind: "style";
			readonly style: Record<string, unknown>;
			readonly conditions: string[];
	  }
	| {
			readonly kind: "entry";
			readonly key: string;
			readonly raw: unknown;
			readonly conditions: string[];
	  };

function walkStyle(
	style: Record<string, unknown>,
	conditions: string[],
	ir: SwapIR,
	theme: PandaTheme,
): void {
	const tasks: StyleTask[] = [{ kind: "style", style, conditions }];
	while (tasks.length > 0) {
		const task = tasks.pop()!;
		if (task.kind === "style") {
			const entries = Object.entries(task.style);
			for (let index = entries.length - 1; index >= 0; index--) {
				const [key, raw] = entries[index]!;
				tasks.push({ kind: "entry", key, raw, conditions: task.conditions });
			}
			continue;
		}

		const { key, raw, conditions: activeConditions } = task;
		if (key.startsWith("&") || key.startsWith("@")) {
			if (isPlainObject(raw)) {
				// Pandwind's stylesheet engine can preserve nested selectors and
				// at-rules as condition paths; keep walking so Panda aliases inside
				// them are canonicalized instead of leaving a runtime Panda call.
				tasks.push({ kind: "style", style: raw, conditions: [...activeConditions, key] });
			} else {
				ir.residuals.push({
					kind: "unrepresentable",
					text: `${key}: {...}`,
					hint: "nested selector / at-rule must contain an object",
				});
			}
			continue;
		}
		if (isConditionishKey(key, theme)) {
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
				tasks.push({ kind: "style", style: raw, conditions: activeConditions });
				continue;
			}
			const condition = key.startsWith("_") ? key.slice(1) : key;
			tasks.push({ kind: "style", style: raw, conditions: [...activeConditions, condition] });
			continue;
		}

		const prop = canonicalProp(key, theme.utilityCatalog);

		if (prop === "hideFrom" || prop === "hideBelow") {
			if (typeof raw === "string") {
				tasks.push({
					kind: "entry",
					key: "display",
					raw: "none",
					conditions: [...activeConditions, prop === "hideFrom" ? raw : `${raw}Down`],
				});
			} else {
				ir.residuals.push({
					kind: "dynamic",
					text: `${key}: {...}`,
					hint: `${key} must use a literal breakpoint name`,
				});
			}
			continue;
		}

		if (prop === "boxSize") {
			tasks.push({ kind: "entry", key: "height", raw, conditions: activeConditions });
			tasks.push({ kind: "entry", key: "width", raw, conditions: activeConditions });
			continue;
		}

		const radius = RADIUS_EXPANSIONS.get(prop);
		if (radius !== undefined) {
			for (let index = radius.length - 1; index >= 0; index--)
				tasks.push({ kind: "entry", key: radius[index]!, raw, conditions: activeConditions });
			continue;
		}

		// textStyle expands to its bundled declarations.
		if (prop === "textStyle" && typeof raw === "string") {
			const textStyle = theme.textStyles.get(raw);
			if (textStyle === undefined) {
				ir.residuals.push({
					kind: "unknown-value",
					text: `textStyle: '${raw}'`,
					hint: `textStyle "${raw}" not in ingested panda theme — lift textStyles in pass 1 or migrate manually`,
				});
				continue;
			}
			tasks.push({ kind: "style", style: textStyle, conditions: activeConditions });
			continue;
		}

		// Per-property conditional fan-out: mt: { base: '6', _first: '0' }.
		if (isPlainObject(raw) && Object.keys(raw).length > 0 && isConditionishMap(raw, theme)) {
			const branches = Object.entries(raw);
			for (let index = branches.length - 1; index >= 0; index--) {
				const [cond, value] = branches[index]!;
				if (cond === "base") {
					tasks.push({ kind: "entry", key, raw: value, conditions: activeConditions });
					continue;
				}
				const nested = cond.startsWith("_") ? cond.slice(1) : cond;
				tasks.push({
					kind: "entry",
					key,
					raw: value,
					conditions: [...activeConditions, nested],
				});
			}
			continue;
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
			continue;
		}

		const resolved = resolveValue(raw, prop, theme);
		if (resolved.residual !== undefined) ir.residuals.push(resolved.residual);
		pushEntries(ir, [
			{
				conditions: activeConditions,
				prop,
				value: resolved.value,
			},
		]);
	}
}

/** Is every key of this object a condition-ish branch (base/_cond/breakpoint)? */
function isConditionishMap(raw: Record<string, unknown>, theme: PandaTheme): boolean {
	const keys = Object.keys(raw);
	return keys.length > 0 && keys.every((key) => isConditionishKey(key, theme));
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
	return literalValueToPlain(value);
}

/* ------------------------------------------------------------------ */
/* cva / sva / defineRecipe                                            */
/* ------------------------------------------------------------------ */

interface CompoundVariantIR {
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
	const plain = literalValueToPlain(body) as Record<string, unknown>;

	if (kind === PandaRecipeKindTag.Sva && Array.isArray(plain["slots"])) {
		recipe.slots = plain["slots"].map(String);
	}
	if (typeof plain["className"] === "string") recipe.className = plain["className"];

	const base = plain["base"];
	if (isPlainObject(base)) {
		if (kind === PandaRecipeKindTag.Sva) {
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
				if (kind === PandaRecipeKindTag.Sva) {
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
			if (kind === PandaRecipeKindTag.Sva && isPlainObject(css)) {
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

type PandaCallKind = "css" | "cva" | "sva";

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
		const block = SourcePass.matchBlock(source, open);
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
					kind: PandaCallKindTag.Css,
					ir: {
						entries: [],
						residuals: [{ kind: "dynamic", text: "css({...})", hint: "non-literal object" }],
					},
				};
			}
			return {
				start: match.index,
				end: block.end,
				kind: PandaCallKindTag.Css,
				ir: pandaStyleToIr(literalValueToPlain(parsed) as never, theme),
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
					kind: PandaCallKindTag.Cva,
					recipe: dynamicRecipe(PandaRecipeKindTag.Cva),
				};
			}
			return {
				start: match.index,
				end: block.end,
				kind: PandaCallKindTag.Cva,
				recipe: pandaRecipeToIr(parsed, PandaRecipeKindTag.Cva, theme),
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
					kind: PandaCallKindTag.Sva,
					recipe: dynamicRecipe(PandaRecipeKindTag.Sva),
				};
			}
			return {
				start: match.index,
				end: block.end,
				kind: PandaCallKindTag.Sva,
				recipe: pandaRecipeToIr(parsed, PandaRecipeKindTag.Sva, theme),
			};
		},
		calls,
	);

	return calls.toSorted((a, b) => a.start - b.start);
}
