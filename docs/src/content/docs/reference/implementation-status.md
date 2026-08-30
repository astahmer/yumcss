---
title: Implementation status
description: The current shipped scope, proof, and deliberate boundaries of pandwind.
sidebar:
  order: 0
---

This page is the current source of truth for implementation status. Files under
`plans/` are execution records: they preserve the decisions, experiments, and
revision history that produced the implementation, but an old unchecked item
does not override current code or tests.

## The pivot is implemented

Pandwind now has the core architecture required to act as a CSS-in-JS pivot:

- a versioned semantic `StyleProgram` for rich rules and a flat `SwapIR` fast
  path for literal declaration swaps;
- the v2 adapter contract for detection, config loading, parsing, emission,
  dependencies, capabilities, validation, and explicit lossiness;
- explicit adapter/plugin discovery, shared source scanning, host/framework
  adapters, backend registries, and validator/lowering composition;
- runtime CSS-in-JS with deterministic ordering, SSR extraction, hydration,
  dynamic values, globals, keyframes, font-face, layers, supports, nesting,
  selectors, and provenance;
- codemod coverage for the first-party and external ecosystems listed in
  [CSS-in-JS adapter migrations](/interop/css-in-js-adapters/), with residuals
  retained whenever a translation is not proven safe. The adapter contract
  and fixture matrix is broader than the real-application proof matrix;
- differential fixtures for canonical CSS, browser state, SSR/hydration,
  streaming, dependency changes, and residual reports;
- CSS, React Native, and OpenTUI backend contracts, plus renderer-neutral host
  seams for React, Preact, Solid, Vue, Svelte, Astro, Qwik, and native markup;
- release preflight, pack/import smoke tests, generated agent metadata, the
  analyzer, and the inspector provenance/coverage surfaces.

The latest architecture completion pass also includes a standalone
`ValidatorContractSuite`, an injectable `DifferentialCorpusRunner`, target
policy selection through the adapter contract, and a Panda stage factory. The
codemod CI contract now requires every registered adapter to have a real
parse/emit fixture and checks that every capability exercised by that fixture
is declared representable by the adapter.

The evidence is maintained in the codemod corpus report at
`plans/evidence/real-repository-migrations-v2.json`, the checked-in
`plans/evidence/real-browser-ssr-proof-matrix.json`, and the package tests.
The corpus proves routing and preserves residuals. The proof matrix is the
stronger claim boundary: only five pinned documentation repositories currently
have real server-route and browser evidence. It is not a claim that arbitrary
framework-specific runtime behavior can be made lossless.

## Plan audit

| Plans        | Current status                                                                                                  | Canonical documentation                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 001–005      | Complete                                                                                                        | [Architecture](/contributing/architecture/), [CSS-in-JS scorecard](/reference/css-in-js-scorecard/)                                    |
| 006, 009–012 | Complete for the shipped CI, benchmark, analyzer, roadmap, and research scope                                   | [Benchmarks](/reference/benchmarks/), [Analyze and Studio](/tooling/analyze-and-studio/)                                               |
| 007–008, 013 | Complete for the implemented hardening, codemod, and dogfood lanes                                              | [Codemod](/tooling/codemod/), [Adoption](/reference/adoption/)                                                                         |
| 014–017      | Complete for the approved runtime, theme, stack, and test waves                                                 | [Theming](/api/theming/), [Backends](/reference/backends/), [Size](/reference/size/)                                                   |
| 018–020      | Audited; Studio/inspector capabilities are shipped, while deeper presentation polish remains non-pivot backlog  | [Analyze and Studio](/tooling/analyze-and-studio/)                                                                                     |
| 021–024      | Complete for CSS/RN/OpenTUI, bidirectional codemods, release gates, and Panda inbound migration                 | [Backends](/reference/backends/), [Adapter contract](/reference/adapter-contract/), [Adapter migrations](/interop/css-in-js-adapters/) |
| 025–027      | Complete                                                                                                        | [CSS-in-JS scorecard](/reference/css-in-js-scorecard/), [SSR](/reference/ssr/)                                                         |
| 028          | Deliberately deferred                                                                                           | [Authored CSS](/reference/authored-css/)                                                                                               |
| 029–033      | Complete for bundler adoption, pivot completion, interface-first architecture, proof ports, and stage ownership | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/)                                          |
| 035–036      | Complete                                                                                                        | This page and the repository's contributor guidance                                                                                    |

## What remains intentionally bounded

These are not missing pieces of the pivot boundary:

- Canvas and a build-time Metro compiler remain deferred until a concrete
  consumer justifies their semantics.
- Authored CSS remains the web escape hatch for global behavior that should be
  owned by the platform rather than synthesized by a TypeScript API.
- Framework-native AST transforms stay host-owned. Pandwind exposes contracts
  and conservative adapters, but it does not pretend generic syntax can
  preserve framework runtime behavior without framework evidence.
- A real npm publication still requires an operator, credentials, and a
  release changeset; local `release:check` and `release:smoke` are the proof
  boundary in this workspace.
- The checked-in multi-library corpus intentionally reports bundle impact as
  `measured: false` when it has not installed and built the source project's
  dependency graph. That is an evidence boundary, not a claim of “same or
  smaller” output for every arbitrary application. Host builds that make that
  comparison are required for a universal migration claim.
- Real repository support is promoted only through the proof matrix. A
  contract fixture proves that an adapter can parse and emit its declared
  shape; it does not prove browser, server-rendering, hydration, or CSS-size
  parity for an arbitrary application.
- Inspector visual polish and experimental cold-path optimizations are useful
  follow-ups, but do not block CSS-in-JS migration correctness.

## Acceptance rule for future work

New ecosystem support is complete only when its adapter is independently
registered, its source language and host semantics are explicit, its target
capabilities are checked, and representative fixtures prove canonical output
or report a precise residual. Do not add a central library-specific branch to
make a single migration pass.

## Real proof boundary

The checked-in `plans/evidence/real-browser-ssr-proof-matrix.json` is the
acceptance boundary for real application claims. It currently covers pinned
documentation repositories for Tailwind, StyleX, Chakra UI, shadcn/ui, and
styled-components. Those entries record production/server route checks,
browser equivalence, and CSS accounting. The remaining registered adapters
have contract fixtures and corpus evidence, but are intentionally not claimed
to have arbitrary-application browser or SSR parity until they receive their
own matrix entry.

The styled-components lane is static-first: its current pinned corpus has 82
fully static call sites, 203 dynamic values lowered without runtime CSS
injection, and 42 opaque runtime fallbacks. The fallback is an explicit safety
boundary, not a silent loss of styling; the next improvement is to lower those
specific semantics, not to make runtime CSS the default.

The latest styled-components proof covers 55 routes (31 HTML routes), with no
server or browser failures, equivalent browser states in both static lanes, and
546,103 bytes versus 1,321,407 bytes for the reference. The comparator moves
reference styled-components style nodes to `head` while preserving their CSS,
so the result measures rendered CSS behavior rather than injection topology.
