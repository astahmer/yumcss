import parser from "postcss-selector-parser";

export interface ParsedConditions {
	className: string;
	selfSelectors: Array<string>;
	parentSelectors: Array<string>;
	selectorLists: Array<string>;
	atRules: Array<string>;
}

export const createConditionsBucket = (partial?: Partial<ParsedConditions>): ParsedConditions => ({
	className: "",
	selfSelectors: [],
	parentSelectors: [],
	selectorLists: [],
	atRules: [],
	...partial,
});

export const isSelfSelector = (condition: string): boolean => condition.charCodeAt(0) === 38;
const isParentSelector = (condition: string): boolean =>
	condition.charCodeAt(condition.length - 1) === 38;
const isAtRule = (condition: string): boolean => condition.charCodeAt(0) === 64;

const isSelectorList = (selector: string): boolean => {
	let inParentheses = false;
	for (const char of selector) {
		if (char === "(") inParentheses = true;
		else if (char === ")") inParentheses = false;
		else if (char === "," && !inParentheses) return true;
	}
	return false;
};

/** Parse one condition into its selector/at-rule buckets. */
export const parseCondition = (
	selector: string,
	conditions: ParsedConditions,
): true | undefined => {
	if (!selector) return;
	if (isSelectorList(selector)) {
		conditions.selectorLists.push(selector);
		return;
	}
	if (isSelfSelector(selector)) {
		conditions.selfSelectors.push(selector.slice(1));
		return;
	}
	if (isParentSelector(selector)) {
		conditions.parentSelectors.push(selector.slice(0, -1));
		return;
	}
	if (isAtRule(selector)) {
		conditions.atRules.push(selector);
		return;
	}
	return true;
};

export class CssRuleSerializer {
	serialize(declarations: string, conditions: ParsedConditions): string {
		const { className, selfSelectors, parentSelectors, selectorLists, atRules } = conditions;
		if (selectorLists.length) {
			return atRules.reduce(
				(acc, atRule) => `${atRule}{${acc}}`,
				`${selectorLists
					.map((list) => {
						const atomicSelectors: string[] = [];
						parser((selectors) => {
							atomicSelectors.push(...selectors.nodes.map((node) => node.toString().trim()));
						}).processSync(list);
						return atomicSelectors
							.map((selector) => {
								const selfs = [...selfSelectors];
								const parents = [...parentSelectors];
								if (isSelfSelector(selector)) selfs.push(selector.slice(1));
								else if (isParentSelector(selector)) parents.push(selector.slice(0, -1));
								return `${parents.join("")}${className}${selfs.join("")}`;
							})
							.join(", ");
					})
					.join(", ")}{${declarations}}`,
			);
		}
		const selectors = `${parentSelectors.join("")}${className}${selfSelectors.join("")}`;
		return atRules.reduce((acc, atRule) => `${atRule}{${acc}}`, `${selectors}{${declarations}}`);
	}
}

export const cssRuleSerializer = new CssRuleSerializer();
