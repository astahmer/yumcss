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
	colorPalettes: Map<string, readonly ColorPaletteAssignment[]>;
	colorPaletteValues: Map<string, string>;
}

export interface ColorPaletteAssignment {
	readonly suffix: string;
	readonly cssVar: string;
	readonly value: string;
	readonly tokenPath: string;
}

const cssVarRef = (key: string) => `var(--${key})`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Precompute the preset's token lookup tables (build-time only). */
export function buildTokenMaps(
	preset: CssConfigReturn<DefinePresetOptions>,
	debug: boolean,
): TokenMaps {
	const tokensByProp = new Map<string, Set<string>>();
	const flatTokens = new Map<string, Token>();
	const tokensByGroup = new Map<string, Set<string>>();
	const setFlatToken = (key: string, token: Token): void => {
		const existing = flatTokens.get(key);
		if (existing !== undefined && existing.path !== token.path)
			throw new Error(
				`Ambiguous token alias '${key}' maps to '${existing.path}' and '${token.path}'`,
			);
		flatTokens.set(key, token);
	};
	const groupByProp = new Map<string, string>();

	const presetTokens = preset.tokens ?? {};
	const presetProperties = preset.properties ?? {};
	for (const group of Object.keys(presetTokens)) {
		const tokenList = new Set<string>();
		tokensByGroup.set(group, tokenList);

		for (const tokenName of Object.keys(presetTokens[group]!)) {
			const tokenValue = presetTokens[group]![tokenName];
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
				setFlatToken(`${group}.${alias}`, token);
			}
		}
	}

	for (const [prop, propertyValue] of Object.entries(presetProperties)) {
		const propertyConfig = propertyValue;
		if (!isRecord(propertyConfig)) continue;

		for (const token of Object.keys(propertyConfig)) {
			if (token === "$strictness") continue;

			// Add every token of that group to the list of tokens for that prop
			if (token === "$tokens") {
				const group = propertyConfig.$tokens;
				if (typeof group !== "string") continue;
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
			const tokenValue = propertyConfig[token];
			if (typeof tokenValue !== "string") continue;
			const simpleToken: SimpleToken = {
				path: tokenPath,
				name: token,
				value: tokenValue,
				hash: pairs.join([prop, token]),
			};
			for (const alias of tokenNameAliases(token)) setFlatToken(`${prop}.${alias}`, simpleToken);
		}
	}

	const colorPalettes = new Map<string, readonly ColorPaletteAssignment[]>();
	const colorPaletteValues = new Map<string, string>();
	const paletteSources = preset.colorPalettes ?? {};
	for (const [paletteName, source] of Object.entries(paletteSources)) {
		const assignments = new Map<string, ColorPaletteAssignment>();
		if (typeof source === "string") {
			const seenTokenPaths = new Set<string>();
			for (const token of flatTokens.values()) {
				if (seenTokenPaths.has(token.path)) continue;
				seenTokenPaths.add(token.path);
				const prefix = `${source}.`;
				const suffix =
					token.path === source
						? ""
						: token.path.startsWith(prefix)
							? token.path.slice(prefix.length)
							: undefined;
				if (suffix === undefined) continue;
				const cssVarHash = hashCssVar(pairs.join(["colors", "colorPalette", suffix]), debug);
				const tokenVar = tokenCssVar(token);
				if (tokenVar === undefined) continue;
				assignments.set(suffix, {
					suffix,
					cssVar: cssVarHash,
					value: tokenVar,
					tokenPath: token.path,
				});
			}
		} else if (isRecord(source)) {
			for (const [suffix, tokenPath] of Object.entries(source)) {
				if (typeof tokenPath !== "string") continue;
				const token = flatTokens.get(tokenPath);
				const tokenVar = token === undefined ? undefined : tokenCssVar(token);
				if (token === undefined || tokenVar === undefined) continue;
				const cssVarHash = hashCssVar(pairs.join(["colors", "colorPalette", suffix]), debug);
				assignments.set(suffix, {
					suffix,
					cssVar: cssVarHash,
					value: tokenVar,
					tokenPath: token.path,
				});
			}
		}

		const orderedAssignments = Array.from(assignments.values()).toSorted((a, b) =>
			a.suffix.localeCompare(b.suffix),
		);
		if (orderedAssignments.length === 0) continue;
		colorPalettes.set(paletteName, orderedAssignments);
		for (const assignment of orderedAssignments) {
			const virtualName = assignment.suffix ? `colorPalette.${assignment.suffix}` : "colorPalette";
			colorPaletteValues.set(virtualName, cssVarRef(assignment.cssVar));
		}
	}

	return {
		tokensByProp,
		groupByProp,
		flatTokens,
		tokensByGroup,
		colorPalettes,
		colorPaletteValues,
	};
}

const tokenCssVar = (token: Token): string | undefined =>
	"cssVar" in token ? token.cssVar : undefined;

const resolveTokenTarget = (
	maps: TokenMaps,
	tokenPath: string,
	seen: ReadonlySet<string> = new Set(),
): Token | undefined => {
	const visited = new Set(seen);
	let currentPath = tokenPath;
	while (true) {
		const token = maps.flatTokens.get(currentPath);
		if (token === undefined) return undefined;
		if (visited.has(token.path)) throw new Error(`Cyclic token reference '${token.path}'`);
		visited.add(token.path);
		if (typeof token.value !== "string") return token;
		if (!maps.flatTokens.has(token.value)) return token;
		currentPath = token.value;
	}
};

/**
 * Collect the preset token paths needed to emit one authored token. Conditional
 * aliases can point at more than one semantic role, so following only the
 * final target is not enough for the `tokens: "used"` stylesheet mode.
 */
export const tokenDependencyPaths = (
	maps: TokenMaps,
	tokenPath: string,
	paths: Set<string> = new Set(),
	visiting: Set<string> = new Set(),
): Set<string> => {
	const stack = [tokenPath];
	while (stack.length > 0) {
		const currentPath = stack.pop()!;
		const token = maps.flatTokens.get(currentPath);
		if (token === undefined || paths.has(token.path) || visiting.has(token.path)) continue;
		paths.add(token.path);
		visiting.add(token.path);
		const values = typeof token.value === "string" ? [token.value] : Object.values(token.value);
		for (const value of values) {
			const target = maps.flatTokens.get(value);
			if (target !== undefined && !paths.has(target.path)) stack.push(target.path);
		}
		visiting.delete(token.path);
	}
	return paths;
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
	if (maps.groupByProp.get(prop) === "colors") {
		const colorPaletteValue = maps.colorPaletteValues.get(valueOrTokenName);
		if (colorPaletteValue !== undefined) return colorPaletteValue;
	}
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
