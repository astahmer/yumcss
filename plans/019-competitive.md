# Plan 019 — Competitive feature comparison (2026-08-24)

Sources: known landscape (npm-checked where noted) + the user's GitHub stars
(API pull, 2026-08-24). Popularity signals are point-in-time stars.

## Feature matrix

| capability                                      | yumcss                                 | tailwind v4             | panda-css           | stylex                    | unocss             | vanilla-extract        | next-yak        | tokenami        | master-css       |
| ----------------------------------------------- | -------------------------------------- | ----------------------- | ------------------- | ------------------------- | ------------------ | ---------------------- | --------------- | --------------- | ---------------- |
| zero-runtime utilities                          | ✅                                     | ✅ (engine)             | ✅                  | ✅                        | ✅                 | ✅                     | ✅              | ✅              | ⚠️ hybrid        |
| typed utility unions (tsc errors on typos)      | ✅ generated                           | ❌                      | ⚠️ ts types         | ❌                        | ❌                 | ❌ (TS but not unions) | ❌              | ❌              | ❌               |
| conflict merging (last-wins, twMerge-semantics) | ✅ generated map                       | ❌ (needs tw-merge ext) | ⚠️ priority system  | ⚠️ atomic collision rules | ❌                 | ❌                     | ❌              | ⚠️ vars compose | ⚠️ smart pairing |
| atomic `css()` w/ DTCG tokens                   | ✅                                     | ❌ (@theme only)        | ✅                  | ✅                        | ⚠️ rules engine    | ⚠️ themes              | ⚠️ literals     | ✅ vars         | ✅               |
| condition-bound semantic tokens                 | ✅ (+ theme scopes 015)                | ⚠️ manual vars          | ✅ semanticTokens   | ✅ vars                   | ❌                 | ✅ contracts           | ❌              | ✅ core idea    | ⚠️               |
| compile-time folding w/ coverage analytics      | ✅ analyze CLI                         | n/a                     | ❌                  | n/a (always static)       | ❌                 | n/a                    | ⚠️ partial fold | n/a             | ❌               |
| missing-css / dead-candidate detection          | ✅                                     | ❌                      | ⚠️ plugin           | ⚠️ eslint                 | ❌                 | ❌                     | ❌              | ❌              | ❌               |
| emitted-CSS budget reporting                    | ✅ (--css)                             | ❌                      | ❌                  | ❌                        | ⚠️ inspector sizes | ❌                     | ❌              | ❌              | ⚠️               |
| codemods FROM other libs                        | ✅ styled/stylex/panda/raw-tw          | ❌                      | ✅ styled2panda     | ⚠️ mod-codemods           | ❌                 | ❌                     | ❌              | ❌              | ❌               |
| inspector/dashboard                             | ✅ studio (new)                        | ❌                      | ✅ studio           | ⚠️ devtools ext           | ✅ inspector       | ❌                     | ❌              | ❌              | ✅               |
| dynamic values story                            | ✅ var-inline (new)                    | ⚠️ arbitrary only       | ✅ runtime css      | ❌ strict-static          | ❌                 | ❌                     | ❌              | ✅ native       | ✅ runtime       |
| bundler breadth                                 | ⚠️ vite/unplugin                       | ✅ everywhere           | ✅ postcss+unplugin | ✅ babel/swc plugins      | ✅ many            | ✅ many                | ⚠️ vite/webpack | ✅ unplugin     | ✅               |
| framework breadth                               | ⚠️ React today (Stack: agnostic-ready) | ✅ html-any             | ✅ jsx factories    | ⚠️ react-first            | ✅ any             | ✅ any                 | ⚠️ react        | ✅ any          | ✅               |
| proofs-not-assumes test culture                 | ✅ differential suites                 | n/a                     | ⚠️                  | ⚠️                        | ⚠️                 | ⚠️                     | ⚠️ snapshot     | ⚠️              | ⚠️               |

Legend: ✅ first-class · ⚠️ partial/different shape · ❌ absent · n/a not applicable to model.

## What we did not have in the 2026-08-24 snapshot (historical)

The following list is retained as research context. The current implementation
status and shipped evidence are tracked in the reference docs, not this point-
in-time competitive snapshot.

1. **Ecosystem gravity**: no preset/plugin marketplace, no docs site, no
   community templates. Tailwind/Uno win on this alone today.
2. **Bundler/framework breadth**: vite + unplugin covers most modern setups,
   but no documented webpack/Next/Astro recipes; React-only examples.
