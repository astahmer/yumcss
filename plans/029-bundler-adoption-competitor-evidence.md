# Bundler, adoption, and competitor evidence

**Status: complete**

## Goal

Increase confidence in Pandwind's current architecture without expanding the
styling API: prove another generic bundler adapter, make the recommended
consumer path easy to exercise, and maintain a source-linked comparison of
the tradeoffs that matter for Pandwind.

## Scope

- Add a real Webpack adapter smoke test alongside the Vite and Rollup proof.
- Keep authored CSS host-owned and external CVA composition visible in the
  adoption documentation.
- Refresh the competitor comparison using primary project documentation.
- Keep `definePreset.web` out of this plan; recipes and release/publish gates
  are tracked by the pivot completion plan.

## Acceptance

- Webpack runs a real build through `pandwindWebpack` and proves static folding.
- The adoption guide explains the proven Vite/Rollup/Webpack boundary and the
  external-CVA pattern.
- The comparison identifies where Pandwind differs from StyleX, Panda,
  Emotion, Linaria, and vanilla-extract, with links to their official docs.
- Tests, docs, formatting, and JJ state are clean apart from pre-existing
  repository-wide lint warnings.

## Outcome

- Webpack production-build smoke test landed in
  `packages/pandwind/tests/unplugin-webpack.test.ts`.
- Webpack CSS virtual-module and watch-rebuild coverage, browser-level Vite
  HMR coverage, and a packed-package Vite consumer proof now cover the main
  shipped integration boundaries.
- Analyzer JSON snapshots now lock the authored-CSS, provenance, and
  actionable-diagnostics contract end to end.
- Adoption docs now state the Vite/Rollup/Webpack evidence boundary and keep
  authored CSS host-owned and CVA external.
- Competitor anchors now link to current official documentation for StyleX,
  Panda, Emotion, Linaria, and vanilla-extract.
- `definePreset.web` remains explicitly out of scope; recipe and release gates
  are now covered by the completion wave.
