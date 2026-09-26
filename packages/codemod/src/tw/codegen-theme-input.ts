import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import {
	createTokenDocument,
	TOKEN_PRESET_CONTEXT_SOURCE,
	type TokenDocument,
	type TokenEntry,
	type TokenGroup,
	type TokenJsonValue,
	type TokenNode,
	type TokenValue,
} from "../swap/token-document.ts";
import { TokenFormatId, type TokenFormatLoss } from "../swap/token-format-contracts.ts";
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isPlainRecord = (value: Record<string, unknown>): boolean => {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

const tokenJsonValue = (
	value: unknown,
	path: string,
	losses: TokenFormatLoss[],
	seen: WeakSet<object>,
): TokenValue => {
	if (typeof value === "string") {
		const reference = /^\{([^{}]+)\}$/u.exec(value);
		if (reference === null) return { kind: "string", value };
		return {
			kind: "reference",
			syntax: reference[1]!.startsWith("#/") ? "json-pointer" : "curly",
			target: reference[1]!,
			authored: value,
		};
	}
	if (typeof value === "number" && Number.isFinite(value)) return { kind: "number", value };
	if (typeof value === "boolean") return { kind: "boolean", value };
	if (value === null) return { kind: "null" };
	if (Array.isArray(value)) {
		if (seen.has(value)) {
			losses.push({
				path,
				feature: "cyclic value",
				reason: "codegen token input contains a cyclic array",
			});
			return { kind: "null" };
		}
		seen.add(value);
		const items = value.map((entry, index) =>
			tokenJsonValue(entry, `${path}/${index}`, losses, seen),
		);
		seen.delete(value);
		return { kind: "array", items };
	}
	if (isRecord(value)) {
		if (!isPlainRecord(value)) {
			losses.push({
				path,
				feature: "non-JSON value",
				reason: "codegen token input must use plain JSON objects",
			});
			return { kind: "null" };
		}
		if (seen.has(value)) {
			losses.push({
				path,
				feature: "cyclic value",
				reason: "codegen token input contains a cyclic object",
			});
			return { kind: "null" };
		}
		seen.add(value);
		const entries: Record<string, TokenValue> = {};
		for (const [key, entry] of Object.entries(value))
			entries[key] = tokenJsonValue(entry, `${path}/${key}`, losses, seen);
		seen.delete(value);
		return { kind: "object", entries };
	}
	losses.push({
		path,
		feature: "non-JSON value",
		reason: "codegen snapshot cannot serialize this token value",
	});
	return { kind: "null" };
};

const metadataFromInput = (
	value: Record<string, unknown>,
	losses: TokenFormatLoss[],
	path: string,
): Pick<TokenEntry, "type" | "description" | "deprecated" | "extensions"> => {
	const type = value.$type ?? value.type;
	const description = value.$description ?? value.description;
	const deprecated = value.$deprecated ?? value.deprecated;
	const extensions = value.$extensions ?? value.extensions;
	const result: {
		type?: string;
		description?: string;
		deprecated?: boolean | string;
		extensions?: Readonly<Record<string, TokenJsonValue>>;
	} = {};
	if (typeof type === "string") result.type = type;
	if (typeof description === "string") result.description = description;
	if (typeof deprecated === "boolean" || typeof deprecated === "string")
		result.deprecated = deprecated;
	if (isRecord(extensions)) {
		const typedExtensions: Record<string, TokenJsonValue> = {};
		for (const [key, extension] of Object.entries(extensions)) {
			const jsonValue = toJsonValue(extension);
			if (jsonValue === undefined)
				losses.push({
					path: `${path}/$extensions/${key}`,
					feature: "extension value",
					reason: "extension is not JSON-compatible",
				});
			else typedExtensions[key] = jsonValue;
		}
		result.extensions = typedExtensions;
	}
	return result;
};

const toJsonValue = (
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): TokenJsonValue | undefined => {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (Array.isArray(value)) {
		if (seen.has(value)) return undefined;
		seen.add(value);
		const items = value.map((entry) => toJsonValue(entry, seen));
		seen.delete(value);
		return items.some((item) => item === undefined)
			? undefined
			: items.flatMap((item) => (item === undefined ? [] : [item]));
	}
	if (isRecord(value)) {
		if (!isPlainRecord(value) || seen.has(value)) return undefined;
		seen.add(value);
		const entries = Object.entries(value).map(
			([key, entry]) => [key, toJsonValue(entry, seen)] as const,
		);
		seen.delete(value);
		if (entries.some(([, entry]) => entry === undefined)) return undefined;
		return Object.fromEntries(
			entries.map(([key, entry]) => [key, entry === undefined ? null : entry]),
		);
	}
	return undefined;
};

const tokenEntryFromInput = (
	value: unknown,
	path: string,
	losses: TokenFormatLoss[],
): TokenEntry => {
	const wrapper = isRecord(value) ? value : undefined;
	const wrapped =
		wrapper !== undefined && (Object.hasOwn(wrapper, "$value") || Object.hasOwn(wrapper, "value"));
	const rawValue = wrapped
		? Object.hasOwn(wrapper, "$value")
			? wrapper.$value
			: wrapper.value
		: value;
	const metadata = wrapper === undefined ? {} : metadataFromInput(wrapper, losses, path);
	return {
		kind: "token",
		...metadata,
		value: tokenJsonValue(rawValue, `${path}/$value`, losses, new WeakSet()),
	};
};

const tokenEntryFromContexts = (
	value: unknown,
	contexts: Record<string, unknown>,
	path: string,
	losses: TokenFormatLoss[],
): TokenEntry => ({
	kind: "token",
	...(isRecord(value) ? metadataFromInput(value, losses, path) : {}),
	value: {
		kind: "contextual",
		source: TOKEN_PRESET_CONTEXT_SOURCE,
		values: Object.fromEntries(
			Object.entries(contexts).map(([context, contextValue]) => [
				context,
				tokenJsonValue(contextValue, `${path}/contexts/${context}`, losses, new WeakSet()),
			]),
		),
	},
});

const groupFromInput = (
	value: unknown,
	path: readonly string[],
	contextNames: ReadonlySet<string>,
	losses: TokenFormatLoss[],
	seen: WeakSet<object> = new WeakSet(),
): TokenGroup => {
	if (!isRecord(value)) {
		losses.push({
			path: `/${path.join("/")}`,
			feature: "invalid group",
			reason: "codegen token group is not an object",
		});
		return { kind: "group", children: {} };
	}
	if (seen.has(value)) {
		losses.push({
			path: `/${path.join("/")}`,
			feature: "cyclic group",
			reason: "codegen token groups must not contain cycles",
		});
		return { kind: "group", children: {} };
	}
	seen.add(value);
	const metadata = metadataFromInput(value, losses, `/${path.join("/")}`);
	const children: Record<string, TokenNode> = {};
	let root: TokenEntry | undefined;
	for (const [name, child] of Object.entries(value)) {
		if (
			[
				"$type",
				"$description",
				"$deprecated",
				"$extensions",
				"$extends",
				"type",
				"description",
				"deprecated",
				"extensions",
			].includes(name)
		)
			continue;
		if (name === "$root") {
			root = tokenEntryFromInput(child, `/${[...path, "$root"].join("/")}`, losses);
			continue;
		}
		const canonicalName = name.startsWith("$") ? name.slice(1) : name;
		const childPath = [...path, canonicalName];
		if (Object.hasOwn(children, canonicalName))
			losses.push({
				path: `/${childPath.join("/")}`,
				feature: "token name collision",
				reason: `preset names '${name}' and '${canonicalName}' map to the same canonical token path`,
			});
		const contextValues = isRecord(child)
			? isRecord(child.$value)
				? child.$value
				: isRecord(child.value)
					? child.value
					: child
			: undefined;
		const contextEntries = Object.entries(contextValues ?? {}).filter(
			([key]) => contextNames.has(key) || key === "base",
		);
		const metadataKeys = new Set([
			"$type",
			"$description",
			"$deprecated",
			"$extensions",
			"type",
			"description",
			"deprecated",
			"extensions",
		]);
		const isContextual =
			contextEntries.some(([key]) => contextNames.has(key)) &&
			Object.keys(contextValues ?? {}).every(
				(key) => contextNames.has(key) || key === "base" || metadataKeys.has(key),
			);
		if (isContextual) {
			children[canonicalName] = tokenEntryFromContexts(
				child,
				Object.fromEntries(contextEntries),
				`/${childPath.join("/")}`,
				losses,
			);
		} else if (
			child === null ||
			typeof child !== "object" ||
			Array.isArray(child) ||
			(isRecord(child) && (Object.hasOwn(child, "$value") || Object.hasOwn(child, "value")))
		) {
			children[canonicalName] = tokenEntryFromInput(child, `/${childPath.join("/")}`, losses);
		} else {
			children[canonicalName] = groupFromInput(child, childPath, contextNames, losses, seen);
		}
	}
	seen.delete(value);
	return {
		kind: "group",
		...metadata,
		...(typeof value.$extends === "string" ||
		(Array.isArray(value.$extends) && value.$extends.every((entry) => typeof entry === "string"))
			? { extends: value.$extends }
			: {}),
		...(root === undefined ? {} : { root }),
		children,
	};
};

/** Create a typed snapshot from the exact token module used by codegen. */
export async function loadTokenDocument(modulePath: string, base: string): Promise<TokenDocument> {
	const specifier = await resolveModuleSpecifier(modulePath, base);
	const module = (await import(specifier)) as Record<string, unknown>;
	const groups = resolveTokenGroups(module);
	if (groups === undefined)
		throw new Error(`pandwind-codemod tw generate: no token groups found in ${modulePath}`);
	const conditions = resolvePresetConditions(module);
	const contextNames = new Set(Object.keys(conditions ?? {}));
	const losses: TokenFormatLoss[] = [];
	const root = groupFromInput(groups, [], contextNames, losses);
	return createTokenDocument({
		format: TokenFormatId.Preset,
		formatVersion: "pandwind.preset/1",
		root,
		sourceLosses: losses,
		sourceText: JSON.stringify(root),
	});
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
	const specifier = await resolveModuleSpecifier(modulePath, base);
	const module = (await import(specifier)) as Record<string, unknown>;
	const groups = resolveTokenGroups(module);
	const conditions = resolvePresetConditions(module);
	if (groups === undefined) {
		throw new Error(
			`pandwind-codemod tw generate: no bridgeable token groups found in ${modulePath} (looked at default export and every named export for a .tokens field or raw DTCG groups)`,
		);
	}
	let themeBlock = buildThemeBlock(
		groups,
		conditions ? createConditionResolver(conditions) : undefined,
	);
	const scopeCss = buildThemeScopes(resolveThemes(module));
	if (scopeCss !== "") themeBlock = themeBlock === "" ? scopeCss : `${themeBlock}\n\n${scopeCss}`;
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

/**
 * Resolve a tokens module to an importable specifier. Package specifiers
 * (e.g. `@pandwind/example-preset`) resolve against the CLI's project
 * root via CJS resolution, never against the importing file's own package:
 * a stray `package.json` anywhere between the two would otherwise redirect
 * Node's self-reference resolution and double a path segment
 * (`dist/dist/...`), breaking generate. Relative/absolute paths resolve
 * against `base`.
 */
const resolveModuleSpecifier = async (modulePath: string, base: string): Promise<string> => {
	if (!isPackageSpecifier(modulePath)) {
		return pathToFileURL(resolveModulePath(modulePath, base)).href;
	}
	const packageModule = createRequire(pathToFileURL(join(base, "package.json")).href);
	const resolved = packageModule.resolve(modulePath);
	return pathToFileURL(resolved).href;
};

const resolveModulePath = (modulePath: string, base: string): string =>
	modulePath.startsWith("/") ? modulePath : resolve(base, modulePath);

const isPackageSpecifier = (modulePath: string): boolean =>
	!modulePath.startsWith("/") && !modulePath.startsWith(".");
