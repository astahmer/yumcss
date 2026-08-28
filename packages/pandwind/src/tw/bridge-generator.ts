import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { parse } from "postcss";
import type { Rule } from "postcss";
import selectorParser from "postcss-selector-parser";
import { canonicalProps } from "./codegen-conflicts.ts";
import { resolveVar, simplifyCalc } from "./theme.ts";

export type UtilityBridge = Record<string, Record<string, string>>;

/**
 * Default property allowlist: every CSS property the design surface and a
 * typical css() style object can express. Restricting the bridge to these
 * keeps the generated file small (values for unrelated properties like
 * `scroll-snap-*` or `accent-color` are never needed — their declarations
 * fall back to arbitrary property classes, which is always correct).
 */
export const BRIDGE_PROPS = [
	"color",
	"background-color",
	"background",
	"background-image",
	"border-color",
	"border",
	"border-radius",
	"border-width",
	"border-style",
	"border-top",
	"border-right",
	"border-bottom",
	"border-left",
	"border-top-color",
	"border-right-color",
	"border-bottom-color",
	"border-left-color",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
	"border-top-style",
	"border-right-style",
	"border-bottom-style",
	"border-left-style",
	"padding",
	"padding-inline",
	"padding-block",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"margin",
	"margin-inline",
	"margin-block",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"width",
	"height",
	"min-width",
	"max-width",
	"min-height",
	"max-height",
	"display",
	"flex-direction",
	"flex-wrap",
	"justify-content",
	"align-items",
	"align-content",
	"gap",
	"column-gap",
	"row-gap",
	"font-family",
	"font-size",
	"font-weight",
	"line-height",
	"letter-spacing",
	"text-align",
	"text-transform",
	"text-decoration",
	"text-decoration-color",
	"text-decoration-line",
	"text-decoration-style",
	"text-decoration-thickness",
	"overflow",
	"overflow-x",
	"overflow-y",
	"text-overflow",
	"white-space",
	"opacity",
	"z-index",
	"position",
	"inset",
	"top",
	"right",
	"bottom",
	"left",
	"grid-auto-flow",
	"grid-template-columns",
	"grid-template-rows",
	"box-shadow",
	"filter",
	"backdrop-filter",
	"transform",
	"translate",
	"scale",
	"rotate",
	"outline",
	"outline-color",
	"outline-style",
	"outline-width",
	"outline-offset",
] as const;

interface Entry {
	cls: string;
	multi: boolean;
}

/**
 * True when `className` is a direct child of a top-level selector with
 * nothing after it (`.bg-red-500`), excluding pseudo-elements
 * (`.placeholder-current::placeholder`), child targets
 * (`:where(.space-x-4 > :not(...))`) and other wrappers.
 */
function isDirectClassRule(rule: Rule, className: string): boolean {
	let direct = false;
	selectorParser((selectors) => {
		selectors.each((sel) => {
			sel.walkClasses((node) => {
				if (node.value === className && node.parent === sel && node.next() === undefined) {
					direct = true;
				}
			});
		});
	}).processSync(rule.selector);
	return direct;
}

async function generateUtilityBridge(
	entry: string,
	base: string,
	options: { props?: readonly string[]; values?: ReadonlySet<string> } = {},
): Promise<UtilityBridge> {
	const ds = await __unstable__loadDesignSystem(entry, { base });
	const allowlist = new Set(options.props ?? BRIDGE_PROPS);
	const valueFilter = options.values;
	const resolveTheme = (name: string): string | undefined =>
		(ds as unknown as { resolveThemeValue: (n: string) => string | undefined }).resolveThemeValue(
			name,
		);

	const candidates = ds
		.getClassList()
		.map(([className]) => className)
		.filter((className): className is string => className !== undefined);

	const best = new Map<string, Map<string, Entry>>();

	for (let i = 0; i < candidates.length; i += 200) {
		const chunk = candidates.slice(i, i + 200);
		const results = ds.candidatesToCss(chunk);

		chunk.forEach((candidate, index) => {
			const css = results[index];
			if (css === null || css === undefined) return;

			const root = parse(css);
			let direct = false;
			const props = new Set<string>();
			const values = new Map<string, string>();

			root.walkRules((rule) => {
				if (!isDirectClassRule(rule, candidate)) return;
				direct = true;
				rule.walkDecls((decl) => {
					if (decl.prop.startsWith("--")) return;
					props.add(decl.prop);
					if (values.has(decl.prop)) return;
					const themeDerived = decl.value.includes("var(");
					const resolved = simplifyCalc(resolveVar(decl.value, resolveTheme));
					if (resolved === "" || resolved.includes("var(")) return;
					// Literal values (flex, relative, ...) always stay; theme
					// values only when the app's preset can produce them.
					if (themeDerived && valueFilter !== undefined && !valueFilter.has(resolved)) {
						return;
					}
					values.set(decl.prop, resolved);
				});
			});

			if (!direct) return;

			const canon = canonicalProps([...props]).filter((prop) => allowlist.has(prop));
			if (canon.length === 0) return;

			for (const prop of canon) {
				const value = values.get(prop);
				if (value === undefined || value === "") continue;
				const byValue = best.get(prop) ?? new Map<string, Entry>();
				const existing = byValue.get(value);
				const multi = canon.length > 1;
				if (
					existing === undefined ||
					(!multi && existing.multi) ||
					(multi === existing.multi && candidate.length < existing.cls.length)
				) {
					byValue.set(value, { cls: candidate, multi });
				}
				best.set(prop, byValue);
			}
		});
	}

	const bridge: UtilityBridge = {};
	for (const [prop, byValue] of best) {
		const sorted: Record<string, string> = {};
		for (const [value, candidate] of [...byValue.entries()].toSorted(([a], [b]) =>
			a.localeCompare(b, "en"),
		)) {
			sorted[value] = candidate.cls;
		}
		bridge[prop] = sorted;
	}
	return bridge;
}

export class UtilityBridgeGenerator {
	async generate(entry: string, base: string, options: { props?: readonly string[]; values?: ReadonlySet<string> } = {}): Promise<UtilityBridge> {
		return generateUtilityBridge(entry, base, options);
	}
}
