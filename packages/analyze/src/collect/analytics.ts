/**
 * Style usage analytics (plans/023 #6) — panda-cloud-style insight into
 * HOW the app's styles are used, computed from the same source files the
 * coverage pass scans:
 *
 * - per-token usage counts (preset/theme `$tokens`), including ZERO-usage
 *   tokens when the caller supplies the full token universe;
 * - top properties and top property+value combinations across tw()/css
 *   call-site object literals;
 * - condition frequency with a responsive / pseudo / media-ish breakdown.
 *
 * Pure string analysis — brace-matched extraction, no AST dependency.
 */

import type { ConditionUsage, StyleUsageReport, UsageCount } from "./types.ts";

const RESPONSIVE = /^(sm|md|lg|xl|2xl|min|max|maxMd|maxLg)(:|$)/;
const PSEUDO =
	/^(hover|focus|focusWithin|focusVisible|active|visited|disabled|enabled|checked|placeholder|first|last|odd|even|firstLetter|firstLine|selection|marker|before|after|file|backdrop)$/;

function classifyCondition(name: string): ConditionUsage["kind"] {
	if (RESPONSIVE.test(name)) return "responsive";
	if (PSEUDO.test(name)) return "pseudo";
	if (
		/^(dark|light|motionSafe|motionReduce|contrastMore|contrastLess|print|portrait|landscape|ltr|rtl)$/.test(
			name,
		)
	)
		return "media";
	return "other";
}

