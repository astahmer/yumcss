import { assign, type FlatStyles, flattenStyle, pairs } from "../lib/utils.ts";
import type {
	AnyConditions,
	CssConfigReturn,
	StyleObject,
	TokenDeclaration,
} from "../types/typings.ts";
import { VarCompiler } from "./var-compiler.ts";
import type { CreateCssOptions } from "./create-css.ts";
import { normalizeStrategy } from "./class-name-strategy.ts";
import { createHashFn, dashCase, escapeIdentifier, hashCssVar } from "./hash.ts";
import { getPropertyPriority } from "./property-priorities.ts";
import { buildTokenMaps, resolveTokenValue } from "./tokens.ts";
import {
	createConditionsBucket,
	cssRuleSerializer,
	isSelfSelector,
	parseCondition,
} from "./css-rule-serializer.ts";

/** Priority-ordered copy of a rule cache's values. */
const byPriority = <T extends { priority: number }>(values: Iterable<T>): Array<T> =>
	Array.from(values).toSorted((a, b) => a.priority - b.priority);

export const createStylesheet = (preset: CssConfigReturn, options: CreateCssOptions = {}) => {
	const cache = new Map<string, Rule>();

	const hashFn = options.hashFn ?? createHashFn(Boolean(options.debug));
	const debug = Boolean(options.debug);

	// Sheet-backed strategies own the class names of the declarations they
	// map — the generated selectors must match what the runtime emits.
	// Non-sheet-backed strategies (tailwind) keep the sheet untouched.
	const sheetStrategy = normalizeStrategy(options.className);
	const classNameFor = (orderedKey: string, rawValue: string): string => {
		if (sheetStrategy?.sheetBacked === true) {
			const named = sheetStrategy.toClassName(orderedKey, rawValue);
			if (named !== null) return named;
		}
		return escapeIdentifier(hashFn(orderedKey, rawValue));
	};

	const emptyCondition = Object.keys(preset.conditions).find((key) => !preset.conditions[key]);

	const cssVars = new Map<string, TokenDeclaration>();

	const tokenMaps = buildTokenMaps(preset, debug);

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
					const conditions = createConditionsBucket({
						className: "",
						parentSelectors: resolvedList.length ? [] : [":root "],
					});

					resolvedList.forEach((selector) => {
						const isInvalid = parseCondition(selector, conditions);
						if (!isInvalid) return;
					});

					const priorities = resolvedList.map((part) =>
						getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
					);

					cssVars.set(`${tokenPath}.${condition}`, {
						declaration: cssRuleSerializer.serialize(
							cssVar.declaration(cssVarHash, value),
							conditions,
						),
						priority: priorities.reduce((acc, prio) => acc + prio, 0),
					});
				}
				continue;
			}

			cssVars.set(tokenPath, {
				declaration: cssRuleSerializer.serialize(
					cssVar.declaration(cssVarHash, tokenValue),
					createConditionsBucket({
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
			const orderedKey = pairs.join(
				pairs
					.split(key)
					.filter((part) => part !== emptyCondition)
					.toSorted(),
			);
			const pairId = pairs.concat(orderedKey, style[key]!);
			if (cache.has(pairId)) continue;

			const atomic = decodeAtomicPath(preset.conditions, pairId);
			const value = resolveTokenValue(tokenMaps, atomic.prop!, atomic.value!);

			const css = cssRuleSerializer.serialize([dashCase(atomic.prop!), value].join(":"), {
				...atomic.conditions,
				className: `.${classNameFor(orderedKey, style[key]!)}`,
			});

			cache.set(pairId, { id: pairId, css, priority: atomic.priority });
			localCache.set(pairId, { id: pairId, css, priority: atomic.priority });
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
	const processVarKey = (flatKey: string): void => {
		const orderedKey = pairs.join(
			pairs
				.split(flatKey)
				.filter((part) => part !== emptyCondition && part !== "")
				.toSorted(),
		);
		if (orderedKey === "" || varCache.has(orderedKey)) return;
		const rawParts = orderedKey.split("__").filter((part) => part !== "");
		// Prop = LAST segment; conditions = the rest, stripped + canonically sorted.
		const prop = dashCase(rawParts[rawParts.length - 1]!);
		const condParts = rawParts
			.slice(0, -1)
			.map((part) => (part.startsWith("_") ? part.slice(1) : part))
			.toSorted();
		let declaration = `var(--pw-c-${prop})`;
		for (let i = 1; i <= condParts.length; i++) {
			declaration = `var(--pw-c-${prop}_${condParts.slice(0, i).join("_")}, ${declaration})`;
		}
		const atomic = decodeAtomicPath(preset.conditions, pairs.concat(orderedKey, "\u0000"));
		const css = cssRuleSerializer.serialize(`${prop}: ${declaration}`, {
			...atomic.conditions,
			className: `.${VarCompiler.escapeClass(VarCompiler.classFor(orderedKey))}`,
		});
		varCache.set(orderedKey, { id: orderedKey, css, priority: atomic.priority });
	};

	const gen = {
		tokens: () => {
			return Array.from(cssVars.values())
				.toSorted((a, b) => {
					const prio = a.priority - b.priority;
					if (prio === 0) return a.declaration.localeCompare(b.declaration);
					return prio;
				})
				.map((token) => token.declaration)
				.join("\n");
		},
		atomic: () => {
			return byPriority(cache.values())
				.map((v) => v.css)
				.join("\n");
		},
		/**
		 * Atomic rules WITH their identity (`id` = the pairId dedupe key).
		 * Per-route splitting (plans/014 §2) uses these to diff which rules
		 * each route bucket produces without re-parsing emitted CSS.
		 */
		atomicEntries: () =>
			byPriority(cache.values()).map((v) => ({ id: v.id, css: v.css, priority: v.priority })),
		/** Var-inline toggle rules (see processVarKey), priority-ordered. */
		varRules: () => {
			return byPriority(varCache.values())
				.map((v) => v.css)
				.join("\n");
		},
		/** Var toggle rules with identity — see atomicEntries. */
		varEntries: () =>
			byPriority(varCache.values()).map((v) => ({ id: v.id, css: v.css, priority: v.priority })),
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
		processVarKey,
		gen,
		generate,
	};
};

export const decodeAtomicPath = (presetConditions: AnyConditions, atomicPath: string) => {
	const conditions = createConditionsBucket();

	const parts = pairs.split(atomicPath);
	if (parts.length === 2) {
		const [prop, value] = parts.slice(-2);
		return {
			prop: prop!,
			value: value!,
			priority: getPropertyPriority(prop!),
			conditions,
		};
	}

	const value = parts.slice(-1)[0]!;

	let prop: string | undefined;
	const conds = parts.slice(0, -1).reduce((acc, part) => {
		const resolved = presetConditions[part] ?? part;
		const resolvedList = Array.isArray(resolved) ? resolved : [resolved];

		resolvedList.forEach((selector) => {
			const isInvalid = parseCondition(selector, conditions);
			if (!isInvalid) return;

			if (!prop) {
				prop = selector;
			} else {
				throw new Error(`Unknown condition '${selector}' used in path '${atomicPath}'`);
			}
		});

		return acc.concat(resolved).filter(Boolean);
	}, [] as string[]);
	if (!prop) throw new Error(`Couldnt find property in '${parts.join(":")}'`);

	const priorities = conds.map((part) =>
		getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
	);

	return {
		prop,
		value,
		priority: priorities.reduce((acc, prio) => acc + prio, 0),
		conditions,
	};
};

const createConditionsBucket = (partial?: Partial<ParsedConditions>): ParsedConditions => {
	return {
		className: "",
		selfSelectors: [],
		parentSelectors: [],
		selectorLists: [],
		atRules: [],
		...partial,
	};
};

const cssVar = {
	ref: (key: string) => `var(--${key})`,
	declaration: (key: string, value: string) => `--${key}: ${value};`,
};

type Rule = { id: string; css: string; priority: number };
