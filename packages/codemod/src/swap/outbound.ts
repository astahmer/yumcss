/**
 * Outbound swap emitters (plans/022): SwapIR -> EXTERNAL style libraries.
 *
 * This is the reverse direction of the inbound --from= passes: pandwind
 * sources can be exported to plain Tailwind class strings, panda-css or
 * stylex. Each adapter is one emitter + one registry line — the plan's
 * explicit extensibility bar.
 *
 * - tailwind: bridge-forward lookup -> short utilities, misses degrade to
 *   arbitrary-property classes (`[prop:value]`), conditions become variant
 *   prefixes (`hover:`). No imports needed.
 * - panda: `css({ camelCase })` with panda-native condition keys (`_hover`
 *   mirrors our own nesting); emits the styled-system/css import.
 * - stylex: file-structural — one `stylex.create({ sN: {...} })` block is
 *   injected after the imports and each call site becomes
 *   `stylex.props(styles.sN)`. Pseudo conditions map to stylex's `:hover`
 *   selector syntax; dark mode maps to the prefers-color-scheme media query.
 */
import type { PandwindMeta } from "../meta.ts";
import type { SwapEntry, SwapIR } from "./ir.ts";
import type { Emitter } from "./emit.ts";
import { authoredTokenRef, qualifyRef, resolvedTokenRef } from "./tokens.ts";

/** IR prop -> preset token group, for token-reference emission. */
const PROP_GROUP: Record<string, string> = {
	backgroundColor: "colors",
	background: "colors",
	color: "colors",
	borderRadius: "radii",
	padding: "spacing",
	paddingTop: "spacing",
	paddingRight: "spacing",
	paddingBottom: "spacing",
	paddingLeft: "spacing",
	margin: "spacing",
	gap: "spacing",
	columnGap: "spacing",
	rowGap: "spacing",
	width: "spacing",
	height: "spacing",
	fontSize: "fontSizes",
};

/** One entry's value as a panda token ref (or literal when refs are off). */
function pandaValue(
	entry: SwapEntry,
	mode: "off" | "bare" | "group",
	tokens: import("pandwind/types/typings").AnyTokens | undefined,
): string | true | number | Array<string | number> {
	if (mode === "off") return entry.value;
	if (typeof entry.value === "string") {
		// Authored pandwind tokens keep their identity ($gray-100 -> gray.100).
		const authored = authoredTokenRef(entry.value);
		if (authored !== null) {
			const g = PROP_GROUP[entry.prop] ?? "colors";
			return mode === "group" ? qualifyRef(authored, g) : authored;
		}
		// Resolved values round-trip through the preset.
		const group = PROP_GROUP[entry.prop];
		if (group === undefined) return entry.value;
		const ref = resolvedTokenRef([group], entry.value, tokens);
		if (ref === null) return entry.value;
		return mode === "group" ? qualifyRef(ref, group) : ref;
	}
	return entry.value;
}

const camel = (prop: string): string =>
	prop.replace(/-(\w|$)/g, (_m, char: string) => char.toUpperCase());

/* ------------------------------------------------------------------ */
/* tailwind                                                            */
/* ------------------------------------------------------------------ */

/** prop|value(lowercased) -> utility; WeakMap-cached per meta. */
const forwardCache = new WeakMap<PandwindMeta, Map<string, string>>();
function forwardIndex(meta: PandwindMeta): Map<string, string> {
	let index = forwardCache.get(meta);
	if (index !== undefined) return index;
	index = new Map();
	for (const [utilityClass, { property, value }] of meta.bridgeInverse) {
		const key = `${camel(property).toLowerCase()}|${String(value).toLowerCase()}`;
		if (!index.has(key)) index.set(key, utilityClass);
	}
	forwardCache.set(meta, index);
	return index;
}

/** Arbitrary-property fallback: [prop:value] — always representable. */
const arbitraryClass = (entry: SwapEntry): string => {
	const dash = entry.prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
	const value = entry.value === true ? "true" : String(entry.value);
	return `[${dash}:${value}]`;
};

export const emitTailwindClasses: Emitter = (ir, meta) => {
	const residuals: SwapIR["residuals"] = [];
	// group by condition chain to build prefixed class runs
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else list.push(entry);
	}
	const classNames: string[] = [];
	for (const [key, entries] of groups) {
		const conditions = key === "" ? [] : key.split("__");
		const prefix = conditions.length > 0 ? `${conditions.join(":")}:` : "";
		for (const entry of entries) {
			const utility = forwardIndex(meta).get(
				`${camel(entry.prop).toLowerCase()}|${String(entry.value).toLowerCase()}`,
			);
			if (utility !== undefined) {
				classNames.push(`${prefix}${utility}`);
				continue;
			}
			if (conditions.length === 0) {
				classNames.push(arbitraryClass(entry));
				continue;
			}
			// Arbitrary values under variants need the arbitrary-variant syntax
			// `[&:hover]:[prop:value]` — representable, but noisy; keep it.
			const variantSelector = conditions.map((c) => `&:${c}`).join("");
			classNames.push(`[${variantSelector}]:${arbitraryClass(entry)}`);
		}
	}
	const text = classNames.length > 0 ? JSON.stringify(classNames.join(" ")) : "";
	void residuals;
	return { text, residuals };
};

