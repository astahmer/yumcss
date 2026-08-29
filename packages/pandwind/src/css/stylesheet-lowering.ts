import parser from "postcss-selector-parser";
import { pairs } from "../lib/utils.ts";
import type { AnyConditions } from "../types/typings.ts";
import { getPropertyPriority, isKnownCssProperty } from "./property-priorities.ts";

export interface ParsedConditions {
	readonly className: string;
	readonly selfSelectors: string[];
	readonly parentSelectors: string[];
	readonly selectorLists: string[];
	readonly atRules: string[];
}

export const createConditionsBucket = (
	partial: Partial<ParsedConditions> = {},
): {
	className: string;
	selfSelectors: string[];
	parentSelectors: string[];
	selectorLists: string[];
	atRules: string[];
} => ({
	className: "",
	selfSelectors: [],
	parentSelectors: [],
	selectorLists: [],
	atRules: [],
	...partial,
});

export const isSelfSelector = (condition: string): boolean => condition.charCodeAt(0) === 38;
const scopedClassName = (className: string, selectors: readonly string[]): string =>
	selectors.some((selector) => selector.includes(":where(")) && className.startsWith(".")
		? `${className}${className}`
		: className;
const isParentSelector = (condition: string): boolean =>
	condition.charCodeAt(condition.length - 1) === 38;
const isAtRule = (condition: string): boolean => condition.charCodeAt(0) === 64;
const isSelectorList = (selector: string): boolean => {
	let parentheses = 0;
	for (const character of selector) {
		if (character === "(") parentheses++;
		else if (character === ")") parentheses--;
		else if (character === "," && parentheses === 0) return true;
	}
	return false;
};
const isSelectorPath = (part: string): boolean =>
	part.startsWith("@") || /[&>+~:[\],.#*\s]/.test(part);

export const parseCondition = (
	selector: string,
	conditions: {
		selfSelectors: string[];
		parentSelectors: string[];
		selectorLists: string[];
		atRules: string[];
	},
): true | undefined => {
	if (!selector) return;
	if (isSelectorList(selector)) conditions.selectorLists.push(selector);
	else if (isSelfSelector(selector)) conditions.selfSelectors.push(selector.slice(1));
	else if (isParentSelector(selector)) conditions.parentSelectors.push(selector.slice(0, -1));
	else if (isAtRule(selector)) conditions.atRules.push(selector);
	else return true;
	return;
};

export const genCSSRule = (decls: string, conditions: ParsedConditions): string => {
	const { className, selfSelectors, parentSelectors, selectorLists, atRules } = conditions;
	if (selectorLists.length) {
		return atRules.reduce(
			(acc, atRule) => `${atRule}{${acc}}`,
			`${selectorLists.map((list) => {
				const selectors: string[] = [];
				parser((nodes) => {
					selectors.push(...nodes.nodes.map((node) => node.toString().trim()));
				}).processSync(list);
				return selectors
					.map((selector) => {
						const selfs = [...selfSelectors];
						const parents = [...parentSelectors];
						if (isSelfSelector(selector)) selfs.push(selector.slice(1));
						else if (isParentSelector(selector)) parents.push(selector.slice(0, -1));
						return `${parents.join("")}${scopedClassName(className, selfs)}${selfs.join("")}`;
					})
					.join(", ");
			})}{${decls}}`,
		);
	}
	const selectors = `${parentSelectors.join("")}${scopedClassName(className, selfSelectors)}${selfSelectors.join("")}`;
	return atRules.reduce((acc, atRule) => `${atRule}{${acc}}`, `${selectors}{${decls}}`);
};

export interface DecodedAtomicPath {
	readonly prop: string;
	readonly value: string;
	readonly priority: number;
	readonly conditions: ReturnType<typeof createConditionsBucket>;
}

export function decodeAtomicPath(
	presetConditions: AnyConditions,
	atomicPath: string,
): DecodedAtomicPath {
	const conditions = createConditionsBucket();
	const parts = pairs.split(atomicPath);
	if (parts.length === 2) {
		const [prop, value] = parts.slice(-2);
		return { prop: prop!, value: value!, priority: getPropertyPriority(prop!), conditions };
	}
	const value = parts.at(-1)!;
	const pathParts = parts.slice(0, -1);
	const knownPropertyIndexes = pathParts
		.map((part, index) => (isKnownCssProperty(part) ? index : -1))
		.filter((index) => index !== -1);
	const propertyIndexes =
		knownPropertyIndexes.length === 1
			? knownPropertyIndexes
			: knownPropertyIndexes.length === 0 && pathParts.some(isSelectorPath)
				? pathParts
					.map((part, index) => (/^(?:[A-Za-z_][\w-]*|--[\w-]+)$/.test(part) ? index : -1))
					.filter((index) => index !== -1)
			: [];
	// Flattened style objects put the property either before or after nested
	// conditions. Once the property catalog identifies that segment, every
	// other segment is unambiguously a condition—even when it is an authored
	// selector such as `+ h2` or an arbitrary at-rule.
	if (propertyIndexes.length === 1) {
		const propertyIndex = propertyIndexes[0]!;
		const prop = pathParts[propertyIndex]!;
		const conditionPaths = pathParts.filter((_part, index) => index !== propertyIndex);
		for (const path of conditionPaths) {
			const resolved = presetConditions[path] ?? path;
			const resolvedList = Array.isArray(resolved) ? resolved : [resolved];
			for (const selector of resolvedList) {
				const normalized = normalizeArbitrarySelector(selector);
				const invalid = parseCondition(normalized, conditions);
				if (invalid !== undefined)
					throw new Error(`Unknown condition '${selector}' used in path '${atomicPath}'`);
			}
		}
		const priorities = conditionPaths.flatMap((path) => {
			const resolved = presetConditions[path] ?? path;
			const resolvedList = Array.isArray(resolved) ? resolved : [resolved];
			return resolvedList.map((part) =>
				getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
			);
		});
		return {
			prop,
			value,
			priority: getPropertyPriority(prop) + priorities.reduce((sum, priority) => sum + priority, 0),
			conditions,
		};
	}
	let prop: string | undefined;
	const conds = parts.slice(0, -1).reduce((acc, part) => {
		const resolved = presetConditions[part] ?? part;
		const resolvedList = Array.isArray(resolved) ? resolved : [resolved];
		for (const selector of resolvedList) {
			const invalid = parseCondition(selector, conditions);
			if (invalid === undefined) continue;
			if (prop === undefined) prop = selector;
			else throw new Error(`Unknown condition '${selector}' used in path '${atomicPath}'`);
		}
		return acc.concat(resolved).filter(Boolean);
	}, [] as string[]);
	if (prop === undefined) throw new Error(`Couldnt find property in '${parts.join(":")}'`);
	const priorities = conds.map((part) =>
		getPropertyPriority(isSelfSelector(part) ? part.slice(1) : part),
	);
	return {
		prop,
		value,
		priority: priorities.reduce((sum, priority) => sum + priority, 0),
		conditions,
	};
}

/** Make CSS-in-JS selector shorthand explicit before the selector policy parses it. */
const normalizeArbitrarySelector = (selector: string): string => {
	if (isAtRule(selector)) return selector;
	if (isSelectorList(selector)) {
		const selectors: string[] = [];
		parser((nodes) => {
			selectors.push(...nodes.nodes.map((node) => node.toString().trim()));
		}).processSync(selector);
		return selectors.map(normalizeArbitrarySelector).join(", ");
	}
	if (isSelfSelector(selector) || isParentSelector(selector)) return selector;
	return `& ${selector}`;
};
