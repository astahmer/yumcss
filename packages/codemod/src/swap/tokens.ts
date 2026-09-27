import { AdapterCapabilityTag } from "./identifiers.ts";
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
import {
	ADAPTER_TOKEN_CATALOG_SCHEMA,
	ADAPTER_TOKEN_POLICY_SCHEMA,
	type AdapterEmitContext,
	type AdapterTokenCatalog,
	type AdapterTokenPolicy,
} from "./adapter-contract.ts";
import type { StyleProgram, StyleProgramResidual, StyleValue } from "./semantic-ir.ts";

const materializeSourceTokenValue = (
	value: StyleValue,
	residuals: StyleProgramResidual[],
): StyleValue => {
	if (value.kind !== StyleValueKindTag.Token) return value;
	if (value.resolved !== undefined)
		return { kind: StyleValueKindTag.Literal, value: value.resolved };
	if (
		!residuals.some(
			(residual) =>
				residual.kind === AdapterCapabilityTag.TokenValues && residual.text === value.authored,
		)
	)
		residuals.push({
			kind: AdapterCapabilityTag.TokenValues,
			text: value.authored,
			hint: `source token ${value.ref} has no verified target value`,
		});
	return value;
};

/** Resolve foreign token nodes to CSS values unless a target policy proves a native reference. */
export function materializeSourceTokenValues(program: StyleProgram): StyleProgram {
	const residuals = [...program.residuals];
	const materialize = (declaration: StyleProgram["declarations"][number]) => ({
		...declaration,
		value: materializeSourceTokenValue(declaration.value, residuals),
	});
	const materializeRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.map(materialize),
		children: rule.children.map(materializeRule),
	});
	return {
		...program,
		declarations: program.declarations.map(materialize),
		rules: program.rules.map(materializeRule),
		residuals,
	};
}

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

export interface TokenCatalogNearestMatch extends TokenCatalogMatch {
	/** Lower is closer; zero means an exact normalized value match. */
	readonly distance: number;
}

