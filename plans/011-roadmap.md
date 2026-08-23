# Plan 011 — Roadmap & idea vault (2026-08-23)

Everything below is captured so ideas survive regardless of scheduling.
Sections marked **[NOW]** have workers assigned in this wave; the rest are
parked with notes.

## [NOW] 1. Docs + dogfooding

- README sections for: condition-bound semantic tokens → @theme bridge,
  cross-module const propagation, `pandwind analyze`.
- Example app dogfoods all of it (semantic tokens, subkeys, mixed cx+css).

## [NOW] 2. `analyze` polish

- `--json` output (machine-readable; the PR bot should consume this instead
  of duplicating logic), corpus integration so `pandwind analyze` reproduces
  the vite-cx-coverage numbers on demand.

## [NOW] 3. Semantic-token parity coverage (007-B follow-through)

- Real-Tailwind compilation proof for condition-bound tokens (dark-mode
  utilities through the actual compiler), same standard as everything else.

## [NOW] 4. Inspiration mining → `plans/012-inspiration-report.md`

- astahmer/pandabox packages/panda-plugins (escape-hatch plugin patterns)
- tokenami (CSS-var-first authoring, no-runtime philosophy)
- stylex (static extraction discipline, atomic collision rules)
- panda-css studio/doctor/debug/mcp (token usage analytics, visual tooling)
- Deliverable: what to steal, mapped onto pandwind's architecture.

## [NOW] 5. Codemod sources expansion

- styled-components / stylex / panda-css → pandwind migration modes
  (literal-only first pass; interpolated styles get flagged not converted).

## [NOW] 6. unplugin adoption

- Port the vite plugins onto `unplugin` so webpack/rollup/esbuild become
  supportable without forking the codebase. API-compatible, tests green.

## Parked — component & app features

- **Erasable props → plain div** (renderer-agnostic React/Solid): stack +
  limited prop set compiled away entirely; see welii ui-kit layout.tsx /
  component-props.ts as the pattern source. Needs a runtime-less primitive
  story per renderer — big design project.
- **Component library** on top of pandwind primitives (prebuilt patterns).
- **Per-page CSS splitting**: page-scoped stylesheet chunks in the vite
  plugins (currently one global virtual module).
- **Dynamic styles / multi-theme**: theme switching via var-swapping layers,
  raw+semantic+component token tiers, tw group+variant combinations — needs a
  theming architecture doc before any code.
- **Other languages**: vue/svelte/astro adapters (core mapping shared,
  template syntax differs); php unlikely but the class-string core is
  language-free by design.
- **"ultra" registry**: shadcn-style design-system registry synced to Figma,
  emitting styled-dictionary/tailwind/panda/chakra/stylex outputs — the DTCG
  pipeline is the seed of this; park until core API stabilizes.
- **"panda-cloud" analytics**: token/utility usage dashboards — `analyze`
  CLI is step one; a hosted/studio UI is step N.
