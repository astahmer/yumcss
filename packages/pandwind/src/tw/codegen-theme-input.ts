import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
	buildComponentScopes,
	buildThemeBlock,
	buildThemeScopes,
	createConditionResolver,
	splitTokens,
	themeVarsFromTokens,
	type ThemeConditions,
	type ThemeScopeMap,
	type ThemeTokenGroups,
} from "./generate-theme.ts";

/**
 * Find preset condition definitions (`Record<string, string | string[]>`)
 * inside an imported tokens/preset module: the first object carrying a
 * `.conditions` record whose values are strings or arrays of strings.
 */
export function resolvePresetConditions(
	module: Record<string, unknown>,
): ThemeConditions | undefined {
	const candidates: unknown[] = [
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => value),
	];
	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const cond = obj.conditions;
		if (cond === null || typeof cond !== "object") continue;
		const values = Object.values(cond as Record<string, unknown>);
		if (
			values.length > 0 &&
			values.every(
				(v) =>
					typeof v === "string" ||
					(Array.isArray(v) && v.every((part) => typeof part === "string")),
			)
		) {
			return cond as ThemeConditions;
		}
	}
	return undefined;
}

/**
 * Find DTCG token groups inside an imported tokens/preset module: the first
 * export (default first) that either is a groups object itself or carries a
 * `.tokens` field with at least one theme-namespace-bridged group.
 */
export function resolveTokenGroups(module: Record<string, unknown>): ThemeTokenGroups | undefined {
	const candidates: Array<{ groups: unknown }> = [
		{ groups: module.default },
		{ groups: module.tokenGroups },
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => ({ groups: value })),
	];
	for (const { groups: candidate } of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const groups = obj.tokens !== null && typeof obj.tokens === "object" ? obj.tokens : obj;
		if (groups === null || typeof groups !== "object") continue;
		if (themeVarsFromTokens(groups as ThemeTokenGroups).length > 0) {
			return groups as ThemeTokenGroups;
		}
	}
	return undefined;
}

/**
 * Resolve declared theme scopes (plans/015) from a tokens/preset module:
 * the first export carrying a `themes` object wins, mirroring
 * resolveTokenGroups/resolvePresetConditions candidate order.
 */
export function resolveThemes(module: Record<string, unknown>): ThemeScopeMap | undefined {
	const candidates: unknown[] = [
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => value),
	];
	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const themes = obj.themes;
		if (themes !== null && typeof themes === "object") return themes as ThemeScopeMap;
	}
	return undefined;
}

/**
 * Resolve declared component scopes (plans/015 L3) from a tokens/preset
 * module: the first export carrying a `components` object wins, mirroring
 * resolveThemes candidate order.
 */
export function resolveComponents(
	module: Record<string, unknown>,
): Record<string, Record<string, unknown>> | undefined {
	const candidates: unknown[] = [
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, value]) => value),
	];
	for (const candidate of candidates) {
		if (candidate === null || typeof candidate !== "object") continue;
		const obj = candidate as Record<string, unknown>;
		const components = obj.components;
		if (components !== null && typeof components === "object") {
			return components as Record<string, Record<string, unknown>>;
		}
	}
	return undefined;
}

export async function loadThemeBlock(modulePath: string, base: string): Promise<string> {
	const specifier = isPackageSpecifier(modulePath)
		? modulePath
		: pathToFileURL(resolveModulePath(modulePath, base)).href;
	const module = (await import(specifier)) as Record<string, unknown>;
	const groups = resolveTokenGroups(module);
	const conditions = resolvePresetConditions(module);
	if (groups === undefined) {
		throw new Error(
			`pandwind-tw generate: no bridgeable token groups found in ${modulePath} (looked at default export and every named export for a .tokens field or raw DTCG groups)`,
		);
	}
	let themeBlock = buildThemeBlock(
		groups,
		conditions ? createConditionResolver(conditions) : undefined,
	);
	const scopeCss = buildThemeScopes(resolveThemes(module));
	if (scopeCss !== "") themeBlock = themeBlock === "" ? scopeCss : `${themeBlock}\\n\\n${scopeCss}`;
	const components = resolveComponents(module);
	if (components !== undefined) {
		const { flatVars } = splitTokens(
			groups,
			conditions ? createConditionResolver(conditions) : undefined,
		);
		const componentCss = buildComponentScopes(
			components,
			new Set(flatVars.map((variable) => variable.name)),
			conditions ? createConditionResolver(conditions) : undefined,
			(message) => console.warn(message),
		);
		if (componentCss !== "")
			themeBlock = themeBlock === "" ? componentCss : `${themeBlock}\\n\\n${componentCss}`;
	}
	return themeBlock;
}

const resolveModulePath = (modulePath: string, base: string): string =>
	modulePath.startsWith("/") ? modulePath : resolve(base, modulePath);

const isPackageSpecifier = (modulePath: string): boolean =>
	!modulePath.startsWith("/") && !modulePath.startsWith(".");