export interface TokenCatalogNearestOptions {
	readonly maxDistance?: number;
	readonly maxResults?: number;
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

export type TokenGroupForProperty = (property: string) => string | readonly string[] | undefined;

const tokenGroupsFor = (property: string, resolve: TokenGroupForProperty): readonly string[] => {
	const groups = resolve(property);
	return groups === undefined ? [] : typeof groups === "string" ? [groups] : groups;
};
export type TokenReferenceFormatter = (
	match: TokenCatalogMatch,
	property: string,
	existingAuthored?: string,
) => string;

/**
 * Recover a source token without manufacturing a source-library CSS variable.
 *
 * Source adapters use this before target projection. An exact authored path or
 * resolved scalar becomes neutral token IR; everything else stays untouched so
 * the migration runner can preserve it as a residual instead of guessing a
 * foreign runtime variable.
 */
export function recoverSourceToken(
	value: StyleValue,
	property: string,
	groupForProperty: TokenGroupForProperty,
	catalog: TokenCatalog | undefined,
): StyleValue {
	const groups = tokenGroupsFor(property, groupForProperty);
	if (groups.length === 0 || catalog === undefined) return value;
	const match =
		value.kind === StyleValueKindTag.Token
			? (catalog.findByReference(groups, value.ref) ??
				(value.resolved === undefined ? undefined : catalog.findUnique(groups, value.resolved)))
			: value.kind === StyleValueKindTag.Literal &&
				  (typeof value.value === "string" || typeof value.value === "number")
				? (catalog.findByReference(groups, String(value.value)) ??
					catalog.findUnique(groups, String(value.value)))
				: undefined;
	if (match === undefined) return value;
	const authored =
		value.kind === StyleValueKindTag.Token
			? value.authored
			: value.kind === StyleValueKindTag.Literal
				? String(value.value)
				: undefined;
	if (authored === undefined) return value;
	return {
		kind: StyleValueKindTag.Token,
		ref: match.ref,
		authored,
		resolved: match.resolved,
	};
}

/**
 * Build the shared target-token policy used by ecosystem adapters.
 *
 * Group selection and target spelling remain adapter-owned. Catalog lookup,
 * exact matching, and preservation of unresolved values stay in one neutral
 * implementation so each adapter cannot accidentally grow a subtly different
 * token policy.
 */
export function createTokenPolicy(
	groupForProperty: TokenGroupForProperty,
	formatReference: TokenReferenceFormatter = (match) => match.authored,
	resolveCatalog: (context: AdapterEmitContext) => TokenCatalog | undefined = (context) =>
		TokenCatalog.fromContract(context.config.tokenCatalog),
): AdapterTokenPolicy {
	return {
		schema: ADAPTER_TOKEN_POLICY_SCHEMA,
		preserve: (program, context) => {
			const catalog = resolveCatalog(context);
			return catalog === undefined
				? materializeSourceTokenValues(program)
				: catalog.preserveProgram(program, groupForProperty, formatReference);
		},
	};
}

/** Normalize a legacy `$blue-500` key to a dot-delimited ref. */
export function normalizeTokenKey(key: string): string {
	return key.startsWith("$") ? key.slice(1).replaceAll("-", ".") : key;
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

const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu;
const DIMENSION = /^(-?(?:\d+|\d*\.\d+))([a-z%]+)$/iu;

const hexColorChannels = (value: string): readonly number[] | undefined => {
	if (!HEX_COLOR.test(value)) return undefined;
	const hex = value.slice(1);
	const expanded =
		hex.length === 3 || hex.length === 4 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
	const channels = [0, 2, 4].map((offset) =>
		Number.parseInt(expanded.slice(offset, offset + 2), 16),
	);
	return channels.every(Number.isFinite) ? channels : undefined;
};

const levenshteinDistance = (left: string, right: string): number => {
	const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 0; leftIndex < left.length; leftIndex++) {
		const current = [leftIndex + 1];
		for (let rightIndex = 0; rightIndex < right.length; rightIndex++) {
			current.push(
				Math.min(
					current[rightIndex]! + 1,
					previous[rightIndex + 1]! + 1,
					previous[rightIndex]! + (left[leftIndex] === right[rightIndex] ? 0 : 1),
				),
			);
		}
		previous.splice(0, previous.length, ...current);
	}
	return previous[right.length]!;
};

const tokenValueDistance = (left: string, right: string): number => {
	const normalizedLeft = left.trim().toLowerCase().replace(/\s+/gu, " ");
	const normalizedRight = right.trim().toLowerCase().replace(/\s+/gu, " ");
	if (normalizedLeft === normalizedRight) return 0;
	const leftColor = hexColorChannels(normalizedLeft);
	const rightColor = hexColorChannels(normalizedRight);
	if (leftColor !== undefined && rightColor !== undefined) {
		const distance = Math.hypot(
			leftColor[0]! - rightColor[0]!,
			leftColor[1]! - rightColor[1]!,
			leftColor[2]! - rightColor[2]!,
		);
		return Math.min(1, distance / Math.sqrt(3 * 255 ** 2));
	}
	const leftDimension = DIMENSION.exec(normalizedLeft);
	const rightDimension = DIMENSION.exec(normalizedRight);
	if (
		leftDimension?.[1] !== undefined &&
		leftDimension[2] !== undefined &&
		rightDimension?.[1] !== undefined &&
		rightDimension[2] !== undefined &&
		leftDimension[2] === rightDimension[2]
	) {
		const leftNumber = Number(leftDimension[1]);
		const rightNumber = Number(rightDimension[1]);
		return Math.min(
			1,
			Math.abs(leftNumber - rightNumber) / Math.max(1, Math.abs(leftNumber), Math.abs(rightNumber)),
		);
	}
	return (
		levenshteinDistance(normalizedLeft, normalizedRight) /
		Math.max(normalizedLeft.length, normalizedRight.length, 1)
	);
};

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

