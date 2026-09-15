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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Build only the token indexes consumed by the runtime stylesheet. */
export function buildRuntimeTokenMaps(preset: CssConfigReturn, debug: boolean): RuntimeTokenMaps {
	const tokensByProp = new Map<string, Set<string>>();
	const groupByProp = new Map<string, string>();
	const flatTokens = new Map<string, RuntimeToken>();
	const tokensByGroup = new Map<string, Set<string>>();
	const setFlatToken = (key: string, token: RuntimeToken): void => {
		if (flatTokens.has(key)) {
			throw new Error(`Ambiguous token alias '${key}'`);
		}
		flatTokens.set(key, token);
	};

	const presetTokens = preset.tokens ?? {};
	const presetProperties = preset.properties ?? {};
	for (const group of Object.keys(presetTokens)) {
		const groupTokenValues = presetTokens[group];
		if (groupTokenValues === undefined || typeof groupTokenValues === "function") continue;
		const groupTokens = new Set<string>();
		tokensByGroup.set(group, groupTokens);
		for (const tokenName of Object.keys(groupTokenValues)) {
			const tokenValue = groupTokenValues[tokenName];
			if (tokenValue === undefined) continue;
			const token: RuntimeToken = {
				value: tokenValue,
				cssVar: `var(--${hashCssVar(pairs.join([group, tokenName]), debug)})`,
			};
			for (const alias of tokenNameAliases(tokenName)) {
				groupTokens.add(alias);
				setFlatToken(`${group}.${alias}`, token);
			}
		}
	}

	for (const [prop, propertyValue] of Object.entries(presetProperties)) {
		if (!isRecord(propertyValue)) continue;
		const property = propertyValue;

		for (const token of Object.keys(property)) {
			if (token === "$strictness") continue;
			if (token === "$tokens") {
				const group = property.$tokens;
				if (typeof group !== "string") continue;
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
					setFlatToken(`${prop}.${alias}`, { value: tokenValue });
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
	const visited = new Set(seen);
	let currentPath = tokenPath;
	while (true) {
		const token = maps.flatTokens.get(currentPath);
		if (token === undefined) return undefined;
		if (visited.has(currentPath)) throw new Error(`Cyclic token reference '${currentPath}'`);
		visited.add(currentPath);
		if (typeof token.value !== "string") return token;
		if (!maps.flatTokens.has(token.value)) return token;
		currentPath = token.value;
	}
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
