---
title: Current limitations and criticism
description: A candid review of Pandwind's current strengths, weaknesses, and product risks.
sidebar:
  order: 6
---

_Review snapshot: 2026-09-08._

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
  generated `tw.ts`, `types.d.ts`, and theme artifacts; `bridge.ts` is optional
  and is only a runtime dependency when the project explicitly selects its
  `twAdapter`. Stale or missing generated output can break the editor or build.
  `generated:check` catches drift for the checked-in example and Playground, and
  `pandwind-codemod tw verify` gives consumer projects a copyable freshness,
  ownership, and raw/gzip budget check. Generated project files remain a real
  adoption cost.
- "The core package is too large conceptually." The repository currently
  exposes 73 exported paths across five packages, including experimental
  integrations and tooling. The runtime package no longer hard-depends on
  Tailwind's loader, Oxc, PostCSS, Unplugin, or CAC, but the product still
  asks users to understand more lanes than a focused styling library would.
- "The official-library compatibility is brittle." Tailwind integration
  currently relies on `@tailwindcss/node`'s `__unstable__loadDesignSystem`
  API. That is the correct source of truth today, but it is also a compatibility
  risk when Tailwind changes internals.
- "The codemod matrix looks broader than the actual guarantee." The checked-in
  real-repository report contains 33 reports, with 27 passed proof dimensions,
  228 pending dimensions, and 6 pipeline-unpaired references. The adapter
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
- There are now four bounded installed-project proofs for Tailwind CSS ->
  Pandwind, styled-components -> Pandwind, Panda -> Pandwind, and UnoCSS ->
  Pandwind. They run the real CLI, generated project files, typechecks, Vite
  builds, SSR, hydration, and browser base/hover comparisons. The Tailwind
  proof also migrates an imported second source module and aggregates its
  canonical evidence. That raises confidence in the covered lanes, but small
  React/Vite fixtures do not establish broad route coverage.
- Those four proofs are now checked by one registry-owned gate. The read-only
  `pivot:proof:installed:routes` command validates every checked-in report, and
  `pivot:proof:installed:routes:run` reruns all four project lanes in CI. A
  missing, stale, residual-bearing, or incomplete report fails the gate rather
  than being treated as route coverage.
- "The MCP surface is ahead of the underlying proof."
  `validate_migration` exposes typecheck, build, SSR, hydration, browser, and
  bundle-size checks, but the default MCP server cannot execute those checks.
  It returns `unavailable` unless a host injects an auditable validation port.
  Every result now carries an execution-evidence label, so in-process adapter
  output is visibly separate from fixture or host proof. `benchmark_project`
  measures an explicitly labeled warm or cold in-process migration profile,
  memory, source/artifact sizes, and reproducibility inputs; it is still not a
  real project build benchmark unless a host port supplies that proof.

## Things that are still weak today

- The generated-artifact gate covers the checked-in example and Playground;
  arbitrary consumer projects still need to add `pandwind-codemod tw verify` to
  their own build validation.
- Reference repositories are intentionally unavailable on machines that have
  not prepared them. The corpus tests report that state explicitly now, but a
  green local run still does not mean the external corpus ran.
- The repository's own coverage baseline is moderate rather than exceptional:
  codemod reports roughly 76% statements and 64% branches; analyze reports
  roughly 74% statements and 61% branches.
- The architecture is cleaner than it used to be, but it is still large for a
  `0.1.0` product: about 129 Pandwind source files, 149 codemod source files,
  dozens of registries and contracts, and many ecosystem adapters. The
  abstraction cost is real.

## Maturity and proof

The repository now records route proof in one catalog and exposes the same
boundary through the evidence report, MCP, and browser tooling. These labels
describe evidence, not a promise that every construct in a route is lossless.

| Surface                                                          | Maturity     | Evidence currently available                                                                                                                                                   | Still required before a stronger claim                                     |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `tw()` / `css()` / `cx()` runtime contracts                      | stable       | package tests, type tests, pack/import smoke, generated artifact checks                                                                                                        | consumer-project coverage and host-specific behavior                       |
| Codegen and Vite integration                                     | experimental | focused runtime/Vite tests and fresh checked-in example artifacts                                                                                                              | repeated proof in dependency-installed consumer projects                   |
| Cataloged codemod routes                                         | experimental | adapter contracts, source probes, route-level dimensions, explicit residuals                                                                                                   | installed project typecheck, build, browser, SSR/hydration, and size proof |
| Tailwind -> Pandwind bounded fixture                             | experimental | installed CLI, generated preset, two-source-module migration, typecheck, build, SSR, hydration, browser pixels                                                                 | more utilities, themes, plugins, frameworks, and larger projects           |
| styled-components -> Pandwind bounded fixture                    | experimental | installed CLI, generated Vite integration, typecheck, build, SSR, hydration, browser pixels                                                                                    | themes, component composition, dynamic props, and multi-file projects      |
| Panda -> Pandwind bounded fixture                                | experimental | installed CLI, official generated-system config, shorthand/token lowering, typecheck, build, SSR, hydration, browser pixels                                                    | recipes, plugins, themes, frameworks, and multi-file projects              |
| UnoCSS -> Pandwind bounded fixture                               | experimental | installed CLI, official UnoCSS generator, custom token lowering, virtual stylesheet/Vite rewrite, typecheck, build, SSR, hydration, browser pixels                             | shortcuts, transformers, variants, frameworks, and multi-file projects     |
| Playground                                                       | experimental | browser sandbox evaluation, StyleProgram extraction, runtime-sheet CSS inspection                                                                                              | real package/Vite fixture and framework host proof                         |
| MCP and analyzer                                                 | experimental | typed tool/resource contracts, per-result execution evidence, explicit host-port unavailable states, reproducible in-process benchmark profiles, and Studio execution evidence | host integrations that execute and retain project evidence                 |
| React Native/React Strict DOM/OpenTUI and other non-web backends | research     | contract and typing coverage                                                                                                                                                   | real consumers and backend-specific runtime proof                          |

The catalog has seven named route policies plus an unavailable research policy
for every additional route the adapter registry can resolve. Four named routes
have bounded installed-project evidence; the remaining named and generated
routes stay experimental or research until their required dimensions are passed
by an installed-project execution lane.

## The most questionable scope

- The design CSS lane, React Native/React Strict DOM/OpenTUI backends, MCP, DevTools,
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
