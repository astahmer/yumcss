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
