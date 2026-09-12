import { pairs } from "../lib/utils.ts";
import { canonicalStyleKey, cssPropertyFromKey, isEmptyCondition } from "../backends/css.ts";
import type { CssConfigReturn, TokenDeclaration } from "../types/typings.ts";
import { createVarCompiler, varConditionPart } from "./var-compiler.ts";
import type { CreateCssOptions } from "./runtime-base.ts";
import { createHashFn, dashCase, escapeIdentifier, hashCssVar } from "./hash.ts";
import { getPropertyPriority } from "./property-priorities.ts";
import {
	buildRuntimeTokenMaps,
	resolveRuntimeTokenAliasValue,
	resolveRuntimeTokenValue,
} from "./runtime-token-maps.ts";
import { isSafeCssValue, normalizeCssValue } from "./value-normalization.ts";
import {
	createConditionsBucket,
	decodeAtomicPath,
	genCSSRule,
	isSelfSelector,
	parseCondition,
} from "./stylesheet-lowering.ts";

type Rule = { id: string; css: string; priority: number };

const appendImportant = (declaration: string): string => {
	if (declaration.includes("!important")) return declaration;
	return `${declaration} !important`;
};

const cssVar = {
	declaration: (key: string, value: string) => `--${key}: ${value};`,
};

/**
 * Runtime-only projection of the stylesheet compiler.
 *
 * `createRuntimeCss` needs token prelude generation plus atomic and var-inline
 * rule lowering. It never consumes the build-time flattening, full generator,
 * custom policy registry, or cascade ordering surface, so keeping those
 * dependencies out of this module lets runtime bundles pay only for this
 * smaller path while preserving the same default lowerer and token maps.
 */
