# Plan 019 — Competitive feature comparison (2026-08-24)

Sources: known landscape (npm-checked where noted) + the user's GitHub stars
(API pull, 2026-08-24). Popularity signals are point-in-time stars.

## Feature matrix

| capability                                      | pandwind                               | tailwind v4             | panda-css           | stylex                    | unocss             | vanilla-extract        | next-yak        | tokenami        | master-css       |
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

## What we don't have (honest)

1. **Ecosystem gravity**: no preset/plugin marketplace, no docs site, no
   community templates. Tailwind/Uno win on this alone today.
2. **Bundler/framework breadth**: vite + unplugin covers most modern setups,
   but no documented webpack/Next/Astro recipes; React-only examples.
3. **Editor experience**: tsserver types give autocomplete inside object
   calls, but there's no IntelliSense extension for class STRINGS, and no
   hover docs for utilities.
4. **Recipes/composition API**: deliberate rejection (plans/001) — keep
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
   Pandwind's frozen typed API + generated artifacts are _already_ the safest
   surface for AI authors: wrong classes are type errors, `analyze` verifies
   fold coverage, missing-css flags hallucinations. Emit a machine-readable
   capability/context file alongside codegen (`pandwind.agents.json`) and
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
  design-context formats for coding agents; pandwind could EMIT one from the
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

## Studio/inspector landscape (2026-08-24 scan)

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
