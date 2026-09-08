import { StyleValueKindTag } from "./semantic-ir.ts";
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
import { ADAPTER_TOKEN_CATALOG_SCHEMA, type AdapterTokenCatalog } from "./adapter-contract.ts";
import type { StyleProgram } from "./semantic-ir.ts";

/** How emitted token references are qualified. */
export type TokenRefMode = "off" | "bare" | "group";

export const enum TokenRefModeTag {
	Off = "off",
	Group = "group",
}

/** Token spelling policies used by codemod target emitters. */
export const TokenReferenceFormat = {
	Preserve: "preserve",
	DotDelimited: "dot-delimited",
	Stitches: "stitches",
} as const;

export type TokenReferenceFormat = (typeof TokenReferenceFormat)[keyof typeof TokenReferenceFormat];

export const TOKEN_REFERENCE_FORMATS = [
	TokenReferenceFormat.Preserve,
	TokenReferenceFormat.DotDelimited,
	TokenReferenceFormat.Stitches,
] as const;

export interface TokenCatalogMatch {
	readonly group: string;
	readonly key: string;
	readonly authored: string;
	readonly ref: string;
	readonly resolved: string;
}

/** Return the statically resolved scalar carried by a StyleProgram value. */
export function resolvedStyleValue(
	value: StyleProgram["declarations"][number]["value"],
): string | number | undefined {
	if (value.kind === StyleValueKindTag.Literal)
		return typeof value.value === "string" || typeof value.value === "number"
			? value.value
			: undefined;
	return value.kind === StyleValueKindTag.Token ? value.resolved : undefined;
}

export type TokenGroupForProperty = (property: string) => string | undefined;
export type TokenReferenceFormatter = (
	match: TokenCatalogMatch,
	property: string,
	existingAuthored?: string,
) => string;

/** Normalize a preset token key (`$blue-500`, `4`, `lg`) to a ref (`blue.500`, `4`, `lg`). */
export function normalizeTokenKey(key: string): string {
	return key.replace(/^\$/, "").replace(/-/g, ".");
}

/**
 * Format a canonical token path for source emitted by a codemod.
 *
 * `preserve` only preserves an authored spelling when the source actually had
 * one. A reference synthesized from a resolved literal uses the canonical
 * dot-delimited path, which keeps new output free of the historical `$` form.
 */
export function formatTokenPath(
	path: string,
	format: TokenReferenceFormat = TokenReferenceFormat.Preserve,
	existingAuthored?: string,
): string {
	if (format === TokenReferenceFormat.Preserve && existingAuthored !== undefined)
		return existingAuthored;
	const normalized = normalizeTokenKey(path);
	return format === TokenReferenceFormat.Stitches
		? `$${normalized.replaceAll(".", "-")}`
		: normalized;
}

/** Format a catalog match according to a migration's token naming policy. */
export function formatTokenReference(
	match: TokenCatalogMatch,
	format: TokenReferenceFormat = TokenReferenceFormat.Preserve,
	existingAuthored?: string,
): string {
	return formatTokenPath(match.ref, format, existingAuthored);
}

