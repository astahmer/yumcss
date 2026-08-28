---
title: Why pandwind exists
description: The deliberate non-decisions behind pandwind, and what it refuses to be.
sidebar:
  order: 2
---

The short version of the decisions behind this repo lives in
[TODO.md](https://github.com/astahmer/pandwind/blob/main/TODO.md) under _What
we deliberately don't do (and why)_. The highlights:

- **No mandatory runtime CSS-in-JS** — the build-time `tw()` lane and literal
  extraction can ship only class strings, while the explicit `pandwind/css`
  runtime lane supports dynamic styles, SSR, hydration, and ordered sheets.
- **No mandatory Panda-style PostCSS pipeline** — Tailwind compiles once for
  the utility lane, and the atomic runtime/compiler remains independently
  selectable.
- **No built-in recipe API or config files** — a minimalist styling API you
  can hold in your head; use an external CVA-style package when variant
  selection is useful, and keep browser-global CSS in ordinary CSS files.
- **No hand-maintained tailwind-merge config** — conflict rules are generated
  from the engine, so they can't drift from what Tailwind compiles.
- **No 500-prop CSS API** — the design `css()` surface is ~30 Figma-inspector
  props; everything else lives under `$raw` on purpose.
- **No panda-like runtime bloat by default** — build-time users can tree-shake
  the runtime away, while runtime CSS-in-JS consumers opt into the sheet
  contract explicitly.

The user-facing API is deliberately frozen: `tw()` / `css()` / `cx()` /
`createDesignCss` presets, the `ClassNameStrategy` contract, and the codegen
entry points. Compiler and optimizer work, tooling around the API, and
correctness/perf fixes are always welcome; new user-facing surface needs a
written design note first.
