---
title: Why pandwind exists
description: The deliberate non-decisions behind pandwind, and what it refuses to be.
sidebar:
  order: 2
---

The short version of the decisions behind this repo lives in
[TODO.md](https://github.com/astahmer/pandwind/blob/main/TODO.md) under _What
we deliberately don't do (and why)_. The highlights:

- **No chakra/emotion-style runtime CSS-in-JS** — a mini runtime that resolves
  styles at runtime is exactly the perf and caching cost we're avoiding.
- **No panda-style PostCSS pipeline or mini runtime** — Tailwind compiles
  once, statically; `tw()` output is plain class strings.
- **No built-in recipe API or config files** — a minimalist styling API you
  can hold in your head; use an external CVA-style package when variant
  selection is useful, and keep browser-global CSS in ordinary CSS files.
- **No hand-maintained tailwind-merge config** — conflict rules are generated
  from the engine, so they can't drift from what Tailwind compiles.
- **No 500-prop CSS API** — the design `css()` surface is ~30 Figma-inspector
  props; everything else lives under `$raw` on purpose.
- **No panda-like runtime bloat** — the shipped runtime is ~3.7 KB gz for
  css+tw+cx; the stylesheet generator is build-time only.

The user-facing API is deliberately frozen: `tw()` / `css()` / `cx()` /
`createDesignCss` presets, the `ClassNameStrategy` contract, and the codegen
entry points. Compiler and optimizer work, tooling around the API, and
correctness/perf fixes are always welcome; new user-facing surface needs a
written design note first.