/** Extract balanced `{ ... }` body starting at `open`. */
function matchBlock(source: string, open: number): string | null {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

interface Collected {
	properties: Map<string, number>;
	combos: Map<string, number>;
	conditions: Map<string, number>;
	tokens: Map<string, number>;
}

function walkObject(body: string, collected: Collected): void {
	let segment = "";
	const flushTopLevel = (): void => {
		const trimmed = segment.trim();
		segment = "";
		if (trimmed === "") return;
		const colon = trimmed.indexOf(":");
		if (colon === -1) return;
		const key = trimmed
			.slice(0, colon)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (key === "") return;
		// Condition keys reach here with an empty body right before their
		// opening brace — counted by the condition branch instead.
		const rawValue = trimmed.slice(colon + 1).trim();
		if (rawValue === "" || rawValue === "{" || rawValue === "[") return;
		collected.properties.set(key, (collected.properties.get(key) ?? 0) + 1);
		const value = rawValue.replace(/\s+/g, " ");
		collected.combos.set(`${key}: ${value}`, (collected.combos.get(`${key}: ${value}`) ?? 0) + 1);
		const unquoted = value.replace(/^["']|["']$/g, "");
		if (unquoted.startsWith("$")) {
			const token = unquoted.split(/[\s/[\]]/)[0]!;
			collected.tokens.set(token, (collected.tokens.get(token) ?? 0) + 1);
		}
	};
	for (let i = 0; i < body.length; i++) {
		const ch = body[i]!;
		if (ch === '"' || ch === "'" || ch === "`") {
			const quote = ch;
			segment += ch;
			i++;
			while (i < body.length && body[i] !== quote) {
				if (body[i] === "\\") {
					segment += body.slice(i, i + 2);
					i += 2;
					continue;
				}
				segment += body[i]!;
				i++;
			}
			if (i < body.length) segment += quote;
			continue;
		}
		if (ch === "/" && body[i + 1] === "/") {
			while (i < body.length && body[i] !== "\n") i++;
			continue;
		}
		if (ch === "{") {
			// read the condition key BEFORE flushTopLevel clears the segment
			const condName = /^["']?([\w$*-]+)["']?\s*:\s*$/.exec(segment.trim())?.[1] ?? "";
			flushTopLevel();
			if (condName !== "") {
				collected.conditions.set(condName, (collected.conditions.get(condName) ?? 0) + 1);
			}

			// find matching close to skip nested content but keep scanning siblings:
			// recurse so nested keys are counted under their own conditions.
			let innerDepth = 1;
			const innerStart = i + 1;
			while (i < body.length && innerDepth > 0) {
				i++;
				if (body[i] === "{") innerDepth++;
				else if (body[i] === "}") innerDepth--;
			}
			walkObject(body.slice(innerStart, i), collected);
			continue;
		}
		if (ch === ",") {
			flushTopLevel();
			continue;
		}
		segment += ch;
	}
	flushTopLevel();
}

const CALL_REGEX = /\b(?:tw|css)\s*(?:\.\s*\w+)?\s*\(\s*\{/g;

function topUsage(map: Map<string, number>, cap: number): UsageCount[] {
	return [...map.entries()]
		.map(([name, count]) => ({ name, count }))
		.toSorted((x, y) => y.count - x.count || x.name.localeCompare(y.name))
		.slice(0, cap);
}

export function analyzeStyleUsage(
	files: Array<{ file: string; content: string }>,
	tokenUniverse?: ReadonlyArray<string>,
): StyleUsageReport {
	const collected: Collected = {
		properties: new Map(),
		combos: new Map(),
		conditions: new Map(),
		tokens: new Map(),
	};
	let sitesScanned = 0;
	for (const file of files) {
		for (const match of file.content.matchAll(CALL_REGEX)) {
			const open = (match.index ?? 0) + match[0].length - 1;
			const body = matchBlock(file.content, open);
			if (body === null) continue;
			sitesScanned++;
			walkObject(body, collected);
		}
	}

	const tokenUsage = [...collected.tokens.entries()]
		.map(([name, count]) => ({ name, count }))
		.toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	const unusedTokens =
		tokenUniverse === undefined
			? []
			: [...tokenUniverse]
					.map((token) => (token.startsWith("$") ? token : `$${token}`))
					.filter((token) => !collected.tokens.has(token))
					.toSorted();

	const conditions: ConditionUsage[] = [...collected.conditions.entries()]
		.map(([name, count]) => ({ name, count, kind: classifyCondition(name.replace(/^\$/, "")) }))
		.toSorted((a, b) => b.count - a.count);

	const breakdown = { responsive: 0, pseudo: 0, media: 0, other: 0 };
	for (const c of conditions) breakdown[c.kind] += c.count;

	const topPropertyValues = [...collected.combos.entries()]
		.map(([combo, count]) => ({ combo, count }))
		.toSorted((a, b) => b.count - a.count)
		.slice(0, 20);

	return {
		sitesScanned,
		tokenUsage,
		unusedTokens,
		topProperties: topUsage(collected.properties, 20),
		topPropertyValues,
		conditions: conditions.slice(0, 30),
		conditionBreakdown: breakdown,
	};
}

/* ------------------------------------------------------------------ */
/* contrast checks (plans/023 follow-up)                               */
/* ------------------------------------------------------------------ */

/** Parse a color to sRGB [r,g,b] 0-255. Supports #rgb/#rrggbb + rgb()/rgba(). */
function parseColor(raw: string): Array<number> | null {
	const v = raw.trim().toLowerCase();
	if (v.startsWith("#")) {
		const hex = v.slice(1);
		if (/^[0-9a-f]{3}$/.test(hex)) {
			return [...hex].map((c) => Number.parseInt(c + c, 16));
		}
		if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{8}$/.test(hex)) {
			return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
		}
		return null;
	}
	const fn = /^(rgba?)\(([^)]+)\)$/.exec(v);
	if (fn !== null) {
		const parts = fn[2]!.split(",").map((p) => Number.parseFloat(p.trim()));
		if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
			return [parts[0]!, parts[1]!, parts[2]!];
		}
	}
	return null;
}

/** Linearize one sRGB channel (WCAG formula). */
const channel = (c: number): number => {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an sRGB color. */
function luminance(rgb: Array<number>): number {
	return 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
}

/** WCAG contrast ratio between two colors, rounded to 2 decimals. */
function contrastRatio(a: string, b: string): number | null {
	const ca = parseColor(a);
	const cb = parseColor(b);
	if (ca === null || cb === null) return null;
	const la = luminance(ca);
	const lb = luminance(cb);
	const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
	return Math.round(ratio * 100) / 100;
}

const FG_PROPS = new Set(["color", "textColor"]);
const BG_PROPS = new Set(["backgroundColor", "bg", "fill", "background", "bgColor"]);

interface FgBgPair {
	fg: string;
	bg: string;
}

/**
 * Contrast warnings across all scanned call sites. A pair is formed when one
 * object literal scope sets both a text-ish and a background-ish property
 * (the only pairing determinable from flat call-site data). Token values are
 * resolved through the preset's inverse index; unresolvable values are
 * skipped rather than guessed.
 *
 * Thresholds: < 4.5 fails normal text; < 3.0 also fails large text.
 */
export function computeContrastWarnings(
	files: Array<{ file: string; content: string }>,
	tokens: Record<string, string>,
): import("./types.ts").ContrastWarning[] {
	// authored token name ($gray-100) -> resolved color
	const tokenColors = new Map<string, string>();
	for (const [name, value] of Object.entries(tokens)) {
		if (typeof value === "string") {
			tokenColors.set(name.toLowerCase(), value);
			tokenColors.set(`$${name}`.toLowerCase(), value);
		}
	}

	const resolve = (value: string): string | null => {
		const unquoted = value.replace(/^["']|["']$/g, "").split(/[\s/[\]]/)[0]!;
		if (!unquoted.startsWith("$")) return parseColor(unquoted) !== null ? unquoted : null;
		return tokenColors.get(unquoted.toLowerCase()) ?? null;
	};

	const warnings: import("./types.ts").ContrastWarning[] = [];
	for (const file of files) {
		for (const match of file.content.matchAll(CALL_REGEX)) {
			const open = (match.index ?? 0) + match[0].length - 1;
			const body = matchBlock(file.content, open);
			if (body === null) continue;
			const pairs = collectPairs(body, resolve);
			for (const { fg, bg } of pairs) {
				const cf = resolve(fg);
				const cb = resolve(bg);
				if (cf === null || cb === null) continue;
				const ratio = contrastRatio(cf, cb);
				if (ratio === null || ratio >= 4.5) continue;
				warnings.push({
					file: file.file,
					fg: fg.replace(/^["']|["']$/g, ""),
					bg: bg.replace(/^["']|["']$/g, ""),
					ratio,
					severity: ratio < 3 ? "fail-large" : "fail-normal",
				});
			}
		}
	}
	return warnings.toSorted((a, b) => a.ratio - b.ratio);
}

/** Collect fg/bg authored values within ONE object-literal body. */
function collectPairs(body: string, resolve: (value: string) => string | null): Array<FgBgPair> {
	const fgs: string[] = [];
	const bgs: string[] = [];
	let segment = "";
	const consider = (raw: string): void => {
		const colon = raw.indexOf(":");
		if (colon === -1) return;
		const key = raw
			.slice(0, colon)
			.trim()
			.replace(/^["']|["']$/g, "");
		const value = raw.slice(colon + 1).trim();
		if (value === "" || value.startsWith("{") || value.startsWith("[")) return;
		if (FG_PROPS.has(key)) fgs.push(value);
		else if (BG_PROPS.has(key)) bgs.push(value);
	};
	for (let i = 0; i < body.length; i++) {
		const ch = body[i]!;
		if (ch === '"' || ch === "'" || ch === "`") {
			const quote = ch;
			segment += ch;
			i++;
			while (i < body.length && body[i] !== quote) {
				if (body[i] === "\\") {
					segment += body.slice(i, i + 2);
					i += 2;
					continue;
				}
				segment += body[i]!;
				i++;
			}
			if (i < body.length) segment += quote;
			continue;
		}
		if (ch === "/" && body[i + 1] === "/") {
			while (i < body.length && body[i] !== "\n") i++;
			continue;
		}
		if (ch === "{") {
			let depth = 1;
			while (i < body.length && depth > 0) {
				i++;
				if (body[i] === "{") depth++;
				else if (body[i] === "}") depth--;
			}
			segment = "";
			continue;
		}
		if (ch === ",") {
			consider(segment.trim());
			segment = "";
			continue;
		}
		segment += ch;
	}
	consider(segment.trim());
	void resolve;
	const pairs: Array<FgBgPair> = [];
	for (const fg of fgs) {
		for (const bg of bgs) pairs.push({ fg, bg });
	}
	return pairs;
}

/* ------------------------------------------------------------------ */
/* prune-changeset generation                                          */
/* ------------------------------------------------------------------ */

/**
 * .changeset markdown content proposing removal of zero-use tokens.
 * Read-only generation: callers write the file if they choose to.
 */
export function buildPruneChangeset(
	unusedTokens: ReadonlyArray<string>,
	appLabel = "app",
): string | null {
	if (unusedTokens.length === 0) return null;
	const list = unusedTokens.map((t) => `- \`${t}\``).join("\n");
	return [
		"---",
		'"pandwind": patch',
		"---",
		"",
		`Remove ${unusedTokens.length} unused design token(s) from the ${appLabel} preset`,
		"",
		"Zero-usage tokens found by the inspector analytics pass:",
		"",
		list,
		"",
	].join("\n");
}