export const createRuntimeStylesheet = (
	preset: CssConfigReturn,
	options: CreateCssOptions = {},
) => {
	const conditionNames = Object.keys(preset.conditions);
	const namespace = options.namespace ?? "pw";
	const varCompiler = createVarCompiler(
		conditionNames,
		conditionNames.filter((name) => isEmptyCondition(name, preset.conditions)),
		namespace,
		options.propertyAliases,
	);
	const hashFn = options.hashFn ?? createHashFn(Boolean(options.debug));
	const debug = Boolean(options.debug);

	// Sheet-backed strategies own the class names of the declarations they
	// map — the generated selectors must match what the runtime emits.
	// Non-sheet-backed strategies (tailwind) keep the sheet untouched.
	const sheetStrategy = options.className;
	const classNameFor = (orderedKey: string, rawValue: string): string => {
		if (sheetStrategy?.sheetBacked === true) {
			const named = sheetStrategy.toClassName(orderedKey, rawValue);
			if (typeof named === "string" && named.length > 0 && !/[\s\u0000]/.test(named)) return named;
		}
		return hashFn(orderedKey, rawValue);
	};

	const pathParts = (key: string, omitEmptyParts: boolean, sort: boolean): string[] => {
		const parts: string[] = [];
		for (const part of pairs.split(key)) {
			if (isEmptyCondition(part, preset.conditions) || (omitEmptyParts && part === "")) continue;
			parts.push(part);
		}
		// `parts` is private scratch allocated by this call; sorting in place
		// avoids the second array that `toSorted()` would require.
		// oxlint-disable-next-line no-array-sort
		return sort ? parts.sort() : parts;
	};

	const tokenMaps = buildRuntimeTokenMaps(preset, debug);
	const cssVars = new Map<string, TokenDeclaration>();
	const presetTokens = preset.tokens ?? {};
	// Pre-compute the `:root` token declarations (the class-value maps live
	// in the shared `buildTokenMaps`). Runtime sheets always emit the complete
	// token prelude, so no used-token tracking is needed here.
	for (const group of Object.keys(presetTokens)) {
		for (const tokenName of Object.keys(presetTokens[group]!)) {
			const tokenValue = presetTokens[group]![tokenName];
			if (tokenValue === undefined) continue;
			const cssVarHash = hashCssVar(pairs.join([group, tokenName]), debug);
			const tokenPath = `${group}.${tokenName}`;

			if (typeof tokenValue === "object") {
				for (const condition of Object.keys(tokenValue)) {
					if (condition !== "base" && !Object.hasOwn(preset.conditions, condition))
						throw new Error(`Unknown condition '${condition}' in token '${tokenPath}'`);
					const value = resolveRuntimeTokenAliasValue(
						tokenMaps,
						tokenPath,
						tokenValue[condition] as string,
					);
					const resolved = condition === "base" ? "" : preset.conditions[condition]!;
					const resolvedList = (Array.isArray(resolved) ? resolved : [resolved]).filter(
						(part): part is string => Boolean(part),
					);
					const conditions = Object.assign(createConditionsBucket(), {
						className: "",
						parentSelectors: resolvedList.length ? [] : [":root "],
					});

					resolvedList.forEach((selector) => {
						parseCondition(selector, conditions);
					});

					const priorities = resolvedList.map((part) =>
						getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
					);

					cssVars.set(`${tokenPath}.${condition}`, {
						declaration: genCSSRule(cssVar.declaration(cssVarHash, value), conditions),
						priority: priorities.reduce((acc, prio) => acc + prio, 0),
					});
				}
				continue;
			}

			cssVars.set(tokenPath, {
				declaration: genCSSRule(
					cssVar.declaration(
						cssVarHash,
						resolveRuntimeTokenAliasValue(tokenMaps, tokenPath, tokenValue),
					),
					Object.assign(createConditionsBucket(), { parentSelectors: [":root "] }),
				),
				priority: getPropertyPriority(tokenName),
			});
		}
	}

	let tokensCache: string | undefined;
	const tokens = (): string =>
		(tokensCache ??= Array.from(cssVars.values())
			.toSorted((a, b) => {
				const priority = a.priority - b.priority;
				if (priority === 0) return a.declaration.localeCompare(b.declaration);
				return priority;
			})
			.map((token) => token.declaration)
			.join("\n"));

	const cache = new Map<string, Rule>();
	const processNormalizedStyle = (
		orderedKey: string,
		normalizedValue: string,
		localCache: Map<string, Rule>,
	): void => {
		if (orderedKey === "" || !isSafeCssValue(normalizedValue)) return;
		const pairId = pairs.concat(orderedKey, normalizedValue);
		if (cache.has(pairId)) return;

		const atomic = decodeAtomicPath(preset.conditions, pairId);
		const property = cssPropertyFromKey(atomic.prop, preset.conditions, options.propertyAliases);
		const value = resolveRuntimeTokenValue(tokenMaps, property, normalizedValue);
		const declaration = [dashCase(property), value].join(":");
		const css = genCSSRule(
			options.important === true ? appendImportant(declaration) : declaration,
			{
				...atomic.conditions,
				className: `.${escapeIdentifier(classNameFor(orderedKey, normalizedValue))}`,
			},
		);
		const rule = { id: pairId, css, priority: atomic.priority };
		cache.set(pairId, rule);
		localCache.set(pairId, rule);
	};

	const processPrepared = (styles: readonly { key: string; value: string }[]) => {
		const localCache = new Map<string, Rule>();
		for (const { key, value } of styles) {
			if (typeof key !== "string" || key.length === 0 || key.includes("\u0000")) continue;
			if (!isSafeCssValue(value)) continue;
			const orderedKey = canonicalStyleKey(key, preset.conditions);
			const property = cssPropertyFromKey(orderedKey, preset.conditions, options.propertyAliases);
			processNormalizedStyle(orderedKey, normalizeCssValue(property, value), localCache);
		}
		return localCache;
	};

	const varCache = new Map<string, Rule>();
	const processVarKey = (flatKey: string): Rule | undefined => {
		if (typeof flatKey !== "string" || flatKey.length === 0 || flatKey.includes("\u0000")) return;
		const rawParts = pathParts(flatKey, true, false);
		const first = rawParts[0]!;
		const last = rawParts[rawParts.length - 1]!;
		const isCondition = (part: string): boolean =>
			part.startsWith("_") ||
			Object.hasOwn(preset.conditions, part) ||
			/[&>+~:[\],.#*\s]/.test(part);
		const propertyFirst = rawParts.length > 1 && !isCondition(first) && isCondition(last);
		const propPart = propertyFirst ? first : last;
		const conditionParts = propertyFirst ? rawParts.slice(1) : rawParts.slice(0, -1);
		// `conditionParts` comes from `slice`, so in-place ordering cannot
		// mutate the caller's flattened key.
		// oxlint-disable-next-line no-array-sort
		const orderedConditions = conditionParts.sort();
		const orderedKey = pairs.join([...orderedConditions, propPart]);
		if (orderedKey === "" || varCache.has(orderedKey)) return;

		// The canonical key always stores conditions before the property.
		const prop = dashCase(cssPropertyFromKey(propPart, preset.conditions, options.propertyAliases));
		const condParts = orderedConditions.map(varConditionPart);
		let declaration = `var(--${namespace}-c-${prop})`;
		for (let i = 1; i <= condParts.length; i++) {
			declaration = `var(--${namespace}-c-${prop}_${condParts.slice(0, i).join("_")}, ${declaration})`;
		}
		const atomic = decodeAtomicPath(preset.conditions, pairs.concat(orderedKey, "\u0000"));
		const varDeclaration = `${prop}: ${declaration}`;
		const css = genCSSRule(
			options.important === true ? appendImportant(varDeclaration) : varDeclaration,
			{
				...atomic.conditions,
				className: `.${varCompiler.escapeClass(varCompiler.classFor(orderedKey))}`,
			},
		);
		const rule = { id: orderedKey, css, priority: atomic.priority };
		varCache.set(orderedKey, rule);
		return rule;
	};

	return { processPrepared, processVarKey, gen: { tokens } };
};
