/**
 * Pure helpers for the css() static extractor — shared, unit-testable and
 * free of vite/rollup types.
 *
 * The extractor scans source files for `css(...)`, `css.class(...)` and
 * `css.raw(...)` calls with literal arguments, resolves them through the
 * design layer (`resolveDesignStyle`) and feeds the result to a shared
 * `createStylesheet` instance. The generated CSS is served as a virtual
 * module, so no runtime stylesheet accumulation is needed for static calls.
 */
import { type Expression, parseSync } from "oxc-parser";
import { resolveDesignStyle } from "../design/resolve.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
} from "../types/typings.ts";

export type CssPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

interface ImportNode extends OxcNode {
	source?: { value?: string };
	specifiers?: OxcSpecifier[];
}

interface OxcSpecifier {
	type: string;
	imported?: { name?: string };
	local?: { name?: string };
}

interface CallNode extends OxcNode {
	callee: OxcNode | null;
	arguments: unknown[];
}

/** True when the module `id` should be scanned for css() calls. */
export const isCssSource = (source: string, matchers: Array<string | RegExp>): boolean => {
	const basename =
		source
			.split("/")
			.pop()
			?.replace(/\.[jt]sx?$/, "") ?? source;
	return matchers.some((matcher) =>
		typeof matcher === "string" ? basename === matcher || source === matcher : matcher.test(source),
	);
};

/**
 * Collect local bindings imported from css modules. A binding is considered
 * a css function when it's imported (named or default) as `css` from a
 * matching source — e.g. `import { css } from "./design"` or
 * `import css from "./css"`.
 */
export function findCssImports(
	code: string,
	id: string,
	matchers: Array<string | RegExp>,
): Set<string> {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const names = new Set<string>();

	walk(result.program, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = (node as ImportNode).source?.value;
		if (typeof source !== "string" || !isCssSource(source, matchers)) return;
		for (const specifier of (node as ImportNode).specifiers ?? []) {
			if (specifier.type === "ImportSpecifier") {
				const imported = specifier.imported?.name;
				const local = specifier.local?.name;
				if (imported === "css" && typeof local === "string") {
					names.add(local);
				}
			} else if (specifier.type === "ImportDefaultSpecifier") {
				const local = specifier.local?.name;
				if (typeof local === "string") names.add(local);
			}
		}
	});

	return names;
}

const isMemberCall = (callee: OxcNode | null, cssNames: ReadonlySet<string>): boolean => {
	if (callee?.type !== "MemberExpression") return false;
	const object = (callee as { object?: OxcNode | null }).object;
	if (object?.type !== "Identifier") return false;
	const property = (callee as { property?: OxcNode | null }).property;
	const member = (property as { name?: string } | null)?.name;
	return (
		cssNames.has((object as { name?: string }).name ?? "") &&
		(member === "class" || member === "raw")
	);
};

/**
 * Resolve every literal css() call in `code` to its final style object.
 * Non-literal arguments (variables, spreads, `$input` blocks with dynamic
 * values) are skipped — they need runtime styles, exactly like dynamic class
 * names in plain Tailwind.
 */
export function extractCssStyles(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
	preset: CssPreset,
): Array<StyleObject> {
	if (cssNames.size === 0) return [];

	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const styles: Array<StyleObject> = [];

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;
		if (callee?.type !== "Identifier" && callee?.type !== "MemberExpression") {
			return;
		}

		const isDirect = callee.type === "Identifier" && cssNames.has(callee.name as string);
		const isMember = callee.type === "MemberExpression" && isMemberCall(callee, cssNames);
		if (!isDirect && !isMember) return;
		if (call.arguments.length === 0) return;

		for (const argument of call.arguments) {
			const literal = evalLiteral(argument as Expression);
			if (typeof literal !== "object" || literal === null) continue;
			styles.push(resolveDesignStyle(literal as Record<string, unknown>, preset.tokens));
		}
	});

	return styles;
}
