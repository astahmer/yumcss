/**
 * Unresolved-token detection for the vite inline passes — the fail-fast
 * lane behind `YumCSSViteOptions.onUnresolved`.
 *
 * A statically-folded class token is "unresolved" when it is NOT part of
 * the design system:
 *
 * - ARBITRARY VALUES (`w-[13px]`, `[margin-top:7px]`) compile fine but
 *   bypass the token vocabulary — exactly the raw values strict mode
 *   exists to catch;
 * - NO-CSS TOKENS (`bg-notacolor`) render unstyled — Tailwind will never
 *   compile them.
 *
 * Candidate resolution mirrors `tokenHasCss` in packages/analyze (variant
 * prefixes + conflict-map membership): a token has CSS when, after
 * stripping variant prefixes, the generated conflict map knows it. The map
 * is derived from real Tailwind compilation, so membership implies
 * compilability. Kept as a local copy on purpose: analyze consumes yumcss,
 * so the dependency arrow points the other way; revisit if it ever grows
 * beyond this one function.
 */
import type { TwConfig } from "./inline.ts";

/** Why a token was flagged by `collectUnresolvedTokens`. */
type UnresolvedReason = "arbitrary" | "no-css";

export interface UnresolvedToken {
	token: string;
	/** 1-based source line of the call site that produced the token. */
	line: number;
	reason: UnresolvedReason;
}

/** Index of the top-level colon separating variant prefixes from the utility. */
const topLevelColon = (token: string): number => {
	let depth = 0;
	for (let i = 0; i < token.length; i++) {
		const char = token[i];
		if (char === "[") depth++;
		else if (char === "]") depth--;
		else if (char === ":" && depth === 0) return i;
	}
	return -1;
};

/**
 * Does Tailwind compile this token? Variant prefixes must all be known;
 * arbitrary brackets always compile; otherwise the token must appear in the
 * generated conflict map (whole-key, value, opacity-modified or `*` entry).
 * No map => the lane is disabled and everything is assumed compilable.
 */
export const tokenHasCss = (token: string, config: TwConfig): boolean => {
	return checkTokenCss(token, config, true);
};

/**
 * Strict variant of `tokenHasCss` for candidate registration: the value
 * must be an explicit conflict-map entry for that utility. The per-utility
 * wildcard (`"*"`) fallback (arbitrary values, opacity-modified colors) does
 * not count on its own — a finite dynamic set may only register tokens the
 * generated design system actually defines, never a guessed class. For
 * utilities whose conflict entries collapsed to the wildcard (all values
 * share one property shape, so the map cannot distinguish theme values from
 * typos), verification falls back to the generated real value catalog
 * (`wildcardValues`). No map/catalog => the lane is disabled.
 */
export const tokenHasExactCss = (token: string, config: TwConfig): boolean =>
	checkTokenCss(token, config, false);

function checkTokenCss(token: string, config: TwConfig, allowFallback: boolean): boolean {
	let rest = token;
	for (;;) {
		const colon = topLevelColon(rest);
		if (colon === -1) break;
		const prefix = rest.slice(0, colon);
		if (config.variants?.[prefix] === undefined) return false;
		rest = rest.slice(colon + 1);
	}
	if (rest.includes("[")) return allowFallback;
	if (config.conflicts === undefined) return true;
	const conflicts = config.conflicts;
	const whole = conflicts[rest];
	if (whole !== undefined) return Object.keys(whole).length > 0;
	let i = rest.length;
	for (;;) {
		i = rest.lastIndexOf("-", i - 1);
		if (i <= 0) return false;
		const utility = rest.slice(0, i);
		const byValue = conflicts[utility];
		if (byValue === undefined) continue;
		const value = rest.slice(i + 1);
		if (byValue[value] !== undefined || (allowFallback && byValue["*"] !== undefined)) {
			return true;
		}
		if (!allowFallback && config.wildcardValues !== undefined) {
			const wildcard = config.wildcardValues[utility];
			if (wildcard !== undefined) return wildcard.has(value);
		}
		const slash = value.lastIndexOf("/");
		if (slash > 0 && slash < value.length - 1 && byValue[value.slice(0, slash)] !== undefined) {
			return true;
		}
	}
}

/** Line index for one module: offset -> 1-based line (built lazily once). */
export interface LineIndex {
	lineOf(offset: number): number;
}

export const createLineIndex = (code: string): LineIndex => {
	const starts: number[] = [0];
	for (let i = 0; i < code.length; i++) {
		if (code[i] === "\n") starts.push(i + 1);
	}
	return {
		lineOf(offset: number): number {
			let line = 0;
			for (const start of starts) {
				if (start > offset) break;
				line++;
			}
			return Math.max(line, 1);
		},
	};
};

/**
 * Split a folded class string into whitespace-separated tokens and flag the
 * ones outside the design system. Custom/foreign classes passed through
 * cx() will false-positive here — same caveat as analyze's missing-CSS lane.
 */
export const collectUnresolvedTokens = (
	classString: string,
	line: number,
	config: TwConfig,
): UnresolvedToken[] => {
	const found: UnresolvedToken[] = [];
	for (const token of classString.split(/\s+/)) {
		if (token === "") continue;
		// Arbitrary values always have CSS but are off-system by definition.
		if (token.includes("[")) {
			found.push({ token, line, reason: "arbitrary" });
			continue;
		}
		if (!tokenHasCss(token, config)) found.push({ token, line, reason: "no-css" });
	}
	return found;
};
