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
import { createCss } from "../css/create-css.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
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
	start: number;
	end: number;
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
 * `import css from "./css"`. The design-lane naming convention (`dcss`,
 * distinct from engine css() instances) is accepted identically:
 * `import { dcss } from "./design"`.
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
				if ((imported === "css" || imported === "dcss") && typeof local === "string") {
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

/**
 * Collect flattened style keys from `css.vars({ ... })` calls so the build
 * can emit their toggle rules into the sheet. Only the KEY STRUCTURE must
 * be static — VALUES may be arbitrary expressions (they ride inline styles).
 * Spreads make a subtree unknowable and are skipped.
 */
type OxcProp = {
	type?: string;
	key?: { name?: string; value?: string };
	value?: OxcNode;
	argument?: OxcNode;
};

const collectKeysFromObject = (
	node: OxcNode | null | undefined,
	prefix: string,
	out: Set<string>,
): void => {
	if (node?.type !== "ObjectExpression") return;
	for (const prop of (node as { properties?: OxcProp[] }).properties ?? []) {
		if (prop.type === "SpreadElement") continue;
		const rawKey = prop.key?.name ?? prop.key?.value;
		if (typeof rawKey !== "string") continue;
		const fullKey = prefix === "" ? rawKey : `${prefix}__${rawKey}`;
		if (prop.value?.type === "ObjectExpression") {
			collectKeysFromObject(prop.value, fullKey, out);
		} else {
			out.add(fullKey);
		}
	}
};

export function extractVarKeys(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
): Array<string> {
	if (cssNames.size === 0) return [];

	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const keys = new Set<string>();

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;
		if (callee?.type !== "MemberExpression") return;
		const object = (callee as { object?: OxcNode | null }).object;
		if (object?.type !== "Identifier" || !cssNames.has((object as { name?: string }).name ?? "")) {
			return;
		}
		const property = (callee as { property?: { name?: string } | null }).property;
		if ((property?.name ?? "") !== "vars") return;

		for (const argument of call.arguments) {
			collectKeysFromObject(argument as OxcNode, "", keys);
		}
	});

	return [...keys];
}

export interface InlineCssResult {
	code: string;
	inlined: number;
}

/**
 * Tailwind-mode inlining: replace literal `css(...)` / `css.class(...)`
 * calls by their compiled class output (map literal / class string), so
 * Tailwind's own scanner generates the CSS and nothing is paid at runtime.
 * `css.raw(...)`, `css.props(...)`, `css.group(...)` and dynamic calls are
 * left untouched. The emitted classes come from the same `className`
 * strategy the runtime binds, so build-time and runtime output match.
 */
export function inlineCssCalls(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
	preset: CssPreset,
	className: AnyClassNameStrategy,
): InlineCssResult {
	if (cssNames.size === 0) return { code, inlined: 0 };

	const engine = createCss({ className });
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let inlined = 0;

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;

		let kind: "map" | "class" | null = null;
		if (callee?.type === "Identifier" && cssNames.has((callee as { name?: string }).name ?? "")) {
			kind = "map";
		} else if (callee?.type === "MemberExpression" && isMemberCall(callee, cssNames)) {
			const member = (callee as { property?: { name?: string } | null }).property?.name;
			if (member === "class") kind = "class";
		}
		if (kind === null) return;
		if (call.arguments.length === 0) return;

		const styles: Array<Record<string, unknown>> = [];
		for (const argument of call.arguments) {
			const literal = evalLiteral(argument as Expression);
			if (typeof literal !== "object" || literal === null) continue;
			styles.push(resolveDesignStyle(literal as Record<string, unknown>, preset.tokens));
		}
		if (styles.length === 0) return;

		try {
			const compiled =
				kind === "class"
					? engine.class(...(styles as Array<StyleObject>))
					: engine(...(styles as Array<StyleObject>));
			edits.push({ start: call.start, end: call.end, text: JSON.stringify(compiled) });
			inlined++;
		} catch {
			// Leave unrepresentable calls for the runtime (never crash builds).
		}
	});

	if (inlined === 0) return { code, inlined };
	let out = code;
	for (const edit of edits.toReversed()) {
		out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	}
	return { code: out, inlined };
}