3. **Editor experience**: tsserver types give autocomplete inside object
   calls, but there's no IntelliSense extension for class STRINGS, and no
   hover docs for utilities.
4. **Recipes/composition API**: deliberate rejection of a generic API — keep
   saying no until a real consumer asks twice.
5. **Critical CSS / route-chunks beyond splitByRoute** (designed, unbuilt).
6. **RSC guidance**: server-components compatibility is likely fine
   (zero-runtime, string outputs) but undocumented and unproven.
7. **Dynamic values at scale**: var-inline shipped this wave; zero real-app
   validation yet.

## What we could/should build (ranked)

1. **Publish + minimal docs site** (S/M): every capability above is invisible
   without distribution. Changesets + npm provenance + pkg.pr.new previews;
   README is 80% of a docs page already.
2. **`data-[...]` variant support in codemods** (S): the top residual keep
   from the kumo port; escape-hatch mapping instead of verbatim keeps.
3. **Agent-readiness as a positioning pillar** (M, differentiator): the stars
   show where the ecosystem is going — `design.md` spec (27.5k★),
   `impeccable` (62k★), Meta's `astryx` ("agent ready" design system, 12k★).
   YumCSS's frozen typed API + generated artifacts are _already_ the safest
   surface for AI authors: wrong classes are type errors, `analyze` verifies
   fold coverage, missing-css flags hallucinations. Emit a machine-readable
   capability/context file alongside codegen (`yumcss.agents.json`) and
   document the workflow. Nobody else can prove their output like this.
4. **Critical-CSS extraction** (M/L): completes the perf story started by
   splitByRoute.
5. **Solid/Svelte adapter probe** (M): solid-ui's 1.5k★ in the user's own
   stars signals appetite; Stack is already renderer-agnostic.
6. **Watch mode** (S): `tw:codegen/scan/prune` re-run on change.

## Stars-sourced notes (relevant repos from github.com/astahmer?tab=stars)

- `cloudflare/kumo` (3.4k★) — ported ✅ (1:1 CSS parity).
- `facebook/astryx` (12.3k★) — "design system, fully customizable, agent
  ready": validates the agent-positioning bet (#3).
- `google-labs-code/design.md` (27.5k★) / `pbakaus/impeccable` (62k★) —
  design-context formats for coding agents; yumcss could EMIT one from the
  preset (tokens + unions + constraints) — cheaper than building an LLM
  integration and immediately useful.
- `open-pencil/twirlwind` — Tailwind-v4-first CSS→utility serializer: the
  INVERSE of our raw-tailwind codemod; useful reference for round-trip
  fidelity edge cases.
- `sergioazoc/oxlint-tailwindcss` (70★) — prior art adjacent to our
  extraction-discipline oxlint plugin.
- `stefan-karger/solid-ui` (1.5k★) — demand signal for the Solid adapter.
- `vunguyentuan/vscode-css-variables` (196★) — autocomplete approach worth
  studying if/when we do an editor extension.

## Studio/inspector/CLI landscape — DEEP SCAN (2026-08-24, supersedes the first-pass below)

Scope: tools that compete with `apps/inspector` (web studio) AND the
`analyze` CLI/analyzer lane. Method: GitHub stars crawl of
github.com/astahmer?tab=stars (30 repos, 2 pages, no pagination beyond),
npm registry metadata (version + last publish), live docs where reachable.

### Web UIs / inspectors

| tool                                   | OSS/paid               | what it shows                                                  | standout feature worth stealing                                             | maintenance signal   | relevance                                                      |
| -------------------------------------- | ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------- |
| unocss inspector (in unocss 66.8.1)    | OSS                    | per-class matched rules, module graph, REPL, per-utility sizes | click a utility -> every rule + generated CSS inline (per-class drill-down) | very active (weekly) | **HIGH** — the interaction pattern our Design-system tab lacks |
| panda studio (@pandacss/studio 1.12.0) | OSS                    | token/recipe/pattern explorer from config+artifacts            | rendered component previews per token                                       | active               | **MED** — preview quality bar; we do analytics they don't      |
| storybook controls/docs (90.9k★)       | OSS                    | real rendered components w/ prop controls                      | live previews beat metadata tables                                          | very active          | MED/L — iframe example-app demos into studio                   |
| master-css inspector                   | hybrid                 | runtime DOM style application stats                            | live-app observation                                                        | active               | LOW — runtime model differs                                    |
| Backlight.dev                          | paid (SHUT DOWN ~2023) | in-browser component IDE                                       | cautionary: standalone studios need to ride existing dev servers            | dead                 | lesson only                                                    |

