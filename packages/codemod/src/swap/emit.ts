/**
 * Swap emitters (plans/022): SwapIR -> target-API source text.
 *
 * One function per target API; adding a library means one more exported
 * emitter + one registry line in ./index.ts. Every emitter returns the
 * replacement text PLUS the residuals it could not represent — runSwap
 * turns those into skip markers, so nothing is ever silently dropped.
 *
 * Output style: SINGLE-LINE call sites. The codemod never pretty-prints —
 * most call sites are one-liners in real code and the user reformats via
 * their own tooling afterwards.
 */
import type { PandwindMeta } from "../meta.ts";
import { mapToken } from "../map.ts";
import type { AnyTokens } from "pandwind/types/typings";
import type { SwapEntry, SwapIR } from "./ir.ts";
import type { TokenRefMode } from "./tokens.ts";
import type { StyleProgram } from "./semantic-ir.ts";
import type { AdapterCapabilities, AdapterCapabilityReport } from "./capabilities.ts";
import { CSS_PROPERTY_ALIASES } from "./parse-panda.ts";

export interface EmitterContext {
	/** 1-based ordinal of the call site within the current file pass. */
	index: number;
	/** How token references are emitted ("off" = resolved literals). */
	tokenRefs?: TokenRefMode;
	/** Canonical CSS property-order sorting inside emitted scopes. */
	sort?: boolean;
	/** Versioned semantic view for adapters; legacy emitters may use `SwapIR`. */
	program?: StyleProgram;
	/** Declared target contract and its check for the current program. */
	capabilities?: AdapterCapabilities;
	capabilityReport?: AdapterCapabilityReport;
	/** Project metadata needed by token-aware core emitters. */
	meta?: PandwindMeta;
}

/**
 * Canonical CSSOM-ish property order (layout -> box -> border -> background ->
 * text -> visual -> misc). Unknown props sort after known ones, alphabetically.
 */
const CANONICAL_PROP_ORDER: Record<string, number> = {};
[
	"display",
	"flexDirection",
	"flexWrap",
	"flex",
	"flexGrow",
	"alignItems",
	"justifyContent",
	"gap",
	"rowGap",
	"columnGap",
	"gridTemplateColumns",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"zIndex",
	"width",
	"height",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"margin",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"overflow",
	"borderRadius",
	"border",
	"borderWidth",
	"borderStyle",
	"borderColor",
	"background",
	"backgroundColor",
	"backgroundImage",
	"boxShadow",
	"opacity",
	"fontFamily",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"textAlign",
	"textTransform",
	"textDecorationLine",
	"color",
	"cursor",
	"transition",
].forEach((prop, i) => {
	CANONICAL_PROP_ORDER[prop] = i;
});

/** Sort entries by canonical order; unknowns after knowns, alphabetical. */
function sortByCanonicalOrder(entries: SwapEntry[]): SwapEntry[] {
	return entries.toSorted((a, b) => {
		const ia = CANONICAL_PROP_ORDER[a.prop];
		const ib = CANONICAL_PROP_ORDER[b.prop];
		if (ia !== undefined && ib !== undefined) return ia - ib;
		if (ia !== undefined) return -1;
		if (ib !== undefined) return 1;
		return a.prop.localeCompare(b.prop);
	});
}

export interface EmitterResult {
	text: string;
	residuals: SwapIR["residuals"];
	/** File-level statements to inject after imports (structural targets). */
	headers?: string[];
	/** Module imports the emitted code requires. */
	imports?: string[];
}

export type Emitter = (ir: SwapIR, meta: PandwindMeta, ctx: EmitterContext) => EmitterResult;

const conditionKey = (conditions: string[]): string =>
	conditions.length === 0 ? "" : conditions.join("__");

const formatValue = (value: unknown): string =>
	typeof value === "string"
		? JSON.stringify(value)
		: Array.isArray(value)
			? `[${value.map((v) => formatValue(v)).join(", ")}]`
			: String(value);

