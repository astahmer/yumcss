import { assign, type FlatStyles, flattenStyle, pairs } from "../lib/utils.ts";
import type { CssConfigReturn, StyleObject, TokenDeclaration } from "../types/typings.ts";
import { createVarCompiler, varConditionPart } from "./var-compiler.ts";
import type { CreateCssOptions } from "./create-css.ts";
import {
	canonicalStyleKey,
	cssPropertyFromKey,
	isColorProperty,
	isEmptyCondition,
} from "../backends/css.ts";
import { createHashFn, dashCase, escapeIdentifier } from "./hash.ts";
import { keyframeName, normalizeKeyframeSteps, type KeyframeBody } from "./keyframes.ts";
import { getPropertyPriority } from "./property-priorities.ts";
import {
	buildTokenMaps,
	resolveTokenAliasValue,
	resolveTokenValue,
	tokenDependencyPaths,
} from "./tokens.ts";
import { buildColorPaletteMaps } from "./color-palettes.ts";
import {
	assertColorPaletteConfigured,
	assertColorPaletteResolved,
} from "./color-palette-validation.ts";
import { isSelfSelector } from "./stylesheet-lowering.ts";
import { decorateCascadeRules, wrapCascadeLayer } from "./cascade.ts";
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
import {
	decodeFirstThatWorks,
	isCompilableCssValue,
	normalizeFirstThatWorks,
} from "./first-that-works.ts";
import { normalizeCssValue } from "./value-normalization.ts";
import { normalizeCssVariables } from "./css-variables.ts";
import { createTokenVariableName } from "./token-variable-names.ts";
import { expandRawStyle } from "./raw.ts";

export { decodeAtomicPath } from "./stylesheet-lowering.ts";
export { getPropertyPriority } from "./property-priorities.ts";

type Rule = { id: string; css: string; priority: number };

export interface PreparedStyle {
	readonly key: string;
	readonly value: string;
	readonly className?: string;
}
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
 * The returned compiler is independent from the DOM. Use `process` and
 * `generate` for SSR, extraction, or a build plugin, and inspect its rule
 * generators when an integration needs the intermediate entries.
 *
 * @example
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
 * @param options - Hashing, class-name strategy, and dynamic-carrier options.
 *   Match the namespace used by the corresponding CSS factory.
 * @param policies - Optional replaceable stylesheet policies.
 * @returns A pure compiler with `process`, `generate`, and rule generators.
 * @category stylesheet
 * @since 0.1.0
 */
