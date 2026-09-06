---
title: Current limitations and criticism
description: A candid review of Pandwind's current strengths, weaknesses, and product risks.
sidebar:
  order: 6
---

_Review snapshot: 2026-09-07._

The blunt answer: Pandwind is technically ambitious, but currently tries to be
too many products at once. The core idea is useful; the weakest parts are
adoption simplicity, real-world proof, and scope discipline.

## The criticism people will make

- "Why use Pandwind instead of Tailwind, Panda, StyleX, or vanilla-extract?"
  Pandwind currently combines typed Tailwind objects, atomic CSS-in-JS, design
  system CSS, migration tooling, many adapters, non-web backends, Studio,
  DevTools, Playground, and MCP. The value is clear mainly for teams migrating
  or intentionally mixing styling ecosystems.
- "This is not actually zero-runtime CSS." Dynamic `tw()` values require
  safelisting or runtime handling. Dynamic `css()` values use `css.vars()`.
  Globals, keyframes, fonts, layers, and complex selectors often remain
  authored CSS or runtime rules. The limitations are documented in
  `docs/src/content/docs/reference/limitations.md` and the CSS scorecard.
- "The setup is too dependent on generated files." A normal Tailwind lane needs
  generated `tw.ts`, `types.d.ts`, `bridge.ts`, and theme artifacts. Stale or
  missing generated output can break the editor or build. That is powerful for
  project-specific typing, but it is a real adoption cost.
- "The core package is too large conceptually." `pandwind` declares 52 export
  paths, including internal `_runtime` paths, and hard-depends on build/tooling
  packages such as `@tailwindcss/node`, `oxc-parser`, PostCSS, Unplugin, and
  CAC. Tree-shaking helps browser output, but installing the package still
  brings a lot of unrelated machinery.
- "The official-library compatibility is brittle." Tailwind integration
  currently relies on `@tailwindcss/node`'s `__unstable__loadDesignSystem`
  API. That is the correct source of truth today, but it is also a compatibility
  risk when Tailwind changes internals.
- "The codemod matrix looks broader than the actual guarantee." The checked-in
  real-repository report contains 33 reports, with 27 passed proof dimensions,
  162 pending dimensions, and 6 pipeline-unpaired references. The adapter
  reference proof has 29 small probes, 139 converted sites, 10 residuals, and
  26 fully valid migrations. That is useful evidence, but it is not proof that
  arbitrary production applications migrate cleanly.
- "A migration that runs is not necessarily a migration that finishes."
  Component defaults, slots, theme callbacks, runtime interpolation, framework
  behavior, recipes, plugins, SSR, and hydration frequently require residuals
  or manual work. The adapter system is honest about this, but users may still
  interpret the large adapter catalog as broad automatic conversion support.
- "The framework story is incomplete." Vite and generic Unplugin support are
  strong directions, but framework-native AST and runtime semantics remain
  host-owned. React/Next, Vue, Solid, server components, component libraries,
  and SSR behavior are not universally preserved by a generic style adapter.
- "The Playground is a teaching tool, not production proof." It evaluates code
  in a browser sandbox with shims and deliberately excludes project module
  loading and Tailwind's Node engine. A scenario passing there does not prove
  the same source will build correctly in a real project.
- "The MCP surface is ahead of the underlying proof."
  `validate_migration` exposes typecheck, build, SSR, hydration, browser, and
  bundle-size checks, but the default MCP server cannot execute those checks.
  It returns `unavailable` unless a host injects an auditable validation port.
  `benchmark_project` currently measures in-process migration time, memory,
  and existing artifact sizes; it is not a real cold/warm build benchmark.

## Things that are actually sloppy today

- The public codemod docs disagree. `packages/codemod/README.md` describes the
  unified `migrate` command, writes by default, and `--dry-run`;
  `docs/src/content/docs/tooling/codemod.md` still describes the old default
  command, `swap`, dry-run-by-default behavior, and `--write`.
- Package metadata has incorrect repository directory names in
  `packages/analyze/package.json` and `packages/codemod/package.json`.
- Several real-repository corpus tests intentionally skip when reference
  repositories are not installed. A green default test run therefore does not
  mean the full external corpus ran.
- The repository's own coverage baseline is moderate rather than exceptional:
  codemod reports roughly 76% statements and 64% branches; analyze reports
  roughly 74% statements and 61% branches.
- The architecture is cleaner than it used to be, but it is still large for a
  `0.1.0` product: about 129 Pandwind source files, 149 codemod source files,
  dozens of registries and contracts, and many ecosystem adapters. The
  abstraction cost is real.

## The most questionable scope

- The design CSS lane, React Native/OpenTUI backends, MCP, DevTools,
  Playground, and 30-plus adapters all make sense individually, but together
  they dilute the main product.
- The non-web backends are especially hard to justify until there are real
  consumers. CSS conditions and selectors do not transfer naturally to React
  Native or OpenTUI, so they expand contracts and tests without strengthening
  the main web use case.
- The adapter catalog is more useful as a migration research platform than as a
  dependable production migration product today.
- `benchmark_project` is currently low-signal and should either become a real
  host benchmark port or be removed from the headline feature set.

## What should be kept

The semantic IR, fail-closed residuals, official-loader boundary, generated
project metadata, `tw()`/`css()` static extraction, `css.vars()` runtime escape
hatch, and shared adapter registry are all defensible. Those solve real
problems.

The strongest version of Pandwind would narrow its promise to: **typed,
project-aware Tailwind/Pandwind authoring plus reliable migration between the
top few ecosystems, with real build/browser/SSR proof.** Everything else should
be separately packaged, explicitly experimental, or deferred until a real
consumer requires it.