/* ------------------------------------------------------------------ */
/* shared nesting renderer — single-line scopes                        */
/* ------------------------------------------------------------------ */

function groupByConditions(entries: SwapEntry[]): Map<string, SwapEntry[]> {
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of entries) {
		const key = conditionKey(entry.conditions);
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else {
			// Panda lets a bundled utility (for example textStyle) be followed by
			// an explicit declaration. Emit one object key and keep authored
			// last-write-wins precedence so the result remains valid TypeScript.
			const previous = list.findIndex((candidate) => candidate.prop === entry.prop);
			if (previous === -1) list.push(entry);
			else list[previous] = entry;
		}
	}
	return groups;
}

interface Scope {
	entries: SwapEntry[];
	conditions: string[];
}

/**
 * Render scopes as inline `{ ... }` bodies nested under `_condition:` keys,
 * all on ONE line: `{ prop: v, _hover: { prop: v } }`.
 */
function renderInlineScopes(scopes: Array<Scope>, sort = false): string {
	interface ScopeNode {
		entries: SwapEntry[];
		children: Map<string, ScopeNode>;
	}
	const root: ScopeNode = { entries: [], children: new Map() };
	for (const scope of scopes) {
		let node = root;
		for (const condition of scope.conditions) {
			let child = node.children.get(condition);
			if (child === undefined) {
				child = { entries: [], children: new Map() };
				node.children.set(condition, child);
			}
			node = child;
		}
		node.entries.push(...scope.entries);
	}

	const renderNode = (node: ScopeNode): string => {
		const entries = sort ? sortByCanonicalOrder(node.entries) : node.entries;
		const parts = entries.map(
			(e) =>
				`${e.prop.startsWith("--") ? JSON.stringify(e.prop) : (CSS_PROPERTY_ALIASES.get(e.prop) ?? e.prop)}: ${formatValue(e.value)}`,
		);
		for (const [condition, child] of [...node.children.entries()].toSorted(([a], [b]) =>
			a.localeCompare(b),
		)) {
			const key =
				condition.startsWith("&") || condition.startsWith("@")
					? JSON.stringify(condition)
					: `_${condition}`;
			parts.push(`${key}: { ${renderNode(child)} }`);
		}
		return parts.join(", ");
	};

	return renderNode(root);
}

const wrapCall = (callee: string, inner: string): string => `${callee}({ ${inner} })`;

/* ------------------------------------------------------------------ */
/* css.class                                                           */
/* ------------------------------------------------------------------ */

export const emitCssClass: Emitter = (ir, _meta, ctx) => {
	const groups = groupByConditions(ir.entries);
	const inner = renderInlineScopes(
		[...groups.values()].map((entries) => ({
			entries,
			conditions: entries[0]?.conditions ?? [],
		})),
		ctx.sort,
	);
	const text = inner.length > 0 ? wrapCall("css.class", inner) : "";
	return { text, residuals: [] };
};

/* ------------------------------------------------------------------ */
/* tw()                                                                */
/* ------------------------------------------------------------------ */

const camel = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

/** Forward bridge: camelProp|value -> utility class (WeakMap-cached). */
const forwardIndexCache = new WeakMap<PandwindMeta, Map<string, string>>();
function forwardIndex(meta: PandwindMeta): Map<string, string> {
	let index = forwardIndexCache.get(meta);
	if (index !== undefined) return index;
	index = new Map();
	for (const [utilityClass, { property, value }] of meta.bridgeInverse) {
		const key = `${camel(property).toLowerCase()}|${String(value).toLowerCase()}`;
		if (!index.has(key)) index.set(key, utilityClass);
	}
	forwardIndexCache.set(meta, index);
	return index;
}

