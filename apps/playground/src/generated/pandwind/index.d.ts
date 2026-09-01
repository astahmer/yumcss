// Generated from the workspace-linked pandwind package. Do not edit.
/**
 * Root lane — deliberately narrow.
 *
 * The root export exposes ONLY the recommended lane: `tw` + `cx` (+ their
 * supporting types). Every other surface is reachable ONLY through its
 * subpath, so picking an API lane is a visible, deliberate import decision:
 *
 * - `pandwind`          -> tw() + cx() (this file)
 * - `pandwind/css`      -> engine css(): atomic CSS-in-JS (`createCss`)
 * - `pandwind/design`   -> design css(): $frame/$layout/$text vocabulary (`createDesignCss`)
 * - `pandwind/preset`   -> definePreset / defineTokens
 * - `pandwind/tw/generate`, `pandwind/codegen/*`, `pandwind/vite`,
 *   `pandwind/react-native`, `pandwind/opentui`, ...
 *
 * Do NOT add css/preset re-exports back here — the overwhelm guard is the
 * point (see AGENTS.md API-surface policy).
 */
export * from "./tw/index.d.ts";
export * from "./cx/index.d.ts";
