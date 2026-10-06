/**
 * Root lane — deliberately narrow.
 *
 * The root export exposes ONLY the recommended lane: `tw` + `cx` (+ their
 * supporting types). Every other surface is reachable ONLY through its
 * subpath, so picking an API lane is a visible, deliberate import decision:
 *
 * - `yumcss`          -> tw() + cx() (this file)
 * - `yumcss/css`      -> engine css(): atomic CSS-in-JS (`createCss`)
 * - `yumcss/design`   -> design css(): $frame/$layout/$text vocabulary (`createDesignCss`)
 * - `yumcss/preset`   -> define.* preset builders
 * - `yumcss/tw/collect`, `yumcss/vite`,
 *   `yumcss/react-native`, `yumcss/opentui`, ...
 *
 * Do NOT add css/preset re-exports back here — the overwhelm guard is the
 * point (see AGENTS.md API-surface policy).
 */
export * from "./tw/index.ts";
export * from "./cx/index.ts";