### CLI analyzers / CSS stats

| tool                                    | OSS/paid                  | what it analyzes                                                       | standout feature                                          | maintenance signal | relevance                                                                                                          |
| --------------------------------------- | ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| wallace-cli 4.0.3 / projectwallace      | OSS core, hosted app paid | full CSS-shape analytics (specificity, complexity, decl distributions) | chart-heavy shareable reports                             | active (2026-08)   | **HIGH** — @projectwallace/css-parser (active, "optimized for CSS inspection") could power richer Stats-tab charts |
| analyze-css 2.4.48                      | OSS                       | selector complexity + performance-oriented metrics                     | perf-focused metric set (selectors per rule, duplication) | active (2026-08)   | **MED** — borrow metric taxonomy for --css lane                                                                    |
| stylelint 17.x (+ statistics formatter) | OSS                       | lint + aggregate stats via formatter                                   | convention enforcement at scale                           | very active        | MED — our oxlint plugin covers the yumcss-specific half                                                            |
| size-limit 13.x                         | OSS                       | size budgets with CI annotations                                       | FAILS CI on budget breach + posts PR comments             | very active        | **HIGH** — adopt its PR-comment pattern for our size/css gates                                                     |
| css-audit 0.0.1                         | OSS                       | syntax-tree audit                                                      | —                                                         | dead (2022)        | none                                                                                                               |

### Devtools extensions

| tool                                             | state                                    | note                                                                        |
| ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| CSS Overview (Chrome built-in, removed/archived) | archived by Chromium                     | was the reference for stylesheet-shape dashboards; gap reopened for tooling |
| VisBug 0.1.14                                    | stale (2022 npm; extension still usable) | design-manipulation overlay, not analysis                                   |
| Atomic CSS Devtools                              | evaluated separately (research.md)       | pending empirical checklist                                                 |

### Stars-sourced additions (astahmer?tab=stars, 30 repos crawled)

CSS/token-relevant finds are thin: cloudflare/kumo (ported ✅),
neobrutalism/neobrutalism (CSS style reference for demo pages),
pqoqubbw/icons + heroicons-animated (icon-set candidates for studio UI).
No inspector/analyzer tooling in stars — honest negative.

### Feature gaps THEY have that our studio lacks (updated)

1. Per-class rule drill-down (unocss) — still the #1 gap.
2. Live rendered component previews (storybook) — vs our metadata tables.
3. Shareable/static report export as HTML file (wallace-style self-contained report).
4. CI annotations on PRs (size-limit pattern) — our PR bot posts tables but not line annotations.
5. CSS-shape charts (specificity/complexity distributions) via @projectwallace/css-parser.
6. History persistence: diff-between-runs over time (nobody does this well either — opportunity).

### Ranked build-list (supersedes the earlier ranked list)

1. Per-class drill-down in studio (M) — atomicEntries already exist.
2. Self-contained HTML report export (S) — extend the export button: single-file report with inlined JSON + charts.
3. Size-limit-style CI annotation for size + missing-css gates (S/M).
4. Stats-tab charts via @projectwallace/css-parser (M).
5. Run-history persistence (M/L) — store analyze payloads per commit id, diff view.

---

## Studio/inspector landscape (2026-08-24 scan) — SUPERSEDED by deep scan above

Scope correction to this plan: this section compares DESIGN-SYSTEM
INSPECTOR/STUDIO/explorer tools — what `apps/inspector` actually competes
with — not general CSS-in-JS engines (table above). Popularity/activity via
GitHub API + npm (2026-08-24).