export const createStylesheet = (
	preset: CssConfigReturn,
	options: CreateCssOptions = {},
	policies: StylesheetPolicies = {},
) => {
	const cache = new Map<string, Rule>();
	const conditionNames = Object.keys(preset.conditions);
	const namespace = options.namespace ?? "pw";
	const varCompiler = createVarCompiler(
		conditionNames,
		conditionNames.filter((name) => isEmptyCondition(name, preset.conditions)),
		namespace,
	);
	const conditionPolicy = policies.conditions ?? defaultConditionPolicy;
	const ordering = policies.ordering ?? createStylesheetOrderingPolicy();
	const serializer = policies.serializer ?? defaultRuleSerializer;
	const decoder = policies.decoder ?? defaultAtomicPathDecoder;
	const tokenEmission = policies.tokens ?? "all";
	const serializeStyle = (
		declaration: string,
		conditions: Parameters<typeof serializer.serialize>[1],
	) => serializer.serialize(declaration, conditions);

	const hashFn = options.hashFn ?? createHashFn(Boolean(options.debug));
	const debug = Boolean(options.debug);
	const tokenVariableName = createTokenVariableName(preset, debug, options.tokenVariableNames);

	// Sheet-backed strategies own the class names of the declarations they
	// map — the generated selectors must match what the runtime emits.
	// Non-sheet-backed strategies (tailwind) keep the sheet untouched.
	const sheetStrategy = options.className;
	const classNameFor = (orderedKey: string, rawValue: string): string => {
		if (sheetStrategy?.sheetBacked === true) {
			const named = sheetStrategy.toClassName(orderedKey, rawValue);
			if (
				typeof named === "string" &&
				named.length > 0 &&
				!/\s/.test(named) &&
				!named.includes("\u0000")
			)
				return named;
		}
		return hashFn(orderedKey, rawValue);
	};
	const isSafeClassName = (value: string): boolean =>
		value.length > 0 && !/\s/.test(value) && !value.includes("\u0000");

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

	const cssVars = new Map<string, TokenDeclaration>();
	const keyframesCache = new Map<string, Rule>();

	const tokenMaps = buildTokenMaps(preset, debug, options.tokenVariableNames);
	const colorPaletteMaps = buildColorPaletteMaps(preset, tokenMaps.flatTokens, debug);
	const usedTokenPaths = new Set<string>();
	let tokensCache: string | undefined;

	const presetTokens = preset.tokens ?? {};
	// Pre-compute the `:root` token declarations (the class-value maps live
	// in the shared `buildTokenMaps`).
	for (const group of Object.keys(presetTokens)) {
		const groupTokens = presetTokens[group];
		if (groupTokens === undefined || typeof groupTokens === "function") continue;
		for (const tokenName of Object.keys(groupTokens)) {
			const tokenValue = groupTokens[tokenName];
			if (tokenValue === undefined) continue;
			const cssVarHash = tokenVariableName(group, tokenName);
			const tokenPath = `${group}.${tokenName}`;

			if (typeof tokenValue === "object") {
				for (const condition of Object.keys(tokenValue)) {
					if (condition !== "base" && !Object.hasOwn(preset.conditions, condition))
						throw new Error(`Unknown condition '${condition}' in token '${tokenPath}'`);
					const value = resolveTokenAliasValue(
						tokenMaps,
						tokenPath,
						tokenValue[condition] as string,
					);

					const resolved = condition === "base" ? "" : preset.conditions[condition]!;

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
					cssVar.declaration(cssVarHash, resolveTokenAliasValue(tokenMaps, tokenPath, tokenValue)),
					Object.assign(conditionPolicy.create(), {
						parentSelectors: [":root "],
					}),
				),
				priority: getPropertyPriority(tokenName),
			});
		}
	}

	const normalizedCssVariables = normalizeCssVariables(preset.cssVariables);
	for (const entry of normalizedCssVariables.values) {
		if (entry.condition !== "base" && !Object.hasOwn(preset.conditions, entry.condition))
			throw new Error(`Unknown condition '${entry.condition}' in css variable '--${entry.name}'`);
		const resolved = entry.condition === "base" ? "" : preset.conditions[entry.condition]!;
		const resolvedList = (Array.isArray(resolved) ? resolved : [resolved]).filter(
			(part): part is string => Boolean(part),
		);
		const conditions = Object.assign(conditionPolicy.create(), {
			className: "",
			parentSelectors: resolvedList.length ? [] : [":root "],
		});
		resolvedList.forEach((selector) => conditionPolicy.parse(selector, conditions));
		const priorities = resolvedList.map((part) =>
			getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
		);
		cssVars.set(`cssVariables.${entry.name}.${entry.condition}`, {
			declaration: serializer.serialize(cssVar.declaration(entry.name, entry.value), conditions),
			priority: priorities.reduce((acc, priority) => acc + priority, 0),
		});
	}

	const cssVariableRegistrations = normalizedCssVariables.registrations
		.map(
			({ name, descriptor }) =>
				`@property --${escapeIdentifier(name)}{syntax:${descriptor.syntax};inherits:${String(descriptor.inherits)};initial-value:${descriptor.initialValue}}`,
		)
		.toSorted();

	const processFlatStyles = (style: FlatStyles) => {
		const localCache = new Map<string, Rule>();
		for (const key of Object.keys(style)) {
			const rawValue = style[key];
			if (!isCompilableCssValue(rawValue)) continue;
			// By sorting the atomic path, we ensure different atomic paths leading to the same CSS
			// will always have the same hash
			// ex: `css({ _hover: { color: "red" } })` === `css({ color: { _hover: "red" }  })`
			const orderedKey = canonicalStyleKey(key, preset.conditions);
			const property = cssPropertyFromKey(orderedKey, preset.conditions);
			const normalizedValue = normalizeFirstThatWorks(property, rawValue);
			processNormalizedStyle(orderedKey, normalizedValue, localCache);
		}

		return localCache;
	};

	/**
	 * Resolve one declaration to its emitted `property:value` form and record
	 * the preset token paths it uses. Atomic rules and keyframe steps share
	 * this path so both lanes resolve tokens identically.
	 */
	const resolveDeclaration = (
		property: string,
		normalizedValue: string,
		rawProperty: string,
	): string => {
		const tokenGroup = tokenMaps.groupByProp.get(property);
		const tokenNames = tokenMaps.tokensByProp.get(property);
		if (tokenNames?.has(normalizedValue)) {
			// `tokenNames` contains every accepted spelling, including aliases
			// such as `brand` for a preset key `$brand`. Track the canonical
			// preset path so used-token emission keeps the variable declaration
			// for whichever spelling the caller authored.
			const tokenPath = tokenMaps.flatTokens.get(
				`${tokenGroup ?? rawProperty}.${normalizedValue}`,
			)?.path;
			if (tokenPath !== undefined) {
				for (const dependency of tokenDependencyPaths(tokenMaps, tokenPath)) {
					if (usedTokenPaths.has(dependency)) continue;
					usedTokenPaths.add(dependency);
					tokensCache = undefined;
				}
			}
		}
		const colorPaletteValue = isColorProperty(property)
			? colorPaletteMaps.values.get(normalizedValue)
			: undefined;
		return [
			dashCase(property),
			colorPaletteValue ?? resolveTokenValue(tokenMaps, property, normalizedValue),
		].join(":");
	};

	/** One declaration, or the reversed fallback chain a firstThatWorks value encodes. */
	const resolveDeclarations = (
		property: string,
		normalizedValue: string,
		rawProperty: string,
	): string => {
		const fallbackValues = decodeFirstThatWorks(normalizedValue);
		if (fallbackValues === undefined)
			return resolveDeclaration(property, normalizedValue, rawProperty);
		return fallbackValues
			.map((value) => normalizeCssValue(property, value))
			.toReversed()
			.map((value) => resolveDeclaration(property, value, rawProperty))
			.join(";");
	};

	const processNormalizedStyle = (
		orderedKey: string,
		normalizedValue: string,
		localCache: Map<string, Rule>,
		preparedClassName?: string,
	): void => {
		if (orderedKey === "" || !isCompilableCssValue(normalizedValue)) return;
		const pairId = pairs.concat(orderedKey, normalizedValue);
		if (cache.has(pairId)) return;

		const atomic = decoder.decode(preset.conditions, pairId);
		const property = cssPropertyFromKey(atomic.prop!, preset.conditions);
		const fallbackValues = decodeFirstThatWorks(normalizedValue);
		if (fallbackValues !== undefined) {
			if (sheetStrategy !== undefined && sheetStrategy.sheetBacked !== true) {
				throw new Error(
					"pandwind: firstThatWorks requires the atomic stylesheet or a sheet-backed class-name strategy.",
				);
			}
			if (property === "colorPalette") {
				throw new Error("pandwind: firstThatWorks cannot be used with the colorPalette selector.");
			}
			const declaration = resolveDeclarations(property, normalizedValue, atomic.prop!);
			const className =
				preparedClassName !== undefined && isSafeClassName(preparedClassName)
					? preparedClassName
					: classNameFor(orderedKey, normalizedValue);
			const css = serializeStyle(declaration, {
				...atomic.conditions,
				className: `.${escapeIdentifier(className)}`,
			});
			const rule = { id: pairId, css, priority: atomic.priority };
			cache.set(pairId, rule);
			localCache.set(pairId, rule);
			return;
		}
		if (property === "colorPalette") {
			const assignments = colorPaletteMaps.palettes.get(normalizedValue);
			if (assignments === undefined || assignments.length === 0) {
				assertColorPaletteResolved(preset, normalizedValue, false);
				return;
			}
			for (const assignment of assignments) {
				for (const dependency of tokenDependencyPaths(tokenMaps, assignment.tokenPath)) {
					if (usedTokenPaths.has(dependency)) continue;
					usedTokenPaths.add(dependency);
					tokensCache = undefined;
				}
			}
			const className =
				preparedClassName !== undefined && isSafeClassName(preparedClassName)
					? preparedClassName
					: classNameFor(orderedKey, normalizedValue);
			const declaration = assignments.map((assignment) =>
				cssVar.declaration(assignment.cssVar, assignment.value),
			);
			const css = serializeStyle(declaration.join(""), {
				...atomic.conditions,
				className: `.${escapeIdentifier(className)}`,
			});
			const rule = { id: pairId, css, priority: atomic.priority };
			cache.set(pairId, rule);
			localCache.set(pairId, rule);
			return;
		}
		const declaration = resolveDeclaration(property, normalizedValue, atomic.prop!);
		const className =
			preparedClassName !== undefined && isSafeClassName(preparedClassName)
				? preparedClassName
				: classNameFor(orderedKey, normalizedValue);

		const css = serializeStyle(declaration, {
			...atomic.conditions,
			className: `.${escapeIdentifier(className)}`,
		});

		const rule = { id: pairId, css, priority: atomic.priority };
		cache.set(pairId, rule);
		localCache.set(pairId, rule);
	};

	const processPreparedStyles = (styles: readonly PreparedStyle[]) => {
		const localCache = new Map<string, Rule>();
		for (const { key, value, className: preparedClassName } of styles) {
			if (typeof key !== "string" || key.length === 0 || key.includes("\u0000")) continue;
			if (!isCompilableCssValue(value)) continue;
			const orderedKey = canonicalStyleKey(key, preset.conditions);
			const property = cssPropertyFromKey(orderedKey, preset.conditions);
			processNormalizedStyle(
				orderedKey,
				normalizeFirstThatWorks(property, value),
				localCache,
				preparedClassName,
			);
		}
		return localCache;
	};

	const processStyles = (styles: Array<StyleObject>) => {
		const merged = assign(...styles.map((style) => expandRawStyle(style)));
		const flat = flattenStyle(merged);
		return processFlatStyles(flat);
	};

	/**
	 * Emit the `@keyframes` rule for an authored step body and return the
	 * animation name the `animation` shorthand references. The name is derived
	 * from the canonical body, so the runtime factory and this build lane agree
	 * without shared state.
	 */
	const processKeyframes = (body: KeyframeBody): string => {
		const name = keyframeName(body, namespace);
		if (keyframesCache.has(name)) return name;
		const steps: string[] = [];
		for (const { name: step, declarations } of normalizeKeyframeSteps(body)) {
			const flat =
				typeof declarations === "object" && declarations !== null ? flattenStyle(declarations) : {};
			const resolved: string[] = [];
			for (const flatKey of Object.keys(flat).toSorted()) {
				if (flatKey.includes("__")) {
					// A step has no selector, so a nested condition could only be
					// dropped silently. Authored CSS remains the fallback.
					throw new Error(
						`pandwind: keyframe step '${step}' cannot nest '${flatKey}'; a keyframe step has no selector.`,
					);
				}
				const value = flat[flatKey]!;
				if (!isCompilableCssValue(value)) continue;
				const property = cssPropertyFromKey(flatKey, preset.conditions);
				resolved.push(
					resolveDeclarations(property, normalizeFirstThatWorks(property, value), property),
				);
			}
			steps.push(`${step}{${resolved.join(";")}}`);
		}
		keyframesCache.set(name, {
			id: name,
			css: `@keyframes ${escapeIdentifier(name)}{${steps.join("")}}`,
			priority: 0,
		});
		return name;
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
		const prop = dashCase(cssPropertyFromKey(propPart, preset.conditions));
		if (prop === "color-palette") {
			assertColorPaletteConfigured(preset);
			throw new Error(
				"pandwind: colorPalette is a static palette selector and cannot be used with css.vars.",
			);
		}
		const condParts = orderedConditions.map(varConditionPart);
		let declaration = `var(--${namespace}-c-${prop})`;
		for (let i = 1; i <= condParts.length; i++) {
			declaration = `var(--${namespace}-c-${prop}_${condParts.slice(0, i).join("_")}, ${declaration})`;
		}
		const atomic = decoder.decode(preset.conditions, pairs.concat(orderedKey, "\u0000"));
		const css = serializeStyle(`${prop}: ${declaration}`, {
			...atomic.conditions,
			className: `.${varCompiler.escapeClass(varCompiler.classFor(orderedKey))}`,
		});
		const rule = { id: orderedKey, css, priority: atomic.priority };
		varCache.set(orderedKey, rule);
		return rule;
	};

	const orderedRuleSections = (): { atomic: Rule[]; vars: Rule[] } => {
		const atomic = ordering.order(cache.values());
		const vars = ordering.order(varCache.values());
		if (options.cascade !== "specificity") return { atomic, vars };
		const decorated = decorateCascadeRules([...atomic, ...vars], options.cascade);
		return {
			atomic: decorated.slice(0, atomic.length),
			vars: decorated.slice(atomic.length),
		};
	};

	const tokenEntries = (): TokenDeclaration[] =>
		Array.from(cssVars.entries())
			.filter(([path]) => {
				if (tokenEmission === "all") return true;
				if (path.startsWith("cssVariables.")) return true;
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
			return (tokensCache ??= [
				...cssVariableRegistrations,
				...tokenEntries().map((token) => token.declaration),
			]
				.filter(Boolean)
				.join("\n"));
		},
		/**
		 * `@keyframes` rules with identity. They are order-independent against
		 * class rules and stay outside the priority bands, so they are emitted
		 * in name order instead of through the ordering policy.
		 */
		keyframesEntries: (): Rule[] =>
			Array.from(keyframesCache.values()).toSorted((left, right) =>
				left.id.localeCompare(right.id),
			),
		keyframes: () =>
			gen
				.keyframesEntries()
				.map((rule) => rule.css)
				.join("\n"),
		atomic: () => {
			return orderedRuleSections()
				.atomic.map((v) => v.css)
				.join("\n");
		},
		/**
		 * Atomic rules WITH their identity (`id` = the pairId dedupe key).
		 * Per-route splitting (plans/014 §2) uses these to diff which rules
		 * each route bucket produces without re-parsing emitted CSS.
		 */
		atomicEntries: () =>
			orderedRuleSections().atomic.map((v) => ({
				id: v.id,
				css: v.css,
				priority: v.priority,
			})),
		/** Var-inline toggle rules (see processVarKey), priority-ordered. */
		varRules: () => {
			return orderedRuleSections()
				.vars.map((v) => v.css)
				.join("\n");
		},
		/** Var toggle rules with identity — see atomicEntries. */
		varEntries: () =>
			orderedRuleSections().vars.map((v) => ({
				id: v.id,
				css: v.css,
				priority: v.priority,
			})),
	};

	const generate = (styles: Array<StyleObject>) => {
		processStyles(styles);

		const tokensCss = gen.tokens();
		const keyframesCss = gen.keyframes();
		const atomicCss = gen.atomic();

		return wrapCascadeLayer(
			[tokensCss, keyframesCss, atomicCss].filter(Boolean).join("\n"),
			options.cascade,
		);
	};

	return {
		cache,
		process: processStyles,
		processPrepared: processPreparedStyles,
		processKeyframes,
		processVarKey,
		gen,
		generate,
	};
};
