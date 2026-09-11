import { pairs } from "../lib/utils.ts";
import type { CssConfigReturn } from "../types/typings.ts";
import { hashCssVar } from "./hash.ts";

type RuntimeTokenValue = string | Record<string, string>;

interface RuntimeToken {
	readonly value: RuntimeTokenValue;
	readonly cssVar?: string;
}

export interface RuntimeTokenMaps {
	readonly tokensByProp: Map<string, Set<string>>;
	readonly groupByProp: Map<string, string>;
	readonly flatTokens: Map<string, RuntimeToken>;
}

const tokenNameAliases = (name: string): readonly string[] => {
	if (!name.startsWith("$")) return [name];
	return [name, name.slice(1).replaceAll("-", ".")];
};

/** Build only the token indexes consumed by the runtime stylesheet. */
export function buildRuntimeTokenMaps(preset: CssConfigReturn, debug: boolean): RuntimeTokenMaps {
	const tokensByProp = new Map<string, Set<string>>();
	const groupByProp = new Map<string, string>();
	const flatTokens = new Map<string, RuntimeToken>();
	const tokensByGroup = new Map<string, Set<string>>();

	const presetTokens = preset.tokens ?? {};
	for (const group in presetTokens) {
		const groupTokens = new Set<string>();
		tokensByGroup.set(group, groupTokens);
		for (const tokenName in presetTokens[group]) {
			const tokenValue = presetTokens[group][tokenName];
			if (tokenValue === undefined) continue;
			const token: RuntimeToken = {
				value: tokenValue,
				cssVar: `var(--${hashCssVar(pairs.join([group, tokenName]), debug)})`,
			};
			for (const alias of tokenNameAliases(tokenName)) {
				groupTokens.add(alias);
				flatTokens.set(`${group}.${alias}`, token);
			}
		}
	}

	for (const prop in preset.properties) {
		const property = preset.properties[prop];
		if (typeof property !== "object") continue;

		for (const token in property) {
			if (token === "$strictness") continue;
			if (token === "$tokens") {
				const group = property.$tokens!;
				const groupTokens = tokensByGroup.get(group);
				if (groupTokens === undefined) continue;
				const tokenList = tokensByProp.get(prop) ?? new Set<string>();
				groupTokens.forEach((tokenName) => tokenList.add(tokenName));
				tokensByProp.set(prop, tokenList);
				groupByProp.set(prop, group);
				continue;
			}

			const tokenList = tokensByProp.get(prop) ?? new Set<string>();
			for (const alias of tokenNameAliases(token)) tokenList.add(alias);
			tokensByProp.set(prop, tokenList);
			const tokenValue = property[token];
			if (typeof tokenValue === "string") {
				for (const alias of tokenNameAliases(token)) {
					flatTokens.set(`${prop}.${alias}`, { value: tokenValue });
				}
			}
		}
	}

	return { tokensByProp, groupByProp, flatTokens };
}

const resolveRuntimeTokenTarget = (
	maps: RuntimeTokenMaps,
	tokenPath: string,
	seen: ReadonlySet<string> = new Set(),
): RuntimeToken | undefined => {
	const token = maps.flatTokens.get(tokenPath);
	if (token === undefined || seen.has(tokenPath)) return undefined;
	if (typeof token.value !== "string") return token;

	const next = maps.flatTokens.get(token.value);
	if (next === undefined) return token;
	return resolveRuntimeTokenTarget(maps, token.value, new Set([...seen, tokenPath]));
};

export function resolveRuntimeTokenAliasValue(
	maps: RuntimeTokenMaps,
	tokenPath: string,
	value: string,
): string {
	const token = maps.flatTokens.get(tokenPath);
	if (token === undefined) return value;

	const target = resolveRuntimeTokenTarget(maps, value, new Set([tokenPath]));
	return target === undefined ? value : (target.cssVar ?? value);
}

/** Resolve a runtime-authored token while leaving raw CSS values untouched. */
export function resolveRuntimeTokenValue(
	maps: RuntimeTokenMaps,
	prop: string,
	valueOrTokenName: string,
): string {
	const tokenList = maps.tokensByProp.get(prop);
	if (tokenList === undefined || !tokenList.has(valueOrTokenName)) return valueOrTokenName;

	const group = maps.groupByProp.get(prop);
	if (group !== undefined) {
		return maps.flatTokens.get(`${group}.${valueOrTokenName}`)?.cssVar ?? valueOrTokenName;
	}

	const token = maps.flatTokens.get(`${prop}.${valueOrTokenName}`);
	return typeof token?.value === "string" ? token.value : valueOrTokenName;
}
