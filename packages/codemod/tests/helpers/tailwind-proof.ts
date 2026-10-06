/**
 * Shared helpers for the Tailwind-parity tests: every assertion here is
 * checked against CSS produced by the real `tailwindcss` compiler (parsed
 * with postcss as an independent oracle), never against yumcss's own
 * output parsers.
 */
import { compile } from "@tailwindcss/node";
import { parse, type Root, type Rule } from "postcss";
import { selectorClassMatches } from "yumcss/css/selector-scan";
import { themeVariables } from "yumcss/tw";
export { resolveVar } from "yumcss/tw";

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

/** Compile classes with the real Tailwind engine and parse the output. */
export async function compileClasses(
	entry: string,
	classes: string[],
): Promise<{ root: Root; vars: Map<string, string> }> {
	const result = await compile(entry, { base: import.meta.dirname, onDependency: () => {} });
	const root = parse(result.build(classes));
	return { root, vars: themeVariables(root) };
}
