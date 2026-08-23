# Plan 013 — Kumo dogfood: fork cloudflare/kumo onto pandwind via codemod

## Why

https://kumo-ui.com is Cloudflare's Kumo design system
(`github.com/cloudflare/kumo`) — a real, maintained Tailwind v4 component
library (103 .tsx sources, custom theme layers, base-ui composition). Migrating
it onto pandwind's `tw()` via our raw-tailwind codemod is the best available
dogfood: real-world class strings at scale, not synthetic fixtures.

## Status — dry-run measurement (2026-08-23)

Cloned to `/tmp/pandwind-kumo-dogfood` (shallow). Ran
`pandwind-codemod --to=tw` (dry) over `packages/kumo/src/**/*.{tsx,ts}` using
the example app's generated metadata:

| metric                                               | value   |
| ---------------------------------------------------- | ------- |
| files scanned                                        | 103     |
| files with conversions                               | 54      |
| call sites converted (`cn("a b")` → `cx(tw({...}))`) | **293** |
| tokens left verbatim                                 | 107     |

Verbatim tokens are kumo-specific utilities absent from OUR example metadata
(kumo theme colors like `bg-primary`, semantic scales) — expected: the codemod
is driven by the consuming app's generated `tw.ts`. A real port would run
`tw:codegen` against kumo's own `theme-kumo.css` first, which should convert
most of those too.

Sample quality checks (toast.tsx, radio.tsx, sidebar.tsx): flat utility lists
convert cleanly onto typed `tw({ ... })` keys; template-literal/composed
class strings stay verbatim per contract; no crashes.

## Follow-ups for a full port

1. `tw:codegen` against `packages/kumo/src/styles/theme-kumo.css`; regenerate
   metadata; re-run codemod — expect verbatim count to collapse.
2. `--write` on a branch; typecheck + build kumo with `@tailwindcss/vite`
   swapped for `pandwindVite`/`pandwindCssVite`.
3. Fix the codemod `--diff` renderer's hunk-line off-by-one seen while
   inspecting (cosmetic, reporting only).
4. Stretch: upstream a `pandwind` lane to their docs site build.

## Non-goals

- No changes to kumo itself; the clone stays disposable (`/tmp`).
