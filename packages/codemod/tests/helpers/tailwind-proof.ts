/**
 * Shared helpers for the Tailwind-parity tests: every assertion here is
 * checked against CSS produced by the real `tailwindcss` compiler (parsed
 * with postcss as an independent oracle), never against pandwind's own
 * output parsers.
 */
import { compile } from "@tailwindcss/node";
import { parse, type Root, type Rule } from "postcss";
import { selectorClassMatches } from "pandwind/css/selector-scan";
import { themeVariables } from "pandwind/tw";
export { resolveVar } from "pandwind/tw";

/** Default Tailwind entry — the same stylesheet the example app imports. */
export const TW_ENTRY = '@import "tailwindcss";';

/** Rules whose selector references the class (escaped forms included). */
export function rulesForClass(root: Root, className: string): Rule[] {
	const found: Rule[] = [];
	root.walkRules((rule) => {
		if (selectorClassMatches(rule.selector).some((match) => match.value === className))
			found.push(rule);
	});
	return found;
}

/**
 * The selector tail after the class itself — `.hover\:text-blue-400:hover`
 * with class `hover:text-blue-400` yields `:hover`. Comparing tails proves
 * css() conditions and tw() variants attach the same pseudo-classes.
 */
function selectorTail(selector: string, className: string): string {
	const matches = selectorClassMatches(selector);
	const match = matches.find((entry) => entry.value === className) ?? matches.at(-1);
	if (!match) return "";
	return selector.slice(match.end).trim();
}

/** Compile classes with the real Tailwind engine and parse the output. */
export async function compileClasses(
	entry: string,
	classes: string[],
): Promise<{ root: Root; vars: Map<string, string> }> {
	const result = await compile(entry, { base: import.meta.dirname, onDependency: () => {} });
	const root = parse(result.build(classes));
	return { root, vars: themeVariables(root) };
}
