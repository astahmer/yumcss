import { splitSelectorList } from "./selector-list.ts";
import { pairs } from "../lib/utils.ts";
import type { AnyConditions } from "../types/typings.ts";
import { getPropertyPriority } from "./property-priorities.ts";

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
	condition.charCodeAt(condition.length - 1) === 38 &&
	condition.indexOf("&") === condition.length - 1;
const isAtRule = (condition: string): boolean => condition.charCodeAt(0) === 64;
const isSelectorList = (selector: string): boolean => splitSelectorList(selector).length > 1;

const hasTopLevelCombinator = (selector: string): boolean => {
	let depth = 0;
	let quote: string | null = null;
	let escaped = false;
	for (let index = 1; index < selector.length; index += 1) {
		const character = selector[index]!;
		if (escaped) escaped = false;
		else if (character === "\\") escaped = true;
		else if (quote) {
			if (character === quote) quote = null;
		} else if (character === '"' || character === "'") quote = character;
		else if (character === "(" || character === "[") depth += 1;
		else if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
		else if (
			depth === 0 &&
			(/[\s]/u.test(character) ||
				character === ">" ||
				character === "+" ||
				character === "~" ||
				(character === "|" && selector[index + 1] === "|"))
		) {
			return true;
		}
	}
	return false;
};

const isSimpleSelfSelector = (selector: string): boolean =>
	isSelfSelector(selector) && !hasTopLevelCombinator(selector);

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
	else if (isSimpleSelfSelector(selector)) conditions.selfSelectors.push(selector.slice(1));
	else if (isParentSelector(selector)) conditions.parentSelectors.push(selector.slice(0, -1));
	else if (selector.includes("&")) conditions.selectorLists.push(selector);
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
				const selectors = splitSelectorList(list);
				return selectors
					.map((selector) => {
						if (
							selector.includes("&") &&
							!isSimpleSelfSelector(selector) &&
							!isParentSelector(selector)
						) {
							const base = scopedClassName(className, selfSelectors);
							const scopedSelector = selector.startsWith("&")
								? selector.replaceAll("&", `${base}${selfSelectors.join("")}`)
								: `${selector.replaceAll("&", base)}${selfSelectors.join("")}`;
							return `${parentSelectors.join("")}${scopedSelector}`;
						}
						const selfs = [...selfSelectors];
						const parents = [...parentSelectors];
						if (isSimpleSelfSelector(selector)) selfs.push(selector.slice(1));
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
	const identitySeparator = atomicPath.indexOf("\u0000");
	const hasPairDelimiter =
		identitySeparator >= 2 && atomicPath.slice(identitySeparator - 2, identitySeparator) === "__";
	const encodedPath =
		identitySeparator === -1
			? atomicPath
			: atomicPath.slice(0, identitySeparator - (hasPairDelimiter ? 2 : 0));
	const parts = pairs.split(encodedPath);
	if (identitySeparator !== -1) parts.push("");
	const encodedValue =
		identitySeparator === -1 ? undefined : atomicPath.slice(identitySeparator + 1);
	if (parts.length === 2) {
		const [prop] = parts.slice(-2);
		const value = encodedValue ?? atomicPath.slice(atomicPath.indexOf("__") + 2);
		return { prop: prop!, value: value!, priority: getPropertyPriority(prop!), conditions };
	}
	const value = encodedValue ?? parts.at(-1)!;
	let prop: string | undefined;
	const conds = parts.slice(0, -1).reduce((acc, part) => {
		const resolved = Object.hasOwn(presetConditions, part) ? presetConditions[part]! : part;
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
