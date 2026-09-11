/**
 * Shared token-resolution maps for the css() engine.
 *
 * The stylesheet and the tailwind adapter both need the same question
 * answered: given a property and the value a user wrote (`$blue-500`,
 * `md`, `16`), what is the concrete CSS value (`#3182ce`, `0.375rem`,
 * `16px`)? The maps below encode the preset's `properties` config — the
 * per-property token tables and `$tokens` group references — exactly once,
 * so both consumers resolve identically by construction.
 */
import { pairs } from "../lib/utils.ts";
import type {
	CssConfigReturn,
	DefinePresetOptions,
	SemanticToken,
	SimpleToken,
	Token,
} from "../types/typings.ts";
import { hashCssVar } from "./hash.ts";
import { tokenNameAliases } from "../lib/token-path.ts";

export interface TokenMaps {
	tokensByProp: Map<string, Set<string>>;
	groupByProp: Map<string, string>;
	flatTokens: Map<string, Token>;
	tokensByGroup: Map<string, Set<string>>;
}

const cssVarRef = (key: string) => `var(--${key})`;

/** Precompute the preset's token lookup tables (build-time only). */
export function buildTokenMaps(
	preset: CssConfigReturn<DefinePresetOptions>,
	debug: boolean,
): TokenMaps {
	const tokensByProp = new Map<string, Set<string>>();
	const flatTokens = new Map<string, Token>();
	const tokensByGroup = new Map<string, Set<string>>();
	const groupByProp = new Map<string, string>();

	const presetTokens = preset.tokens ?? {};
	for (const group in presetTokens) {
		const tokenList = new Set<string>();
		tokensByGroup.set(group, tokenList);

		for (const tokenName in presetTokens[group]) {
			const tokenValue = presetTokens[group][tokenName];
			if (tokenValue === undefined) continue;
			const hash = pairs.join([group, tokenName]);
			const cssVarHash = hashCssVar(pairs.join([group, tokenName]), debug);
			const tokenPath = `${group}.${tokenName}`;

			const token: Token = {
				group,
				path: tokenPath,
				name: tokenName,
				value: tokenValue,
				hash,
				cssVar: cssVarRef(cssVarHash),
			};
			for (const alias of tokenNameAliases(tokenName)) {
				tokenList.add(alias);
				flatTokens.set(`${group}.${alias}`, token);
			}
		}
	}

	for (const prop in preset.properties) {
		if (typeof preset.properties[prop] !== "object") continue;

		for (const token in preset.properties[prop]) {
			if (token === "$strictness") continue;

			// Add every token of that group to the list of tokens for that prop
			if (token === "$tokens") {
				const group = preset.properties[prop].$tokens!;
				const groupTokens = tokensByGroup.get(group);
				if (!groupTokens) continue;

				if (!tokensByProp.has(prop)) {
					tokensByProp.set(prop, new Set());
				}
				const tokenList = tokensByProp.get(prop)!;
				groupTokens.forEach((tokenName) => {
					tokenList.add(tokenName);
				});

				groupByProp.set(prop, group);
				continue;
			}

			if (!tokensByProp.has(prop)) {
				tokensByProp.set(prop, new Set());
			}
			const tokenList = tokensByProp.get(prop)!;
			for (const alias of tokenNameAliases(token)) tokenList.add(alias);

			const tokenPath = `${prop}.${token}`;
			const simpleToken: SimpleToken = {
				path: tokenPath,
				name: token,
				value: preset.properties[prop][token],
				hash: pairs.join([prop, token]),
			};
			for (const alias of tokenNameAliases(token)) flatTokens.set(`${prop}.${alias}`, simpleToken);
		}
	}

	return { tokensByProp, groupByProp, flatTokens, tokensByGroup };
}

const tokenCssVar = (token: Token): string | undefined =>
	"cssVar" in token ? token.cssVar : undefined;

const resolveTokenTarget = (
	maps: TokenMaps,
	tokenPath: string,
	seen: ReadonlySet<string> = new Set(),
): Token | undefined => {
	const token = maps.flatTokens.get(tokenPath);
	if (token === undefined || seen.has(tokenPath)) return undefined;
	if (typeof token.value !== "string") return token;

	const next = maps.flatTokens.get(token.value);
	if (next === undefined) return token;
	return resolveTokenTarget(maps, next.path, new Set([...seen, tokenPath]));
};

/**
 * Resolve a token group's value when it aliases another preset token.
 *
 * A component token can therefore stay as a build-time string reference:
 * `component.card.bg: "semantic.bg.primary"`, or use a condition-aware
 * object whose values reference different semantic paths. The emitted
 * component variable points at the selected semantic variable, so theme
 * conditions continue to resolve through CSS without importing a JavaScript
 * token map into the component.
 */
export function resolveTokenAliasValue(maps: TokenMaps, tokenPath: string, value: string): string {
	const token = maps.flatTokens.get(tokenPath);
	if (token === undefined) return value;

	const target = resolveTokenTarget(maps, value, new Set([tokenPath]));
	return target === undefined ? value : (tokenCssVar(target) ?? value);
}

/**
 * Resolve a written value to its concrete CSS value for `prop`.
 * Unknown values pass through unchanged — raw CSS values are always legal.
 */
export function resolveTokenValue(
	maps: TokenMaps,
	prop: string,
	valueOrTokenName: string,
	opts?: { concrete?: boolean },
): string {
	if (!maps.tokensByProp.has(prop)) return valueOrTokenName;

	const tokenList = maps.tokensByProp.get(prop)!;
	if (!tokenList.has(valueOrTokenName)) return valueOrTokenName;

	const group = maps.groupByProp.get(prop);
	if (group) {
		const tokenPath = `${group}.${valueOrTokenName}`;
		const token = maps.flatTokens.get(tokenPath);
		if (opts?.concrete && token && typeof token.value === "string") {
			return token.value;
		}
		return (token as SemanticToken | undefined)?.cssVar ?? valueOrTokenName;
	}

	const tokenPath = `${prop}.${valueOrTokenName}`;
	const token = maps.flatTokens.get(tokenPath);
	return (token as SimpleToken | undefined)?.value ?? valueOrTokenName;
}

/** Convenience: build the maps once and get a (prop, value) resolver. */
export function createTokenResolver(
	preset: CssConfigReturn<DefinePresetOptions>,
	debug = false,
): (prop: string, value: string) => string {
	const maps = buildTokenMaps(preset, debug);
	return (prop, value) => resolveTokenValue(maps, prop, value);
}
