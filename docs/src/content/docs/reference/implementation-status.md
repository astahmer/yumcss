---
title: Implementation status
description: The current shipped scope, proof, and deliberate boundaries of pandwind.
sidebar:
  order: 0
---

This page is the current source of truth for implementation status. Files under
`plans/` are execution records: they preserve the decisions, experiments, and
revision history that produced the implementation, but an old unchecked item
does not override current code or tests. The user-facing translation of
completed waves is in [Shipped plans and evidence](/reference/shipped-plans/).

## The pivot is implemented

Pandwind now has the core architecture required to act as a CSS-in-JS pivot:

- a versioned semantic `StyleProgram` for rich rules and a flat `SwapIR` fast
  path for literal declaration swaps;
- the v3 adapter contract for detection, config loading, parsing, emission,
  dependencies, capabilities, validation, and explicit lossiness;
- explicit adapter/plugin discovery, shared source scanning, host/framework
  adapters, backend registries, and validator/lowering composition;
- runtime CSS-in-JS with deterministic ordering, SSR extraction, hydration,
  dynamic values, globals, keyframes, font-face, layers, supports, nesting,
  selectors, and provenance;
- codemod coverage for the first-party and external ecosystems listed in
  [CSS-in-JS adapter migrations](/interop/css-in-js-adapters/), with residuals
  retained whenever a translation is not proven safe;
- differential fixtures for canonical CSS, browser state, SSR/hydration,
  streaming, dependency changes, and residual reports;
- a deterministic `StyleProgramCore` boundary with versioned artifact
  encoding, stable fingerprints, plugin core-version negotiation, and proof
  evidence that records the normalized core identity;
- an injectable `SourceWorkspace` filesystem/scanner boundary and a bounded
  AST-backed project binding index for aliased imports through relative barrel
  re-exports;
- an optional Effect 4 tooling adapter for bounded, cancellable reference
  batches and official Node filesystem/path services, isolated from shipped
  runtime and Vite code;
- a typed real-repository promotion report that distinguishes source-static
  evidence from runtime-pending, source-mismatch, and pipeline-unpaired
  entries across canonical CSS, browser, SSR/hydration, streaming,
  dependency, and CSS-size dimensions;
- CSS, React Native, and OpenTUI backend contracts, plus renderer-neutral host
  seams for React, Preact, Solid, Vue, Svelte, Astro, Qwik, and native markup;
- release preflight, pack/import smoke tests, generated agent metadata, the
  analyzer, and the inspector provenance/coverage surfaces.

The evidence is maintained in the codemod corpus report at
`plans/evidence/real-repository-migrations-v2.json` and in the package tests.
The corpus proves routing and preserves residuals; it is not a claim that an
arbitrary framework-specific runtime behavior can be made lossless.

## Plan audit

