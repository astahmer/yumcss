# Plan 014 — Next-wave designs (var-inline, per-page split, multi-theme, debug)

Decisions and design sketches agreed 2026-08-23. Nothing here is built yet.

## 1. Var-inline strategy (APPROVED — spike first)

**Goal:** delete the last reason to ship the css runtime: truly dynamic
values compile to `{ class, style }` pairs + a static toggle-rule sheet
instead of falling back to runtime css() (user-framed as "swap the engine
for a minimal alternative" — the minimal alternative is NO engine).

**Shape:**

- New entry `css.vars({ color: $c })` returning `{ class, style }` — separate
  from `css()` so return types stay clean. Dynamic values are `$identifier`
  marked; keys stay fully typed.
- Sheet: one toggle rule per property×condition actually used:
  `.pw-color { color: var(--pw-c-color); }`
  `.pw-hover\:color:hover { color: var(--pw-c-color_hover, var(--pw-c-color)); }`
  Fallback chains make variants optional at the call site.
- cx() gains an input variant threading style objects; conflict merging is
  nearly free — signatureFromCssKey works off the flattened KEY, not values.
- Size: replaces 2.35KB-min css runtime with a ~200–400 byte stub for apps
  whose only dynamic usage is vars.

**Scope freeze:** dynamic VALUES only (no dynamic property sets/keys).
**Spike checklist before building:** condition encodings verified against
real Tailwind compilation (house standard), cx threading type design,
vite-pass detection rules, sheet-growth bounds on a real corpus.

## 2. Per-page CSS splitting (APPROVED — opt-in, NOT default)

**Default stays one global virtual module**: correctness first (cross-route
class sharing is invisible at build time), Tailwind-parity mental model, no
config surface. Splitting becomes an opt-in when apps need an initial-CSS
diet.

**Sketch:** `pandwindCssVite(preset, { splitByRoute: ["src/routes/**"] })` —
collect pass tags each atom/candidate with the route files that use it;
shared atoms go to a common chunk, route-only atoms to per-route virtual
modules (`pandwind:css?route=foo`) wired via a small runtime manifest.
Tailwind-side candidates keep using the safelist (Tailwind emits per-page CSS
naturally when each page imports its own entry). Needs a real-app measurement
before committing.

## 3. Multi-theme architecture (PLANNING DOC FIRST — no code)

Problem space: theme switching (light/dark/custom brands) across three
layers — raw tokens, semantic tokens (`$surface`), component tokens.
Direction to evaluate in the doc:

- var-swapping layers (CSS custom properties re-bound under `[data-theme]`,
  `.dark`, media queries) vs re-generated sheets per theme;
- which tier owns conditions (semantic layer) so components never branch;
- interplay with the DTCG → @theme bridge and with var-inline's fallback
  chains (they solve adjacent problems — unify or explicitly don't);
- size accounting: per-theme delta vs duplicated full sheets.
  Deliverable: `plans/015-theming.md` with a decision, then implement behind
  the preset API without new user-facing surface (per AGENTS.md policy).

## 4. Dev debug annotations (APPROVED — small)

Dev-build only (`pandwindVite({ debug: true })`): emitted rules carry
`data-pw-origin="<file>:<line>"` (or a comment in the generated stylesheet),
and dev overlay helper lists the origin of classes under the cursor. Steal:
panda debug / stylex devtools. No prod cost — flag off by default, zero code
in the shipped path.

## 1a. Spike RESULTS (2026-08-23) — encoding VERIFIED

`tests/var-inline-spike.test.ts` proves against the real compiler:

- base atom `.pw-color { color: var(--pw-c-color) }` compiles;
- hover variant compiles WITH the fallback chain
  (`var(--pw-c-color_hover, var(--pw-c-color))`);
- values never appear in emitted CSS (inline-delivery only, zero injection);
- coexisting classes keep per-selector rules (cx last-wins maps onto source
  order as today).

Green light for implementation per the §1 shape. Remaining pre-build items:
cx threading type design + vite-pass detection rules + sheet-growth bounds.

## 1b. IMPLEMENTATION OUTCOMES (2026-08-23) — var-inline landed

All layers shipped in one revision:

**Runtime encoding (`src/css/vars.ts` + `create-css.ts`)**

- `css.vars({ color, _hover: { color } })` → `{ class, style }`. Class names
  deterministic from the flattened key only (no preset needed at runtime):
  conditions stripped of `_`, sorted alphabetically, joined with `:`;
  property dashCased. `pw-color`, `pw-hover:color`, `pw-dark:hover:color`.
- Custom properties: base `--pw-c-<prop>`; override per path
  `--pw-c-<prop>_<cond_sorted_joined>`. Values ride the returned style
  object; nothing enters CSS.
- Design layer (`createDesignCss(...).vars`) resolves `$tokens` first so
  inline values are concrete.

**cx threading (`src/cx/index.ts`)**

- `CxInput` accepts vars carriers (recognized via the `VARS_ATOMS` symbol —
  plain objects are never mistaken for carriers).
- Plain `cx()` keeps its STRING return type; carrier styles are dropped by
  design. New `cx.vars(...)` companion merges classes exactly like cx AND
  merges inline styles last-wins per custom property.
- Conflict merging is key-derived: each carrier atom pushes signatures via
  the existing `signatureFromCssKey`, so `pw-color` vs `pw-hover:color`
  coexist (different variant prefixes) while same-scope duplicates collapse
  last-wins — twMerge parity for variants, free of charge.

**Sheet generation (`create-stylesheet.ts`)**

- `processVarKey(flatKey)` + `gen.varRules()`: one toggle rule per flattened
  key, declaration = fallback chain across all PREFIXES of the condition
  path (most specific first, base last). Missing links fall through, so full
  chains emit regardless of which values an element sets inline. Rules reuse
  decodeAtomicPath + genCSSRule (preset conditions resolve identically to
  atoms); deduped + priority-ordered like atomic rules.

**Vite pass (`vite/css-extract.ts` + `css-core.ts`)**

- `extractVarKeys`: structural walker over literal `css.vars({...})` args —
  collects keys even when VALUES are dynamic identifiers; spreads skip their
  subtree. Feeds `processVarKey`; `pandwind:css` serves tokens+atomic+varRules.

**Tests** (`tests/css-vars.test.ts`, 16 cases): encoding unit, cx/cx.vars
differential (string-return preservation, style drop vs carry, last-wins,
variant coexistence), sheet rules incl. `_dark` parent-selector resolution +
dedup, real-Tailwind end-to-end proof (generator output compiles; values
absent from sheet; inline-style composition), vite key collection.

**Size cost** (approved budget raise): css entry 2406→3199 min / 1157→1513 gz
(+793/+356); cx entry 7512→8650 / 3711 (+1138/+602 — merge-core extraction +
carrier handling). Budgets now css 3400/1650, cx 9000/3900, all 11000/4900.

**Known limitations / decisions:**

- Condition fallback PRECEDENCE inside a chain is alphabetical (canonical),
  not specificity-based; cross-condition conflicts resolve by cascade since
  every condition owns its own scoped rule.
- Tailwind-adapter mode: `pw-*` classes are unknown to Tailwind's scanner;
  var-inline targets sheet-backed modes (documented here, no code guard).
- `cx.vars` skips the whole-input result cache (styles must be re-collected);
  perf impact nil for realistic use (carriers are rare per call).

## 2a. Per-route splitting Outcomes (implemented 2026-08-23)

`splitByRoute: [{ match: RegExp, name: string }]` on `pandwindCssVite`
(first-match wins per file; unmatched files are common). Mechanics:

- `createStylesheet.gen` gained `atomicEntries()` / `varEntries()`
  (rule identity = the internal dedupe key, plus priority) so route buckets
  can be diffed without parsing emitted CSS.
- `collectSplit()` builds one bucket sheet per route (+ common bucket),
  intersects rule ids: rules produced by >=2 ROUTE buckets are shared ->
  common chunk; common-bucket rules and preset tokens always common.
  Ids are namespaced by kind ("a:"/"v:") before intersection.
- Virtual modules: base `pandwind:css` serves the common chunk;
  `pandwind:css?route=<name>` serves exclusives;
  `pandwind:css-manifest` is a JS module exporting
  `routeSheets: Record<name, id>` for app wiring.
- HMR unchanged: `handleHotUpdate` -> invalidate -> next load re-scans.

Tests (`tests/css-split-by-route.test.ts`): two routes sharing one atom +
one unmatched file; base keeps shared+unmatched only; chunks carry
exclusives; manifest maps both routes; unknown route resolves null/empty;
HMR invalidation refreshes the owning chunk. All pre-existing vite/css
tests stay green (option off = byte-identical behavior).

## 4a. Devtools extension — research verdict (2026-08-23)

Full brief in `/research.md` (knowledge-based, unverified-flagged). Verdict:
**do NOT build a custom extension yet.** Generic extensions resolve hashed
atomic classes' declarations but can never show source-file origin without
our manifest; built-in DevTools covers ~90% of computed/matched-rule needs.
Before any build decision: run the 15-min empirical checklist
(research.md §"How to verify empirically") and spike the zero-code path —
emitting `/*# sourceMappingURL= */` with .tsx sources in dev builds, which
Chromium's Styles pane may surface natively.

## 4b. Studio overhaul + panda-cloud feature mining (2026-08-24)

User feedback: studio looked basic; default must be the design-system
showcase; stats page added; polish required (it showcases a CSS lib).

Landed in apps/inspector:

- **Design system tab (default)**: color swatch grids from preset groups +
  semantic tokens (dual base/_dark swatches for condition-bound tokens,
  click-to-copy), resolution chains ($surface ← $green-500 ← #60A3BC),
  typography previews rendered at real size (font sizes/weights/families/
  line-heights/tracking), proportional spacing bars, radii boxes,
  categorized @theme vars, typed unions table.
- **Stats tab**: fold-coverage cards, css budget bars by prefix, sortable +
  filterable per-file table, missing-css/runtime site lists.
- Polish: dark-first theme, accent from the example palette, sticky header,
  hover/loading/error/empty states designed; zero console errors verified
  via Playwright against the live dev server.

**panda-cloud mining verdict**: ADOPTED — overview-dashboard layout pattern
(stat cards + drilldown tables) and the token-analyzer's per-file coverage
concept (already covered by our fold-coverage per-file table; a literal-vs-
token COVERAGE % like panda's would need source-level style accounting we
don't track yet — noted as future analyze work, not faked). REJECTED —
snapshot import/diff flows and tRPC server stack (out of scope for a
read-only local tool over existing artifacts).

## 4b. Studio export — residual note (2026-08-24)

Landed: Design-system tab export bar (tokens as DTCG JSON, @theme vars as
:root css, utility unions JSON) with tested serializers in
`apps/inspector/src/lib/export.ts` (8 tests incl. DTCG typing, round-trip,
download plumbing).
Residual: Stats-tab export buttons (coverage JSON + Markdown report) —
serializers already exist (`coverageToJson`, `coverageToMarkdown`), only the
UI wiring in `StatsView` remains; plus CSV format if wanted.

## 2a. Critical-CSS extraction (implemented 2026-08-24)

"Critical" here = per-route stylesheet chunk inlined into the matching HTML
entry's <head> at BUILD time, so first paint needs zero stylesheet requests.
Builds on splitByRoute: a route's critical payload = COMMON chunk (shared
atoms + tokens — dedup means route chunks exclude them) + that route's
exclusive chunk.

Mechanism:

- `splitByRoute` entries gain an optional `html` path (relative to root).
- New opt-in option `inlineCritical: true | { capBytes?: number }`
  (default cap 64 KB per route).
- At `closeBundle` (builds only): for each route with `html`, read the
  written HTML file, skip if already tagged (`data-pw-critical`) or if the
  combined payload exceeds the cap (leave an HTML comment explaining), else
  insert `<style data-pw-critical="<route>">common+route</style>` right
  after `<head>`. Pure logic lives in src/vite/critical-css.ts
  (renderCriticalHtml) so it is unit-testable without vite.

Caveats (documented, honest):

- If the app ALSO <link>s the same sheet, rules are duplicated (harmless
  visually, costs bytes) — inline-critical consumers should drop the link
  for fully-covered routes.
- Dev mode is untouched: dev keeps the virtual-module flow; injection is
  build-only by design (HMR would fight the rewritten files).

## 5. pandwind.agents.json — schema design (planned emission)

Opt-in flag `--agents` on tw:codegen emits a versioned machine-readable capability file next to types.d.ts:

    { "schema": "pandwind.agents/1",
      "utilities": { "<key>": { "values": [...capped literal unions + "valueCount"], "arbitrary": bool, "variants": [...] } },
      "semanticTokens": { "<name>": "<resolved value chain>" },
      "themeScopes": ["[data-theme=dark]", ...],
      "conflictsSummary": { "<key>": ["<property family>", ...] },
      "compose": [...],
      "workflows": { "verifyTypes": "pnpm typecheck", "verifyCoverage": "pnpm analyze --json", "missingCssGate": "analyze totalMissingCss === 0" },
      "constraints": "API frozen; unknown classes kept-but-unstyled; wrong utility = type error; skip-loudly policy",
      "artifactMap": { "types.d.ts": "unions", "tw.ts": "runtime config", "bridge.ts": "css->utility mapping", "pandwind-theme.css": "theme vars" } }

Positioning vs design.md/impeccable/astryx: those are static conventions that can drift from the build; this file is DERIVED from the compiled design system each codegen run (provably true), includes only what exists, and ships verification commands so agent output is checkable. Emission point: generate-types.ts main flow after generateDesignSystem, reusing types/variants/conflicts/compose already in scope.
