/**
 * Token-reference helpers (plans/022 follow-up): map resolved values /
 * authored `$token` strings onto TARGET-library token references.
 *
 * References are derived from the app's own DTCG preset (the same source
 * the bridge was generated from), so `#3182ce` -> `blue.500` ->
 * `colors.blue.500` always round-trips against the design system the call
 * sites were written for.
 */

import type { AnyTokens } from "pandwind/types/typings";

/** How emitted token references are qualified. */
export type TokenRefMode = "off" | "bare" | "group";

/** Normalize a preset token key (`$blue-500`, `4`, `lg`) to a ref (`blue.500`, `4`, `lg`). */
export function normalizeTokenKey(key: string): string {
	return key.replace(/^\$/, "").replace(/-/g, ".");
}

/** group -> lowercase resolved value -> normalized ref (WeakMap-cached). */
const inverseCache = new WeakMap<object, Map<string, Map<string, string>>>();
function inverseGroups(tokens: AnyTokens | undefined): Map<string, Map<string, string>> {
	if (tokens === undefined) return new Map();
	const cacheKey = tokens as object;
	let cached = inverseCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const groups = new Map<string, Map<string, string>>();
	for (const [group, values] of Object.entries(tokens)) {
		const inverse = new Map<string, string>();
		for (const [tokenKey, tokenValue] of Object.entries(values)) {
			if (typeof tokenValue !== "string") continue;
			if (!inverse.has(tokenValue.toLowerCase())) {
				inverse.set(tokenValue.toLowerCase(), normalizeTokenKey(tokenKey));
			}
		}
		groups.set(group, inverse);
	}
	inverseCache.set(cacheKey, groups);
	return groups;
}

/**
 * Authored `$blue-500` -> `blue.500` (group unknowable without resolution).
 * Returns null for non-token strings.
 */
export function authoredTokenRef(value: string): string | null {
	if (!value.startsWith("$")) return null;
	return normalizeTokenKey(value);
}

/** Resolved value -> ref by searching the preset groups (`#3182ce` -> `blue.500`). */
export function resolvedTokenRef(
	groups: ReadonlyArray<string>,
	value: string,
	tokens?: AnyTokens,
): string | null {
	const lower = value.toLowerCase();
	for (const group of groups) {
		const hit = inverseGroups(tokens).get(group)?.get(lower);
		if (hit !== undefined) return hit;
	}
	return null;
}

/** Qualify a bare ref with its group (`blue.500` -> `colors.blue.500`). */
export function qualifyRef(ref: string, group: string): string {
	return `${group}.${ref}`;
}

/**
 * Resolved value -> AUTHORED preset token (`#3182ce` -> `$blue-500`).
 * Searches every group; returns the raw key form used by pandwind call sites.
 */
export function resolvedAuthoredToken(value: string, tokens?: AnyTokens): string | null {
	if (tokens === undefined) return null;
	const lower = value.toLowerCase();
	for (const values of Object.values(tokens)) {
		for (const [tokenKey, tokenValue] of Object.entries(values)) {
			if (typeof tokenValue === "string" && tokenValue.toLowerCase() === lower) return tokenKey;
		}
	}
	return null;
}
