import { assign, type FlatStyles, flattenStyle, pairs } from "../lib/utils.ts";
import type { CssConfigReturn, StyleObject, TokenDeclaration } from "../types/typings.ts";
import { createVarCompiler } from "./var-compiler.ts";
import type { CreateCssOptions } from "./create-css.ts";
import { createHashFn, dashCase, escapeIdentifier, hashCssVar } from "./hash.ts";
import { getPropertyPriority } from "./property-priorities.ts";
import { buildTokenMaps, resolveTokenValue } from "./tokens.ts";
import { isSelfSelector } from "./stylesheet-lowering.ts";
import {
	defaultAtomicPathDecoder,
	defaultConditionPolicy,
	defaultRuleSerializer,
	createStylesheetOrderingPolicy,
	type AtomicPathDecoderPolicy,
	type ConditionPolicy,
	type RuleSerializerPolicy,
	type StylesheetOrderingPolicy,
} from "./stylesheet-policies.ts";
import { normalizeCssValue } from "./value-normalization.ts";

export { decodeAtomicPath } from "./stylesheet-lowering.ts";
export { getPropertyPriority } from "./property-priorities.ts";

type Rule = { id: string; css: string; priority: number };
const cssVar = {
	ref: (key: string) => `var(--${key})`,
	declaration: (key: string, value: string) => `--${key}: ${value};`,
};

/**
 * Replaceable policies for deterministic stylesheet generation.
 *
 * Leave these unset for the normal Pandwind CSS dialect. Custom policies are
 * useful to adapters and tooling that need a different condition parser,
 * ordering rule, serializer, or token-emission strategy.
 *
 * @category stylesheet
 * @since 0.1.0
 */
export interface StylesheetPolicies {
	readonly conditions?: ConditionPolicy;
	readonly ordering?: StylesheetOrderingPolicy;
	readonly serializer?: RuleSerializerPolicy;
	readonly decoder?: AtomicPathDecoderPolicy;
	/** Emit every preset token, or only token paths referenced by processed styles. */
	readonly tokens?: "all" | "used";
}

/**
 * Create a pure stylesheet compiler for a preset.
 *
 * The returned compiler is independent from the DOM. Feed it raw style
 * objects, inspect its generated token/atomic entries, or call `generate` to
 * produce a complete CSS string for SSR, extraction, or a build plugin.
 *
 * @example Generate CSS from the same preset used by `createCss`
 * ```ts
 * import { createCss } from "pandwind/css";
 * import { createStylesheet } from "pandwind/css/create-stylesheet";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const css = createCss(examplePreset);
 * const sheet = createStylesheet(examplePreset);
 * const output = sheet.generate([
 *   css.raw({ backgroundColor: "$blue-500", padding: 16 }),
 * ]);
 * ```
 *
 * @param preset - The token, property, and condition metadata to compile.
 * @param options - Hashing and class-name strategy options.
 * @param policies - Optional replaceable stylesheet policies.
 * @returns A pure compiler with `process`, `generate`, and inspectable rule
 *   generators.
 * @category stylesheet
 * @since 0.1.0
 */
