import { parse } from "postcss";
import type { Rule } from "postcss";
import { canonicalProps } from "./codegen-conflicts.ts";
import { loadTailwindDesignSystem } from "./design-system-cache.ts";
import { selectorClassMatches } from "yumcss/css/selector-scan";
import { resolveVar, simplifyCalc } from "yumcss/tw";
import type { UtilityBridge } from "yumcss/tw";

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
	preferred: boolean;
}

/**
 * Keep a source project's authored token spelling when two utilities resolve
 * to the same CSS value. Tailwind's merged design system also contains its
 * defaults, so the official theme object cannot tell us whether `card` was
 * declared by this project. The source CSS can: names declared in a local
 * `@theme` block are the evidence used for this tie breaker.
 */
function authoredThemeTokenNames(css: string): ReadonlySet<string> {
	const names = new Set<string>();
	for (const match of css.matchAll(/--[A-Za-z0-9_-]+-([A-Za-z0-9_-]+)\s*:/gu)) {
		if (match[1] !== undefined) names.add(match[1]);
	}
	return names;
}

function isAuthoredThemeCandidate(candidate: string, names: ReadonlySet<string>): boolean {
	if (names.size === 0 || candidate.includes("[")) return false;
	const utility = candidate.split(":").at(-1) ?? candidate;
	return [...names].some((name) => utility === name || utility.endsWith(`-${name}`));
}

/**
 * True when `className` is a direct child of a top-level selector with
 * nothing after it (`.bg-red-500`), excluding pseudo-elements
 * (`.placeholder-current::placeholder`), child targets
 * (`:where(.space-x-4 > :not(...))`) and other wrappers.
 */
function isDirectClassRule(rule: Rule, className: string): boolean {
	return selectorClassMatches(rule.selector).some(
		(match) => match.value === className && match.topLayer && match.lastInCompound,
	);
}

async function generateUtilityBridge(
	entry: string,
	base: string,
	options: { props?: readonly string[]; values?: ReadonlySet<string> } = {},
): Promise<UtilityBridge> {
	const ds = await loadTailwindDesignSystem(entry, { base });
	const allowlist = new Set(options.props ?? BRIDGE_PROPS);
	const valueFilter = options.values;
	const authoredTokenNames = authoredThemeTokenNames(entry);
	const resolveTheme = (name: string): string | undefined =>
		(ds as { resolveThemeValue: (n: string) => string | undefined }).resolveThemeValue(name);

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

			const canon = canonicalProps([...props]);
			const bridgeProps = new Set([...props, ...canon].filter((prop) => allowlist.has(prop)));
			if (bridgeProps.size === 0) return;

			for (const prop of bridgeProps) {
				const sourceProperty = values.has(prop)
					? prop
					: [...props].find((candidate) => canonicalProps([candidate]).includes(prop));
				const value = sourceProperty === undefined ? undefined : values.get(sourceProperty);
				if (value === undefined || value === "") continue;
				const byValue = best.get(prop) ?? new Map<string, Entry>();
				const existing = byValue.get(value);
				const multi = canon.length > 1;
				const preferred = isAuthoredThemeCandidate(candidate, authoredTokenNames);
				if (
					existing === undefined ||
					(!multi && existing.multi) ||
					(multi === existing.multi &&
						((preferred && !existing.preferred) ||
							(preferred === existing.preferred && candidate.length < existing.cls.length)))
				) {
					byValue.set(value, { cls: candidate, multi, preferred });
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
	async generate(
		entry: string,
		base: string,
		options: { props?: readonly string[]; values?: ReadonlySet<string> } = {},
	): Promise<UtilityBridge> {
		return generateUtilityBridge(entry, base, options);
	}
}