| Plans        | Current status                                                                                                                                                                                                                                                                                        | Canonical documentation                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001–005      | Complete                                                                                                                                                                                                                                                                                              | [Architecture](/contributing/architecture/), [CSS-in-JS scorecard](/reference/css-in-js-scorecard/)                                                  |
| 006, 009–012 | Complete for the shipped CI, benchmark, analyzer, roadmap, and research scope                                                                                                                                                                                                                         | [Benchmarks](/reference/benchmarks/), [Analyze and Studio](/tooling/analyze-and-studio/)                                                             |
| 007–008, 013 | Complete for the implemented hardening, codemod, and dogfood lanes                                                                                                                                                                                                                                    | [Codemod](/tooling/codemod/), [Adoption](/reference/adoption/)                                                                                       |
| 014–017      | Complete for the approved runtime, theme, stack, and test waves                                                                                                                                                                                                                                       | [Theming](/api/theming/), [Backends](/reference/backends/), [Size](/reference/size/)                                                                 |
| 018–020      | Audited; Studio/inspector capabilities are shipped, while deeper presentation polish remains non-pivot backlog                                                                                                                                                                                        | [Analyze and Studio](/tooling/analyze-and-studio/)                                                                                                   |
| 021–024      | Complete for CSS/RN/OpenTUI, bidirectional codemods, release gates, and Panda inbound migration                                                                                                                                                                                                       | [Backends](/reference/backends/), [Adapter contract](/reference/adapter-contract/), [Adapter migrations](/interop/css-in-js-adapters/)               |
| 025–027      | Complete                                                                                                                                                                                                                                                                                              | [CSS-in-JS scorecard](/reference/css-in-js-scorecard/), [SSR](/reference/ssr/)                                                                       |
| 028          | Deliberately deferred                                                                                                                                                                                                                                                                                 | [Authored CSS](/reference/authored-css/)                                                                                                             |
| 029–033      | Complete for bundler adoption, pivot completion, and interface-first architecture                                                                                                                                                                                                                     | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/)                                                        |
| 035–036      | Complete                                                                                                                                                                                                                                                                                              | This page and the repository's contributor guidance                                                                                                  |
| 037          | Complete for non-release semantic lowering, static-first fallback, shared source workspace, host/scanner contracts, and differential evidence                                                                                                                                                         | [Architecture](/contributing/architecture/), [Adapter migrations](/interop/css-in-js-adapters/)                                                      |
| 038–039      | Complete for the reproducible offline pivot gate, pinned-reference adapter browser proof, explicit per-adapter coverage evidence, and the final history/proof audit                                                                                                                                   | [Testing](/contributing/testing/), [Architecture](/contributing/architecture/), [Shipped plans](/reference/shipped-plans/)                           |
| 040–041      | Route planning, target-owned lowering, residual taxonomy, host projections, and bidirectional fixture infrastructure are shipped; universal semantic and production-proof checkboxes remain deliberately bounded                                                                                      | [Adapter migrations](/interop/css-in-js-adapters/), [Testing](/contributing/testing/)                                                                |
| 042          | Complete for the `StyleProgramBuilder` construction façade, semantic invariant tests, and adapter-authoring documentation                                                                                                                                                                             | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/)                                                        |
| 043          | Complete for the deterministic semantic core, compatibility negotiation, proof fingerprints, conformance tests, and architecture documentation                                                                                                                                                        | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/), [Testing](/contributing/testing/)                     |
| 044          | Complete for shared AST binding/index infrastructure, the shared JSX host-range owner, and official-loader boundaries; adapter-specific host syntax and broader ecosystem-specific context remain explicit follow-up scope                                                                            | [Architecture](/contributing/architecture/), [Adapter migrations](/interop/css-in-js-adapters/)                                                      |
| 045          | Runtime-only lazy methods were rejected after measurement; compiler-aware usage pruning is the accepted implementation                                                                                                                                                                                | [Size](/reference/size/), [Benchmarks](/reference/benchmarks/)                                                                                       |
| 046          | Complete for usage-aware runtime pruning and the generic ecosystem lint/codemod policy; ecosystem-specific style preferences remain opt-in and metadata-backed                                                                                                                                        | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/)                                                                       |
| 047–048      | Complete for measured runtime hot-path optimization and codebase simplification, with the frozen API and `SwapIR` fast path preserved                                                                                                                                                                 | [Benchmarks](/reference/benchmarks/), [Architecture](/contributing/architecture/)                                                                    |
| 049          | Complete for the optional tooling-only Effect 4 boundary, ordered bounded task runner, Node filesystem/path adapter, and substitution tests                                                                                                                                                           | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/)                                                                       |
| 050–058      | Complete for the pivot runtime, adapter migration, dynamic lowering, token preservation, and codemod proof work; bounded residuals remain explicit in the route catalog                                                                                                                               | [Adapter migrations](/interop/css-in-js-adapters/), [Testing](/contributing/testing/)                                                                |
| 059          | Complete for package-surface ownership, runtime/build dependency separation, generated-artifact freshness, and maturity labeling                                                                                                                                                                      | [Architecture](/contributing/architecture/), [Size](/reference/size/)                                                                                |
| 060          | Complete for four dependency-installed React/Vite proof directions and an executable route-evidence gate; all routes remain experimental until broader fixtures justify promotion                                                                                                                     | [Current limitations](/reference/current-limitations-and-criticism/), [Testing](/contributing/testing/)                                              |
| 061          | Complete for capability reports, explicit dynamic/runtime residuals, official-loader diagnostics, and host-bound evidence labels; framework-native behavior remains host-owned                                                                                                                        | [Adapter contract](/reference/adapter-contract/), [Current limitations](/reference/current-limitations-and-criticism/)                               |
| 062          | Complete for sandbox/Studio evidence labels, typed MCP validation and benchmark ports, scoped resources, and visible CSS/IR diagnostics                                                                                                                                                               | [Analyze and Studio](/tooling/analyze-and-studio/), [Current limitations](/reference/current-limitations-and-criticism/)                             |
| 063–064      | Complete for the codebase simplification wave, cohesive migration boundaries, registry ownership, and the retained substitution-test architecture                                                                                                                                                     | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/)                                                                       |
| 065          | Complete for ordinary-CI proof gates, scanner-owned shared JSX host ranges, official-loader context evidence, a multi-file installed Tailwind proof, typed opt-in MCP host seams, and consumer generated-artifact verification; broader framework and ecosystem proof remains explicitly experimental | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/), [Current limitations](/reference/current-limitations-and-criticism/) |

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
- Source-only real-repository entries are not promoted by inference. Their
  pending browser, SSR/hydration, dependency, and CSS-size dimensions remain
  visible in the proof artifact until a repository-specific runner executes
  them.
- Verified token values can be lowered to static literals when a target lacks
  token support; unresolved custom tokens remain structured residuals rather
  than being guessed or dropped.
- Inspector visual polish and experimental cold-path optimizations are useful
  follow-ups, but do not block CSS-in-JS migration correctness.

## Acceptance rule for future work

New ecosystem support is complete only when its adapter is independently
registered, its source language and host semantics are explicit, its target
capabilities are checked, and representative fixtures prove canonical output
or report a precise residual. Do not add a central library-specific branch to
make a single migration pass.
