/**
 * Theme-variable helpers for Tailwind-parity work.
 *
 * Tailwind v4 emits `var(--color-blue-500)`-style values that resolve
 * against the `:root`/`:host` theme block. These helpers resolve those
 * chains (with fallbacks) so pandwind can compare — and bridge to — the
 * exact values Tailwind's compiled CSS uses. Shared by the bridge generator
 * and the parity tests so both use the identical oracle.
 */
import type { Root } from "postcss";

/** Custom-property values from `:root` (Tailwind's theme block). */
export function themeVariables(root: Root): Map<string, string> {
	const vars = new Map<string, string>();
	root.walkRules((rule) => {
		if (!rule.selector.includes(":root")) return;
		rule.walkDecls((decl) => {
			if (decl.prop.startsWith("--")) vars.set(decl.prop, decl.value);
		});
	});
	return vars;
}

type VarResolver = (name: string) => string | undefined;

/**
 * Resolve `var(--x)` chains against a theme, honoring fallbacks. Accepts
 * either a `Map` (from `themeVariables`) or any resolver function — the
 * bridge uses the design system's own `resolveThemeValue`.
 */
export function resolveVar(value: string, vars: Map<string, string> | VarResolver): string {
	const resolve: VarResolver = typeof vars === "function" ? vars : (name) => vars.get(name);
	return value.replace(/var\((--[a-zA-Z0-9-]+)(?:,\s*([^)]*))?\)/g, (_match, name, fallback) => {
		const resolved = resolve(name);
		if (resolved === undefined) return fallback?.trim() ?? "";
		return resolveVar(resolved, vars);
	});
}

const LENGTH_UNIT = /^([+-]?(?:\d+|\d*\.\d+))(rem|px|em|%)$/;

const numeric = (side: string): number | null => {
	const parsed = Number(side);
	return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Fold the simple calc shapes Tailwind emits for theme-scaled values:
 * `calc(var(--spacing) * 4)` -> `1rem` after var resolution. Anything else
 * passes through untouched — matching is best-effort, never lossy.
 */
export function simplifyCalc(value: string): string {
	const match = value.match(/^calc\(\s*([^)]*?)\s*\*\s*([^)]*?)\s*\)$/);
	if (match === null) return value;
	const left = match[1]!;
	const right = match[2]!;
	const a = left.trim().match(LENGTH_UNIT);
	const b = right.trim().match(LENGTH_UNIT);
	if (a !== null && b !== null && a[2] === b[2]) {
		const product = Number(a[1]!) * Number(b[1]!);
		return `${product}${a[2]}`;
	}
	const aNum = numeric(left.trim());
	const bNum = numeric(right.trim());
	if (aNum !== null && b !== null) return `${aNum * Number(b[1]!)}${b[2]}`;
	if (a !== null && bNum !== null) return `${Number(a[1]!) * bNum}${a[2]}`;
	return value;
}