| tool                                                              | paid/OSS            | what it shows                                               | data source                        | previews                             | analytics                  | integration effort for us                                                          |
| ----------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- | ---------------------------------- | ------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| panda studio (`@pandacss/studio` 1.12.0, active)                  | OSS                 | tokens, recipes, patterns explorer                          | panda config + generated artifacts | good (rendered examples)             | minimal                    | n/a — panda-locked; pattern reference                                              |
| unocss inspector (inside unocss, 18.9k★, very active)             | OSS                 | per-class matched rules, generated CSS, module graph, REPL  | dev-time build graph + built css   | rule-centric, no component previews  | per-utility sizes          | **M** — its per-class drill-down is the pattern to adopt                           |
| master-css inspector (`@master/css`, hybrid OSS/cloud)            | ⚠️ hybrid           | live-app style application stats                            | runtime DOM observation            | live-app                             | sizes/timing               | L — runtime model differs from ours                                                |
| storybook controls/docs (90.9k★, very active)                     | OSS                 | interactive component playgrounds, prop controls, docs      | stories (component code)           | excellent — real rendered components | none                       | **M/L** — requires stories; could iframe example app                               |
| style-dictionary v5 (Amazon, OSS, active)                         | OSS                 | build system only, no UI (minimal playground)               | token config                       | none                                 | none                       | n/a — overlaps our codegen, not the UI                                             |
| cssstats (2.8k★, STALE — last publish 2022)                       | OSS                 | stylesheet stats viz (bytes, decls, complexity)             | parsed CSS file                    | charts                               | CSS-shape only             | dead; our `--css` lane supersedes                                                  |
| wallace-cli / projectwallace (640★ core, active; hosted app paid) | OSS core + paid app | rich CSS analytics reports (specificity, complexity, sizes) | CSS file                           | chart-heavy reports                  | strong CSS-shape analytics | **S/M** — parser (`@projectwallace/css-parser`, active) reusable for our Stats tab |
| Tokens Studio for Figma (1.6k★ plugin, freemium)                  | freemium            | token AUTHORING in Figma, GitHub sync                       | design tool                        | design-side                          | none                       | **S** — DTCG import/export already near-compatible                                 |
| Specify (paid SaaS)                                               | paid                | design-token distribution/governance pipeline               | design+code APIs                   | dashboards                           | governance                 | different category (pipeline, not inspector); watch only                           |
| Supernova.io (paid SaaS)                                          | paid                | design-system docs + token distribution                     | design tools + exports             | docs-grade                           | governance                 | effectively dormant (last npm publish 2024-05)                                     |
| Backlight.dev (paid)                                              | paid                | in-browser component studio                                 | repo                               | full IDE-like                        | none                       | SHUT DOWN (~2023) — cautionary tale for standalone studios                         |

### Features THEY have that our studio lacks (honest)

1. **Per-class rule drill-down**: click a utility → see every rule/matched
   candidate + generated CSS (unocss inspector's core interaction).
2. **Live component previews**: storybook renders REAL components with prop
   controls; ours shows metadata tables only.
3. **CSS-shape analytics charts**: specificity/complexity/declaration
   distributions (wallace, cssstats heritage).
4. **Design-tool sync**: Tokens Studio pushes Figma variables ↔ code;
   Specify distributes tokens to N platforms with governance.
5. **Multi-format distribution**: Specify/Supernova emit iOS/Android/web
   from one source.

### What WE have that none of them can

Generated-from-real-build data (every number derives from the actual
compiled artifact, not config claims) plus analytics none of them attempt:
fold-coverage (build-time merge elimination %), missing-css/dead-candidate
detection, emitted-CSS budget with per-theme deltas — and the verification
commands ship in-band (the agents.json direction).

### Ranked adopt-list for our studio

1. **Per-class rule drill-down** (M, unocss pattern): sheet already has the
   rules; wire atomicEntries → searchable class index → rule panel.
2. **DTCG import dialog** (S, Tokens Studio parity): paste/upload a DTCG JSON
   → feeds analyze/prune/theme-scope flows; parser mostly exists.
3. **CSS-shape charts** (S/M, wallace-style): reuse `@projectwallace/
css-parser` against the compiled sheet for specificity/complexity views.
4. **Component preview panes** (M/L): iframe the example app routes with
   query-selected classes — real rendering without a storybook dependency.

Deliberately not chased: Figma bidirectional sync, multi-platform token
distribution, hosted SaaS — pipeline products, not inspector features.

## Studio v3 residual notes (2026-08-24, reconciled)

- DONE: per-class rule drill-down (analyze `classRules()` + studio Coverage
  panel, Playwright-verifiable).
- DONE: CSS-shape dashboard, history persistence and run diff, self-contained
  HTML export, and `analyze --github-annotations`; these are covered by the
  current inspector/analyzer tests and workflows.
- Remaining competitive ideas are optional product polish or integrations,
  not gaps in the CSS-in-JS pivot boundary. Current evidence and public
  behavior are summarized in `docs/src/content/docs/tooling/workflows.md`.