const DATA_ARIA_VARIANT = /^(?:group|peer)-(?:data|aria)-\[/;

function isKnownVariant(meta: PandwindMeta, name: string): boolean {
	return meta.variants.has(name) || DATA_ARIA_VARIANT.test(name) || name === "*" || name === "**";
}

interface TwSlot {
	key: string;
	value: string | true;
}
type TwTree = Map<string, TwTree | TwSlot[]>;

function insertIntoTree(meta: PandwindMeta, tree: TwTree, entry: SwapEntry): string | null {
	let node = tree;
	for (const condition of entry.conditions) {
		if (!isKnownVariant(meta, condition)) {
			return `variant "${condition}" is not a generated tw variant`;
		}
		let child = node.get(condition);
		if (child === undefined || Array.isArray(child)) {
			child = new Map();
			node.set(condition, child as TwTree);
		}
		node = child as TwTree;
	}
	const utility = forwardIndex(meta).get(
		`${entry.prop.toLowerCase()}|${String(entry.value).toLowerCase()}`,
	);
	if (utility === undefined) {
		return `no utility for ${entry.prop}: ${String(entry.value)} (bridge miss)`;
	}
	const mapped = mapToken(utility, meta);
	if (mapped === null) {
		return `utility "${utility}" has no typed tw() key`;
	}
	const slots = node.get("");
	if (slots === undefined) node.set("", [{ key: mapped.key, value: mapped.value }]);
	else (slots as TwSlot[]).push({ key: mapped.key, value: mapped.value });
	return null;
}

function renderTwInline(tree: TwTree): string {
	const parts: string[] = [];
	for (const [name, child] of tree) {
		if (Array.isArray(child)) {
			for (const slot of child) {
				parts.push(`${slot.key}: ${formatValue(slot.value)}`);
			}
			continue;
		}
		parts.push(`${JSON.stringify(name)}: { ${renderTwInline(child)} }`);
	}
	return parts.join(", ");
}

const emitTwObject: Emitter = (ir, meta) => {
	const residuals: SwapIR["residuals"] = [];
	const tree: TwTree = new Map();
	let placed = 0;
	for (const entry of ir.entries) {
		const error = insertIntoTree(meta, tree, entry);
		if (error !== null) {
			residuals.push({
				kind: error.startsWith("variant") ? "unrepresentable" : "unknown-value",
				text: `${entry.prop}: ${String(entry.value)}`,
				hint: error,
			});
		} else placed++;
	}
	if (placed === 0 && ir.entries.length > 0) return { text: "", residuals };
	const text = placed > 0 ? `tw({ ${renderTwInline(tree)} })` : "";
	return { text, residuals };
};

/* ------------------------------------------------------------------ */
/* design vocabulary                                                   */
/* ------------------------------------------------------------------ */

/** Inverted preset tokens: group -> lowercase resolved value -> token key. */
const inverseTokensCache = new WeakMap<object, Map<string, Map<string, string>>>();
function inverseTokens(tokens: AnyTokens | undefined): Map<string, Map<string, string>> {
	if (tokens === undefined) return new Map();
	const cacheKey = tokens as object;
	let cached = inverseTokensCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const groups = new Map<string, Map<string, string>>();
	for (const [group, values] of Object.entries(tokens)) {
		const inverse = new Map<string, string>();
		for (const [tokenKey, tokenValue] of Object.entries(values)) {
			if (typeof tokenValue !== "string") continue;
			// RAW keys on purpose: $frame/$text values are consumed by
			// resolveDesignStyle again, so `$blue-500`/`lg` must round-trip
			// verbatim. Normalized refs are an external-target concern.
			if (!inverse.has(tokenValue.toLowerCase())) {
				inverse.set(tokenValue.toLowerCase(), tokenKey);
			}
		}
		groups.set(group, inverse);
	}
	inverseTokensCache.set(cacheKey, groups);
	return groups;
}

/**
 * Translate a resolved CSS value into a design-vocabulary token reference.
 * With tokenRefs "group", emits qualified refs (`colors.blue.500`).
 */
function toDesignTokenRef(
	tokens: AnyTokens | undefined,
	groups: ReadonlyArray<string>,
	value: string,
	mode: TokenRefMode,
	fallbackGroup: string,
): string | number | null {
	for (const group of groups) {
		const hit = inverseTokens(tokens).get(group)?.get(value.toLowerCase());
		if (hit !== undefined) {
			if (mode === "group") return `${group}.${hit}`;
			// Bare spacing keys are numbers in the vocabulary (pad: [4, 8]).
			return /^\d+$/.test(hit) ? Number(hit) : hit;
		}
	}
	void fallbackGroup;
	return null;
}

const splitList = (value: string): string[] | null => {
	const parts = value.trim().split(/\s+/);
	return parts.every((p) => p !== "") ? parts : null;
};

interface DesignScope {
	frame: Array<[string, unknown]>;
	layout: Array<[string, unknown]>;
	text: Array<[string, unknown]>;
	raw: Array<[string, unknown]>;
}

function placeEntry(
	entry: SwapEntry,
	scope: DesignScope,
	mode: TokenRefMode,
	tokens: AnyTokens | undefined,
): boolean {
	const str = typeof entry.value === "string" ? entry.value : String(entry.value);

	switch (entry.prop) {
		case "width":
			scope.frame.push(["w", str]);
			return true;
		case "height":
			scope.frame.push(["h", str]);
			return true;
		case "backgroundColor":
		case "background": {
			const ref = toDesignTokenRef(tokens, ["colors"], str, mode, "colors");
			if (ref === null) return false;
			scope.frame.push(["fill", ref]);
			return true;
		}
		case "borderRadius": {
			const list = splitList(str);
			if (list === null) return false;
			const refs = list.map((part) => toDesignTokenRef(tokens, ["radii"], part, mode, "radii"));
			if (refs.some((r) => r === null)) return false;
			scope.frame.push(["corners", refs.length === 1 ? (refs[0] as string) : (refs as string[])]);
			return true;
		}
		case "padding": {
			const list = splitList(str);
			if (list === null) return false;
			const refs = list.map((part) => toDesignTokenRef(tokens, ["spacing"], part, mode, "spacing"));
			if (refs.some((r) => r === null)) return false;
			scope.frame.push(["pad", refs.length === 1 ? refs[0] : refs]);
			return true;
		}
		case "paddingInline":
		case "paddingBlock": {
			const ref = toDesignTokenRef(tokens, ["spacing"], str, mode, "spacing");
			if (ref === null) return false;
			scope.frame.push([entry.prop === "paddingInline" ? "padX" : "padY", ref]);
			return true;
		}
		case "overflow":
			scope.frame.push(["overflow", str]);
			return true;
		case "zIndex":
			scope.frame.push(["z", str]);
			return true;
		case "opacity":
			scope.frame.push(["opacity", str]);
			return true;
		case "gap":
		case "columnGap":
		case "rowGap": {
			const ref = toDesignTokenRef(tokens, ["spacing"], str, mode, "spacing");
			if (ref === null) return false;
			scope.layout.push([
				entry.prop === "gap" ? "gap" : entry.prop === "columnGap" ? "gapX" : "gapY",
				ref,
			]);
			return true;
		}
		case "flexWrap": {
			if (str === "wrap") {
				scope.layout.push(["wrap", true]);
				return true;
			}
			return str === "nowrap"; // default value — drop silently
		}
		case "color": {
			const ref = toDesignTokenRef(tokens, ["colors"], str, mode, "colors");
			if (ref === null) return false;
			scope.text.push(["color", ref]);
			return true;
		}
		case "fontSize": {
			const ref = toDesignTokenRef(tokens, ["fontSizes"], str, mode, "fontSizes");
			if (ref === null) return false;
			scope.text.push(["size", ref]);
			return true;
		}
		case "fontWeight": {
			const ref = toDesignTokenRef(tokens, ["fontWeights"], str, mode, "fontWeights");
			if (ref === null) return false;
			scope.text.push(["weight", ref]);
			return true;
		}
		case "fontFamily": {
			const ref = toTokenRef(tokens, ["fonts"], str, mode, "fonts");
			if (ref === null) return false;
			scope.text.push(["font", ref]);
			return true;
		}
		case "textDecorationLine": {
			if (str === "underline" || str === "strikethrough" || str === "none") {
				scope.text.push(["decoration", str]);
				return true;
			}
			return false;
		}
		default:
			return false;
	}
}

// alias kept so both call shapes above stay valid if one is renamed later
const toTokenRef = toDesignTokenRef;

function emitDesignVocabWithCallee(
	callee: "css.class" | "dss",
	ir: SwapIR,
	meta: PandwindMeta,
	ctx: EmitterContext,
): EmitterResult {
	const residuals: SwapIR["residuals"] = [];
	const mode: TokenRefMode = ctx.tokenRefs ?? "bare";
	const groups = groupByConditions(ir.entries);
	const parts: string[] = [];
	for (const groupEntries of groups.values()) {
		const entries = ctx.sort === true ? sortByCanonicalOrder(groupEntries) : groupEntries;
		const conditions = entries[0]?.conditions ?? [];
		const scope: DesignScope = { frame: [], layout: [], text: [], raw: [] };
		// display:flex + flexDirection pair into $layout.flow; anything else
		// (display:block, grid, lone flexDirection…) falls to $raw.
		const displayFlex = entries.find((e) => e.prop === "display" && e.value === "flex");
		const direction = entries.find((e) => e.prop === "flexDirection");
		const flow =
			direction?.value === "row" ? "stackX" : direction?.value === "column" ? "stackY" : null;
		const flexPaired = displayFlex !== undefined && flow !== null;
		if (flexPaired) scope.layout.push(["flow", flow as string]);
		for (const entry of entries) {
			if (entry.prop === "display" || entry.prop === "flexDirection") {
				if (!flexPaired) {
					scope.raw.push([entry.prop, entry.value]);
					residuals.push({
						kind: "unknown-value",
						text: `${entry.prop}: ${String(entry.value)}`,
						hint: "display/flex-direction outside the designer vocabulary",
					});
				}
				continue;
			}
			if (!placeEntry(entry, scope, mode, meta.tokens)) {
				scope.raw.push([entry.prop, entry.value]);
				residuals.push({
					kind: "unknown-value",
					text: `${entry.prop}: ${String(entry.value)}`,
					hint: "outside the designer vocabulary — placed in $raw",
				});
			}
		}
		const modules: string[] = [];
		const renderModule = (name: string, pairs: Array<[string, unknown]>): void => {
			if (pairs.length === 0) return;
			modules.push(`${name}: { ${pairs.map(([k, v]) => `${k}: ${formatValue(v)}`).join(", ")} }`);
		};
		renderModule("$frame", scope.frame);
		renderModule("$layout", scope.layout);
		renderModule("$text", scope.text);
		renderModule("$raw", scope.raw);
		if (modules.length === 0) continue;
		let body = modules.join(", ");
		for (let i = conditions.length - 1; i >= 0; i--) {
			body = `_${conditions[i]}: { ${body} }`;
		}
		parts.push(body);
	}
	const text = parts.length > 0 ? `${callee}({ ${parts.join(", ")} })` : "";
	return { text, residuals };
}

const emitDesignVocab: Emitter = (ir, meta, ctx) =>
	emitDesignVocabWithCallee("css.class", ir, meta, ctx);

const emitDssVocab: Emitter = (ir, meta, ctx) => emitDesignVocabWithCallee("dss", ir, meta, ctx);

/* ------------------------------------------------------------------ */

export const SWAP_EMITTERS: Record<"css.class" | "design" | "dss" | "tw", Emitter> = {
	"css.class": emitCssClass,
	design: emitDesignVocab,
	dss: emitDssVocab,
	tw: emitTwObject,
};

type CoreTarget = keyof typeof SWAP_EMITTERS;