/* ------------------------------------------------------------------ */
/* panda                                                               */
/* ------------------------------------------------------------------ */

export const PANDA_IMPORT = 'import { css } from "styled-system/css";';

/**
 * Panda's condition keys (`_hover`, `_dark`) mirror pandwind's own — the
 * IR nests 1:1. Token values stay resolved literals (v1; token-function
 * emission is out of scope per the plan).
 */
function formatPandaValue(value: string | true | number | Array<string | number>): string {
	return typeof value === "string"
		? JSON.stringify(value)
		: Array.isArray(value)
			? `[${value.map((v) => formatPandaValue(v)).join(", ")}]`
			: String(value);
}

export const emitPanda: Emitter = (ir, meta, ctx) => {
	const mode = ctx.tokenRefs ?? "bare";
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else list.push(entry);
	}
	const parts: string[] = [];
	for (const [key, entries] of groups) {
		const conditions = key === "" ? [] : key.split("__");
		const body = entries
			.map((e) => `${e.prop}: ${formatPandaValue(pandaValue(e, mode, meta.tokens))}`)
			.join(", ");
		if (conditions.length === 0) {
			parts.unshift(body); // unconditional props first
			continue;
		}
		let nested = `{ ${body} }`;
		for (let i = conditions.length - 1; i >= 0; i--) {
			nested = `_${conditions[i]}: ${nested}`;
		}
		parts.push(nested);
	}
	const text = parts.length > 0 ? `css({ ${parts.join(", ")} })` : "";
	return {
		text,
		residuals: [],
		imports: parts.length > 0 ? [PANDA_IMPORT] : [],
	};
};

/* ------------------------------------------------------------------ */
/* stylex                                                              */
/* ------------------------------------------------------------------ */

export const STYLEX_IMPORT = 'import * as stylex from "@stylexjs/stylex";';
export const STYLEX_STYLES_NAME = "swapStyles";

const STYLEX_CONDITION_MAP: Record<string, string> = {
	hover: ":hover",
	focus: ":focus",
	active: ":active",
	visited: ":visited",
	dark: "@media (prefers-color-scheme: dark)",
	light: "@media (prefers-color-scheme: light)",
};

function toStylexCondition(name: string): string | null {
	if (STYLEX_CONDITION_MAP[name] !== undefined) return STYLEX_CONDITION_MAP[name];
	// data-* / aria-* attribute conditions map to stylex attribute selectors
	const dataMatch = /^data[-a-z]*$/.exec(name);
	if (dataMatch !== null) return `[\\${name}]`;
	return null;
}

/**
 * Per-call replacement text is `stylex.props(<STYLES_NAME>.s<N>)`; the
 * created-styles block rides back via `headers` so runSwap injects it once
 * per file after the import section.
 */
const renderEntries = (entries: SwapEntry[], indent: string): string[] =>
	entries.map((e) => `${indent}${e.prop}: ${JSON.stringify(String(e.value))},`);

export const emitStylex: Emitter = (ir, _meta, ctx) => {
	const name = `s${ctx.index}`;
	const groups = new Map<string, SwapEntry[]>();
	for (const entry of ir.entries) {
		const key = entry.conditions.join("__");
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [entry]);
		else list.push(entry);
	}
	const bodyLines: string[] = [];
	for (const [key, entries] of groups) {
		const conditions = key === "" ? [] : key.split("__");
		const stylexConditions: string[] = [];
		let unsupported = false;
		for (const condition of conditions) {
			const mapped = toStylexCondition(condition);
			if (mapped === null) {
				unsupported = true;
				break;
			}
			stylexConditions.push(mapped);
		}
		if (unsupported) {
			bodyLines.push(
				`\t\t// pandwind:migrate-skip (condition "${key}" is not expressible in stylex)`,
			);
			continue;
		}
		let body = renderEntries(entries, "\t\t\t");
		for (let i = stylexConditions.length - 1; i >= 0; i--) {
			const sel = stylexConditions[i]!;
			body = [`\t\t\t${JSON.stringify(sel)}: {`, ...body, `\t\t\t},`];
		}
		bodyLines.push(...body);
	}
	const header = `const ${STYLEX_STYLES_NAME} = stylex.create({\n\t${name}: {\n${bodyLines.join("\n")}\n\t},\n});`;
	return {
		text: `stylex.props(${STYLEX_STYLES_NAME}.${name})`,
		residuals: [],
		headers: [header],
		imports: [STYLEX_IMPORT],
	};
};
export const SWAP_OUTBOUND_EMITTERS: Record<"tailwind" | "panda" | "stylex", Emitter> = {
	tailwind: emitTailwindClasses,
	panda: emitPanda,
	stylex: emitStylex,
};

export type OutboundTarget = keyof typeof SWAP_OUTBOUND_EMITTERS;