export const createStylesheet = (
	preset: CssConfigReturn,
	options: CreateCssOptions = {},
	policies: StylesheetPolicies = {},
) => {
	const cache = new Map<string, Rule>();
	const varCompiler = createVarCompiler(Object.keys(preset.conditions));
	const conditionPolicy = policies.conditions ?? defaultConditionPolicy;
	const ordering = policies.ordering ?? createStylesheetOrderingPolicy();
	const serializer = policies.serializer ?? defaultRuleSerializer;
	const decoder = policies.decoder ?? defaultAtomicPathDecoder;
	const tokenEmission = policies.tokens ?? "all";

	const hashFn = options.hashFn ?? createHashFn(Boolean(options.debug));
	const debug = Boolean(options.debug);

	// Sheet-backed strategies own the class names of the declarations they
	// map — the generated selectors must match what the runtime emits.
	// Non-sheet-backed strategies (tailwind) keep the sheet untouched.
	const sheetStrategy = options.className;
	const classNameFor = (orderedKey: string, rawValue: string): string => {
		if (sheetStrategy?.sheetBacked === true) {
			const named = sheetStrategy.toClassName(orderedKey, rawValue);
			if (named !== null) return named;
		}
		return escapeIdentifier(hashFn(orderedKey, rawValue));
	};

	const emptyCondition = Object.keys(preset.conditions).find((key) => !preset.conditions[key]);
	const pathParts = (key: string, omitEmptyParts: boolean, sort: boolean): string[] => {
		const parts: string[] = [];
		for (const part of pairs.split(key)) {
			if (part === emptyCondition || (omitEmptyParts && part === "")) continue;
			parts.push(part);
		}
		// `parts` is private scratch allocated by this call; sorting in place
		// avoids the second array that `toSorted()` would require.
		// oxlint-disable-next-line no-array-sort
		return sort ? parts.sort() : parts;
	};

	const cssVars = new Map<string, TokenDeclaration>();

	const tokenMaps = buildTokenMaps(preset, debug);
	const usedTokenPaths = new Set<string>();
	let tokensCache: string | undefined;

	const presetTokens = preset.tokens ?? {};
	// Pre-compute the `:root` token declarations (the class-value maps live
	// in the shared `buildTokenMaps`).
	for (const group in presetTokens) {
		for (const tokenName in presetTokens[group]) {
			const tokenValue = presetTokens[group][tokenName];
			if (tokenValue === undefined) continue;
			const cssVarHash = hashCssVar(pairs.join([group, tokenName]), debug);
			const tokenPath = `${group}.${tokenName}`;

			if (typeof tokenValue === "object") {
				for (const condition in tokenValue) {
					const value = tokenValue[condition] as string;

					const resolved = preset.conditions[condition];
					// if (typeof resolved == null) {
					// 	throw new Error(`Unknown condition '${condition}' used in token '${tokenName}'`);
					// }

					const resolvedList = (Array.isArray(resolved) ? resolved : [resolved]).filter(
						(part): part is string => Boolean(part),
					);
					const conditions = Object.assign(conditionPolicy.create(), {
						className: "",
						parentSelectors: resolvedList.length ? [] : [":root "],
					});

					resolvedList.forEach((selector) => {
						conditionPolicy.parse(selector, conditions);
					});

					const priorities = resolvedList.map((part) =>
						getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
					);

					cssVars.set(`${tokenPath}.${condition}`, {
						declaration: serializer.serialize(cssVar.declaration(cssVarHash, value), conditions),
						priority: priorities.reduce((acc, prio) => acc + prio, 0),
					});
				}
				continue;
			}

			cssVars.set(tokenPath, {
				declaration: serializer.serialize(
					cssVar.declaration(cssVarHash, tokenValue),
					Object.assign(conditionPolicy.create(), {
						parentSelectors: [":root "],
					}),
				),
				priority: getPropertyPriority(tokenName),
			});
		}
	}

	const processFlatStyles = (style: FlatStyles) => {
		const localCache = new Map<string, Rule>();
		for (const key in style) {
			// By sorting the atomic path, we ensure different atomic paths leading to the same CSS
			// will always have the same hash
			// ex: `css({ _hover: { color: "red" } })` === `css({ color: { _hover: "red" }  })`
			const orderedKey = pairs.join(pathParts(key, false, true));
			const propertySeparator = key.lastIndexOf("__");
			const property = propertySeparator === -1 ? key : key.slice(propertySeparator + 2);
			const normalizedValue = normalizeCssValue(property, style[key]! as string | number);
			processNormalizedStyle(orderedKey, normalizedValue, localCache);
		}

		return localCache;
	};

	const processNormalizedStyle = (
		orderedKey: string,
		normalizedValue: string,
		localCache: Map<string, Rule>,
	): void => {
		const pairId = pairs.concat(orderedKey, normalizedValue);
		if (cache.has(pairId)) return;

		const atomic = decoder.decode(preset.conditions, pairId);
		const tokenGroup = tokenMaps.groupByProp.get(atomic.prop!);
		const tokenNames = tokenMaps.tokensByProp.get(atomic.prop!);
		if (tokenNames?.has(normalizedValue)) {
			// `tokenNames` contains every accepted spelling, including aliases
			// such as `brand` for a preset key `$brand`. Track the canonical
			// preset path so used-token emission keeps the variable declaration
			// for whichever spelling the caller authored.
			const tokenPath = tokenMaps.flatTokens.get(
				`${tokenGroup ?? atomic.prop!}.${normalizedValue}`,
			)?.path;
			if (tokenPath !== undefined && !usedTokenPaths.has(tokenPath)) {
				usedTokenPaths.add(tokenPath);
				tokensCache = undefined;
			}
		}
		const value = resolveTokenValue(tokenMaps, atomic.prop!, normalizedValue);

		const css = serializer.serialize([dashCase(atomic.prop!), value].join(":"), {
			...atomic.conditions,
			className: `.${classNameFor(orderedKey, normalizedValue)}`,
		});

		const rule = { id: pairId, css, priority: atomic.priority };
		cache.set(pairId, rule);
		localCache.set(pairId, rule);
	};

	const processPreparedStyles = (styles: readonly { key: string; value: string }[]) => {
		const localCache = new Map<string, Rule>();
		for (const { key, value } of styles) {
			processNormalizedStyle(key, value, localCache);
		}
		return localCache;
	};

	const processStyles = (styles: Array<StyleObject>) => {
		const merged = assign(...styles);
		const flat = flattenStyle(merged);
		return processFlatStyles(flat);
	};

	/**
	 * Var-inline toggle rules (plans/014): one rule per flattened key, whose
	 * declaration resolves the property through a fallback chain across all
	 * prefixes of its condition path (most specific first, base last).
	 * Missing links fall through, so chains are emitted in full regardless
	 * of which values a given element sets inline.
	 */
	const varCache = new Map<string, Rule>();
	const processVarKey = (flatKey: string): Rule | undefined => {
		const rawParts = pathParts(flatKey, true, false);
		const first = rawParts[0]!;
		const last = rawParts[rawParts.length - 1]!;
		const isCondition = (part: string): boolean =>
			part.startsWith("_") || preset.conditions[part] !== undefined;
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
		const prop = dashCase(propPart);
		const condParts = orderedConditions.map((part) =>
			part.startsWith("_") ? part.slice(1) : part,
		);
		let declaration = `var(--pw-c-${prop})`;
		for (let i = 1; i <= condParts.length; i++) {
			declaration = `var(--pw-c-${prop}_${condParts.slice(0, i).join("_")}, ${declaration})`;
		}
		const atomic = decoder.decode(preset.conditions, pairs.concat(orderedKey, "\u0000"));
		const css = serializer.serialize(`${prop}: ${declaration}`, {
			...atomic.conditions,
			className: `.${varCompiler.escapeClass(varCompiler.classFor(orderedKey))}`,
		});
		const rule = { id: orderedKey, css, priority: atomic.priority };
		varCache.set(orderedKey, rule);
		return rule;
	};

	const tokenEntries = (): TokenDeclaration[] =>
		Array.from(cssVars.entries())
			.filter(([path]) => {
				if (tokenEmission === "all") return true;
				for (const usedPath of usedTokenPaths) {
					if (path === usedPath || path.startsWith(`${usedPath}.`)) return true;
				}
				return false;
			})
			.map(([, token]) => token)
			.toSorted((a, b) => {
				const prio = a.priority - b.priority;
				if (prio === 0) return a.declaration.localeCompare(b.declaration);
				return prio;
			});

	const gen = {
		tokenEntries,
		tokens: () => {
			// Token declarations are derived entirely from the immutable preset;
			// unlike atomic and var rules, this map never changes after creation.
			// Keep the serialized form so runtime `css()` calls do not repeatedly
			// allocate, sort, and join the same root declarations.
			return (tokensCache ??= tokenEntries()
				.map((token) => token.declaration)
				.join("\n"));
		},
		atomic: () => {
			return ordering
				.order(cache.values())
				.map((v) => v.css)
				.join("\n");
		},
		/**
		 * Atomic rules WITH their identity (`id` = the pairId dedupe key).
		 * Per-route splitting (plans/014 §2) uses these to diff which rules
		 * each route bucket produces without re-parsing emitted CSS.
		 */
		atomicEntries: () =>
			ordering.order(cache.values()).map((v) => ({ id: v.id, css: v.css, priority: v.priority })),
		/** Var-inline toggle rules (see processVarKey), priority-ordered. */
		varRules: () => {
			return ordering
				.order(varCache.values())
				.map((v) => v.css)
				.join("\n");
		},
		/** Var toggle rules with identity — see atomicEntries. */
		varEntries: () =>
			ordering
				.order(varCache.values())
				.map((v) => ({ id: v.id, css: v.css, priority: v.priority })),
	};

	const generate = (styles: Array<StyleObject>) => {
		processStyles(styles);

		const tokensCss = gen.tokens();
		const atomicCss = gen.atomic();

		return [tokensCss, atomicCss].join("\n");
	};

	return {
		cache,
		process: processStyles,
		processPrepared: processPreparedStyles,
		processVarKey,
		gen,
		generate,
	};
};
