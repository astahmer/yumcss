/**
 * Shared helpers for the Tailwind-parity tests: every assertion here is
 * checked against CSS produced by the real `tailwindcss` compiler (parsed
 * with postcss as an independent oracle), never against pandwind's own
 * output parsers.
 */
import { compile } from "@tailwindcss/node";
import { parse, type Root, type Rule } from "postcss";
import selectorParser from "postcss-selector-parser";
import { resolveVar, themeVariables } from "../../src/tw/theme.ts";

/** Default Tailwind entry — the same stylesheet the example app imports. */
export const TW_ENTRY = '@import "tailwindcss";';

/** Rules whose selector references the class (escaped forms included). */
export function rulesForClass(root: Root, className: string): Rule[] {
	const found: Rule[] = [];
	root.walkRules((rule) => {
		let matches = false;
		selectorParser((selectors) => {
			selectors.walkClasses((node) => {
				if (node.value === className) matches = true;
			});
		}).processSync(rule.selector);
		if (matches) found.push(rule);
	});
	return found;
}

/**
 * The selector tail after the class itself — `.hover\:text-blue-400:hover`
 * with class `hover:text-blue-400` yields `:hover`. Comparing tails proves
 * css() conditions and tw() variants attach the same pseudo-classes.
 */
export function selectorTail(selector: string, className: string): string {
	let tail = "";
	selectorParser((selectors) => {
		selectors.walkClasses((node) => {
			if (node.value === className) {
				tail = selector.slice(node.sourceIndex + node.toString().length).trim();
			}
		});
	}).processSync(selector);
	return tail;
}

export { resolveVar, themeVariables };

/** Compile classes with the real Tailwind engine and parse the output. */
export async function compileClasses(
	entry: string,
	classes: string[],
): Promise<{ root: Root; vars: Map<string, string> }> {
	const result = await compile(entry, { base: import.meta.dirname, onDependency: () => {} });
	const root = parse(result.build(classes));
	return { root, vars: themeVariables(root) };
}