function normalizedTokenValue(value: unknown): string | undefined {
	return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/**
 * Neutral token catalog used by config-loading adapters. It intentionally
 * knows nothing about Tailwind, Chakra, Panda, UnoCSS, or a target emitter.
 * Those adapters choose their own groups and native spelling after this
 * infrastructure has established an exact, unique value match.
 */
export class TokenCatalog {
	private constructor(private readonly catalog: AdapterTokenCatalog) {}

	static fromAnyTokens(tokens: AnyTokens | undefined): TokenCatalog | undefined {
		if (tokens === undefined) return undefined;
		const groups: Record<string, Record<string, string>> = {};
		for (const [group, values] of Object.entries(tokens)) {
			const normalized: Record<string, string> = {};
			for (const [key, value] of Object.entries(values)) {
				const scalar = normalizedTokenValue(value);
				if (scalar !== undefined) normalized[key] = scalar;
			}
			if (Object.keys(normalized).length > 0) groups[group] = normalized;
		}
		return TokenCatalog.fromGroups(groups);
	}

	static fromContract(catalog: AdapterTokenCatalog | undefined): TokenCatalog | undefined {
		return catalog === undefined || catalog.schema !== ADAPTER_TOKEN_CATALOG_SCHEMA
			? undefined
			: new TokenCatalog(catalog);
	}

	static fromGroups(
		groups: Readonly<Record<string, Readonly<Record<string, string>>>>,
	): TokenCatalog | undefined {
		if (Object.keys(groups).length === 0) return undefined;
		return new TokenCatalog({
			schema: ADAPTER_TOKEN_CATALOG_SCHEMA,
			groups,
		});
	}

	static fromNested(
		groups: Readonly<Record<string, unknown>> | undefined,
	): TokenCatalog | undefined {
		if (groups === undefined) return undefined;
		const flattened: Record<string, Record<string, string>> = {};
		for (const [group, values] of Object.entries(groups)) {
			const stack: Array<{ value: unknown; path: string[] }> = [{ value: values, path: [] }];
			while (stack.length > 0) {
				const current = stack.pop()!;
				const scalar = normalizedTokenValue(current.value);
				if (scalar !== undefined) {
					(flattened[group] ??= {})[current.path.join(".")] = scalar;
					continue;
				}
				if (
					typeof current.value !== "object" ||
					current.value === null ||
					Array.isArray(current.value)
				)
					continue;
				const record = current.value as Record<string, unknown>;
				if (Object.prototype.hasOwnProperty.call(record, "value")) {
					const boxed = normalizedTokenValue(record.value);
					if (boxed !== undefined) (flattened[group] ??= {})[current.path.join(".")] = boxed;
					// Conditional token values are intentionally not flattened. Their
					// active value depends on runtime theme state and cannot be safely
					// emitted as one static target reference.
					continue;
				}
				const entries = Object.entries(record);
				for (let index = entries.length - 1; index >= 0; index--) {
					const [key, child] = entries[index]!;
					stack.push({ value: child, path: [...current.path, key] });
				}
			}
		}
		return TokenCatalog.fromGroups(flattened);
	}

	get contract(): AdapterTokenCatalog {
		return this.catalog;
	}

	findUnique(groups: readonly string[], value: string): TokenCatalogMatch | undefined {
		const matches: TokenCatalogMatch[] = [];
		const lower = value.toLowerCase();
		for (const group of groups) {
			for (const [key, resolved] of Object.entries(this.catalog.groups[group] ?? {})) {
				if (resolved.toLowerCase() !== lower) continue;
				matches.push({
					group,
					key,
					authored: key,
					ref: normalizeTokenKey(key),
					resolved,
				});
			}
		}
		return matches.length === 1 ? matches[0] : undefined;
	}

	findByReference(groups: readonly string[], reference: string): TokenCatalogMatch | undefined {
		const normalized = normalizeTokenKey(reference).toLowerCase();
		const matches: TokenCatalogMatch[] = [];
		for (const group of groups) {
			for (const [key, resolved] of Object.entries(this.catalog.groups[group] ?? {})) {
				if (normalizeTokenKey(key).toLowerCase() !== normalized) continue;
				matches.push({
					group,
					key,
					authored: key,
					ref: normalizeTokenKey(key),
					resolved,
				});
			}
		}
		return matches.length === 1 ? matches[0] : undefined;
	}

	preserveProgram(
		program: StyleProgram,
		groupForProperty: TokenGroupForProperty,
		formatReference: TokenReferenceFormatter = (match) => match.authored,
	): StyleProgram {
		const preserveValue = (
			value: StyleProgram["declarations"][number]["value"],
			property: string,
		): typeof value => {
			const group = groupForProperty(property);
			if (group === undefined) return value;
			const match =
				value.kind === StyleValueKindTag.Token
					? (this.findByReference([group], value.ref) ??
						this.findUnique([group], value.resolved ?? "") ??
						undefined)
					: value.kind === StyleValueKindTag.Literal &&
						  (typeof value.value === "string" || typeof value.value === "number")
						? this.findUnique([group], String(value.value))
						: undefined;
			const authored =
				match === undefined
					? undefined
					: formatReference(
							match,
							property,
							value.kind === StyleValueKindTag.Token ? value.authored : undefined,
						);
			if (
				match === undefined ||
				authored === undefined ||
				(!/^[A-Za-z0-9_$][A-Za-z0-9_$.-]*$/u.test(authored) &&
					!/^var\(--[A-Za-z0-9_-]+\)$/u.test(authored))
			)
				return value;
			return {
				kind: "token",
				ref: match.ref,
				authored,
				resolved: match.resolved,
			};
		};
		const preserveRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
			...rule,
			declarations: rule.declarations.map((declaration) => ({
				...declaration,
				value: preserveValue(declaration.value, declaration.property),
			})),
			children: rule.children.map(preserveRule),
		});
		return {
			...program,
			declarations: program.declarations.map((declaration) => ({
				...declaration,
				value: preserveValue(declaration.value, declaration.property),
			})),
			rules: program.rules.map(preserveRule),
		};
	}
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

/**
 * Governance suggestions (plans/054) — structural mirror of the versioned
 * `RawTokenSuggestion` contract. The codemod does not depend on the
 * analyzer; the swap runner accepts precomputed suggestions from a
 * governance report (or a CLI lane) and validates them against the swap IR
 * before applying.
 */
export interface GovernanceSuggestionInput {
	readonly file: string;
	readonly start: number;
	readonly end: number;
	readonly property?: string;
	readonly rawValue: string;
	readonly tokenId: string;
	readonly replacement: string;
	readonly confidence: "verified" | "inferred" | "unknown";
}

/**
 * Property+value keyed lookup over governance suggestions. Only exact
 * (property, rawValue) pairs apply — the value→token map is evidence, not
 * permission to rewrite a different literal.
 */
export function suggestionLookup(
	suggestions: ReadonlyArray<GovernanceSuggestionInput>,
): ReadonlyMap<string, string> {
	const map = new Map<string, string>();
	for (const s of suggestions) {
		if (s.property === undefined || s.property === "") continue;
		map.set(s.property + "\u0000" + s.rawValue, s.replacement);
	}
	return map;
}