	nearest(
		groups: readonly string[],
		value: string | number,
		options: TokenCatalogNearestOptions = {},
	): readonly TokenCatalogNearestMatch[] {
		const maxDistance = options.maxDistance ?? 0.35;
		const maxResults = Math.max(1, options.maxResults ?? 3);
		const matches: TokenCatalogNearestMatch[] = [];
		const seenGroups = new Set<string>();
		for (const group of groups) {
			if (seenGroups.has(group)) continue;
			seenGroups.add(group);
			for (const [key, resolved] of Object.entries(this.catalog.groups[group] ?? {})) {
				const distance = tokenValueDistance(String(value), resolved);
				if (distance > maxDistance) continue;
				matches.push({
					group,
					key,
					authored: key,
					ref: normalizeTokenKey(key),
					resolved,
					distance,
				});
			}
		}
		return matches
			.toSorted(
				(left, right) =>
					left.distance - right.distance ||
					left.group.localeCompare(right.group) ||
					left.key.localeCompare(right.key),
			)
			.slice(0, maxResults);
	}

	preserveProgram(
		program: StyleProgram,
		groupForProperty: TokenGroupForProperty,
		formatReference: TokenReferenceFormatter = (match) => match.authored,
	): StyleProgram {
		const residuals = [...program.residuals];
		const preserveValue = (
			value: StyleProgram["declarations"][number]["value"],
			property: string,
		): typeof value => {
			const groups = tokenGroupsFor(property, groupForProperty);
			if (groups.length === 0) return materializeSourceTokenValue(value, residuals);
			let match: TokenCatalogMatch | undefined;
			if (value.kind === StyleValueKindTag.Token) {
				if (value.resolved !== undefined) {
					const reference = this.findByReference(groups, value.ref);
					match =
						reference?.resolved === value.resolved
							? reference
							: this.findUnique(groups, value.resolved);
				}
			} else if (
				value.kind === StyleValueKindTag.Literal &&
				(typeof value.value === "string" || typeof value.value === "number")
			)
				match = this.findUnique(groups, String(value.value));
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
				return materializeSourceTokenValue(value, residuals);
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
			residuals,
		};
	}
}

const camelTokenProperty = (property: string): string =>
	property.replace(/-([a-z])/gu, (_match, character: string) => character.toUpperCase());

export function tokenGroupsForProperty(property: string): readonly string[] {
	const normalized = camelTokenProperty(property);
	if (
		/^(?:background|bg|color|textColor|borderColor|outlineColor|accentColor|fill|stroke)/u.test(
			normalized,
		)
	)
		return ["colors", "semantic"];
	if (
		/^(?:padding|margin|gap|rowGap|columnGap|inset|top|right|bottom|left|width|minWidth|maxWidth|height|minHeight|maxHeight|borderWidth)/u.test(
			normalized,
		)
	)
		return ["spacing"];
	if (/^(?:borderRadius|radius)/u.test(normalized)) return ["radii"];
	if (normalized.startsWith("fontSize")) return ["fontSizes"];
	if (normalized.startsWith("fontWeight")) return ["fontWeights"];
	if (normalized.startsWith("lineHeight")) return ["lineHeights"];
	if (normalized.startsWith("letterSpacing")) return ["letterSpacings"];
	if (/^(?:fontFamily|font)/u.test(normalized)) return ["fonts"];
	if (/^(?:boxShadow|textShadow|shadow)/u.test(normalized)) return ["shadows"];
	if (/^(?:transitionDuration|animationDuration|duration)/u.test(normalized)) return ["durations"];
	if (/^(?:transitionTimingFunction|animationTimingFunction|easing)/u.test(normalized))
		return ["easings"];
	return [];
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
