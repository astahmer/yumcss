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

## Second target — 8bitcn-ui (2026-08-23)

`github.com/TheOrcDev/8bitcn-ui` cloned to `/tmp/pandwind-8bit-dogfood`
(Next.js + Tailwind v4 retro-UI library). Same dry-run, example metadata:

| metric               | --to=tw  | --to=css  |
| -------------------- | -------- | --------- |
| files scanned        | 238      | 44 (ui/*) |
| files changed        | 182      | 0         |
| call sites converted | **1650** | 0         |
| tokens verbatim      | 891      | 235       |

`--report` output: 1650/1650 sites through pandwind (100%), 891 verbatim
tokens = 8-bit theme specifics (`shadow-[4px_4px_0px]` arbitraries, custom
palette) — same story as kumo: codegen against the TARGET's own theme first.
css-mode is 0 by design there: no css() bindings exist in a raw-Tailwind
codebase yet.

### Proposed API split for the two ports

- **kumo → `tw()` typed layer** (design-system consumers keep the Tailwind
  engine; pandwind adds typing + compile-time folding).
- **8bitcn → full pandwind**: codegen its theme, then migrate hot surfaces
  onto `css()`/`cx()` so the stylesheet generation replaces Tailwind's —
  exercises the css-side pipeline end to end.

## Target-theme codegen result (2026-08-23, later)

Ran `tw:codegen` + `generate-bridge` against Kumo's OWN theme
(`/tmp/kumo-meta`: tailwind.css = tailwindcss import + theme-kumo.css):
414 utilities / 88 variants, ALL `kumo-*` semantic colors
(kumo-brand, kumo-placeholder, kumo-canvas…) present in the generated
unions; bridge wrote 68 properties.

Re-measured codemod with that metadata: **107 → 107 verbatim** — unchanged,
and that is the INFORMATIVE result: the verbatim set was never a metadata
gap. Sampling shows it is entirely by-design conservative keeps:

- arbitrary values (`left-[19px]`, `w-[calc(100%-2rem)]`)
- data-attribute variants (`data-[expanded]:opacity-100`,
  `group-data-[state=collapsed]/sidebar:hidden`) — base-ui state styling
- legacy spellings (`flex-shrink-0`)

Conclusion: the migration blocker list for kumo is EMPTY on metadata. A full
port is now purely mechanical: `--write --meta=/tmp/kumo-meta` on a branch,
swap `@tailwindcss/vite` wiring, run their vitest suite. Remaining codemod
enhancement worth doing first: support `data-[…]` variants via the escape
hatch instead of keeping verbatim.

## Port result (2026-08-23, full --write migration)

Executed on branch `pandwind-migration` of the kumo clone
(/tmp/pandwind-kumo-dogfood): codemod `--to=tw --meta=/tmp/kumo-meta --write`
over packages/kumo/src → 103 files scanned · 54 changed · 293 call sites
converted · 107 tokens kept verbatim (by-design: arbitraries,
data-[...] variants, legacy spellings).

### 1:1 CSS check — VERDICT: 1:1 parity

Method (`packages/analyze/css-parity-kumo.mts`): BEFORE = every string-literal
token from pristine sources; AFTER = tw({...}) calls re-evaluated through the
REAL pandwind runtime (`createTw` with the kumo-generated config) plus
remaining verbatim literals. Both candidate sets (~4.7k each) compiled through
real Tailwind with kumo's theme; diffed as normalized rule sets
(selector+sorted declarations).

Result (shared warm compiler instance): **867 rules before, 867 after,
identical=867, missing=0, extra=0**. Byte delta ≈ 0 (±180 B across runs is a
candidate-order artifact of Tailwind's cold vs warm internal registry — first
build after `compile()` may miss late-registered utilities, so comparisons
must share one compiler instance; noted as methodology).

### Codemod bugs found & fixed during the port

1. **FIXED — `ensureImport` multi-line import corruption** (shared.ts): the
   import-header regex was single-line-aware, so files whose FIRST import was
   multi-line got the pandwind imports injected INSIDE the braces → **27 of
   54 written files failed to parse**. Rewrote as a stateful line scan
   (open-import until specifier-quote terminator). All 41 codemod tests +
   parse-check over the written tree pass (1 pre-existing-broken file
   remains, see #2).
2. **KNOWN ISSUE (unfixed) — classNameMatches ignores string/comment
   context**: the regex converts `className='…'` occurrences inside string
   literals and comments too. Observed damage: a vitest `it("… className=
'contents' …")` test name rewritten to invalid syntax, and a JSDoc example
   converted inside a comment (its classes then vanish from AST-based
   extraction). Fix sketch: linear scan tracking quote/comment state up to
   match index, skip when inside.
