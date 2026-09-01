// Generated from the workspace-linked pandwind package. Do not edit.
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
export declare function themeVariables(root: Root): Map<string, string>;
type VarResolver = (name: string) => string | undefined;
/**
 * Resolve `var(--x)` chains against a theme, honoring fallbacks. Accepts
 * either a `Map` (from `themeVariables`) or any resolver function — the
 * bridge uses the design system's own `resolveThemeValue`.
 */
export declare function resolveVar(value: string, vars: Map<string, string> | VarResolver): string;
/**
 * Fold the simple calc shapes Tailwind emits for theme-scaled values:
 * `calc(var(--spacing) * 4)` -> `1rem` after var resolution. Anything else
 * passes through untouched — matching is best-effort, never lossy.
 */
export declare function simplifyCalc(value: string): string;
export {};
