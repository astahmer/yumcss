import { pairs } from "../lib/utils.ts";
import { tokenNameAliases } from "../lib/token-path.ts";
import type { CssConfigReturn } from "../types/typings.ts";
import { hashCssVar } from "./hash.ts";

type RuntimeToken = string | undefined;

interface RuntimeTokenGroup {
	readonly names: Map<string, RuntimeToken>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const addAlias = (paths: Map<string, string>, key: string, path: string): void => {
	const existing = paths.get(key);
	if (existing !== undefined && existing !== path)
		throw new Error(`Ambiguous token alias '${key}' maps to '${existing}' and '${path}'`);
	paths.set(key, path);
};

export const createRuntimeTokenResolver = (
	preset: CssConfigReturn,
	debug = false,
): ((property: string, value: string) => string) => {
	const paths = new Map<string, string>();
	const groups = new Map<string, RuntimeTokenGroup>();
	for (const group of Object.keys(preset.tokens ?? {})) {
		const values = preset.tokens?.[group];
		if (values === undefined || typeof values === "function") continue;
		const names = new Map<string, RuntimeToken>();
		for (const name of Object.keys(values)) {
			const value = values[name];
			if (value === undefined) continue;
			const path = `${group}.${name}`;
			const resolved = `var(--${hashCssVar(pairs.join([group, name]), debug)})`;
			for (const alias of tokenNameAliases(name)) {
				addAlias(paths, `${group}.${alias}`, path);
				names.set(alias, resolved);
			}
		}
		groups.set(group, { names });
	}

	const propertyValues = new Map<string, Map<string, RuntimeToken>>();
	const propertyGroups = new Map<string, string>();
	for (const [property, propertyValue] of Object.entries(preset.properties ?? {})) {
		if (!isRecord(propertyValue)) continue;
		const group = propertyValue.$tokens;
		if (typeof group === "string") {
			propertyGroups.set(property, group);
			const names = groups.get(group)?.names;
			if (names !== undefined) propertyValues.set(property, names);
		}
		let values = propertyValues.get(property);
		if (values === undefined) {
			values = new Map<string, RuntimeToken>();
			propertyValues.set(property, values);
		}
		for (const name of Object.keys(propertyValue)) {
			if (name === "$strictness" || name === "$tokens") continue;
			const path = `${property}.${name}`;
			for (const alias of tokenNameAliases(name)) addAlias(paths, `${property}.${alias}`, path);
			const value = propertyValue[name];
			for (const alias of tokenNameAliases(name))
				if (!propertyGroups.has(property))
					values.set(alias, typeof value === "string" ? value : undefined);
		}
	}

	return (property, value) => {
		const names = propertyValues.get(property);
		if (names === undefined || !names.has(value)) return value;
		return names.get(value) ?? value;
	};
};
