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
- CSS, React Native, React Strict DOM, and OpenTUI backend contracts, plus renderer-neutral host
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
| 006, 009–012 | Complete for the shipped CI, benchmark, analyzer, roadmap, and research scope                                                                                                                                                                                                                         | [Benchmarks](/reference/benchmarks/), [Tooling workflows](/tooling/workflows/)                                                             |
| 007–008, 013 | Complete for the implemented hardening, codemod, and dogfood lanes                                                                                                                                                                                                                                    | [Codemod](/tooling/codemod/), [Adoption](/reference/adoption/)                                                                                       |
| 014–017      | Complete for the approved runtime, theme, stack, and test waves                                                                                                                                                                                                                                       | [Theming](/api/theming/), [Backends](/reference/backends/), [Size](/reference/size/)                                                                 |
| 018–020      | Audited; Inspector and Migration Preview capabilities are shipped, while deeper presentation polish remains non-pivot backlog                                                                                                                                                                          | [Tooling workflows](/tooling/workflows/)                                                                                                   |
| 021–024      | Complete for CSS/RN/OpenTUI, bidirectional codemods, release gates, Panda inbound migration, and the pinned installed Panda website proof                                                                                                                                                             | [Backends](/reference/backends/), [Adapter contract](/reference/adapter-contract/), [Adapter migrations](/interop/css-in-js-adapters/)               |
| 025–027      | Complete                                                                                                                                                                                                                                                                                              | [CSS-in-JS scorecard](/reference/css-in-js-scorecard/), [SSR](/reference/ssr/)                                                                       |
| 028          | Complete for the narrow build-time `define.preset({ web: ... })` contract, deterministic stylesheet emission, common-bucket route splitting, and `pandwind.lib/3` propagation; authored CSS remains the full escape hatch                                                                             | [Presets](/api/presets/), [Authored CSS](/reference/authored-css/), [Component libraries](/guides/component-library/)                                |
| 029–033      | Complete for bundler adoption, pivot completion, and interface-first architecture                                                                                                                                                                                                                     | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/)                                                        |
| 035–036      | Complete                                                                                                                                                                                                                                                                                              | This page and the repository's contributor guidance                                                                                                  |
| 037          | Complete for non-release semantic lowering, static-first fallback, shared source workspace, host/scanner contracts, and differential evidence                                                                                                                                                         | [Architecture](/contributing/architecture/), [Adapter migrations](/interop/css-in-js-adapters/)                                                      |
| 038–039      | Complete for the reproducible offline pivot gate, pinned-reference adapter browser proof, explicit per-adapter coverage evidence, and the final history/proof audit                                                                                                                                   | [Testing](/contributing/testing/), [Architecture](/contributing/architecture/), [Shipped plans](/reference/shipped-plans/)                           |
| 040–041      | Complete for the finite semantic-family gate, target-owned lowering, residual taxonomy, scanner-backed supported host projections, and 6,144-case bidirectional route proof; installed browser/SSR/RSC promotion remains explicit per adapter                                                         | [Adapter migrations](/interop/css-in-js-adapters/), [Testing](/contributing/testing/)                                                                |
| 042          | Complete for the `StyleProgramBuilder` construction façade, semantic invariant tests, and adapter-authoring documentation                                                                                                                                                                             | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/)                                                        |
| 043          | Complete for the deterministic semantic core, compatibility negotiation, proof fingerprints, conformance tests, and architecture documentation                                                                                                                                                        | [Architecture](/contributing/architecture/), [Adapter contract](/reference/adapter-contract/), [Testing](/contributing/testing/)                     |
| 044          | Complete for shared AST binding/index infrastructure, scanner-backed supported host ranges, strict-first official-loader boundaries, custom-context evidence, and port substitution tests; adapter-specific template syntax remains explicitly target-owned                                           | [Architecture](/contributing/architecture/), [Adapter migrations](/interop/css-in-js-adapters/)                                                      |
| 045          | Runtime-only lazy methods were rejected after measurement; compiler-aware usage pruning is the accepted implementation                                                                                                                                                                                | [Size](/reference/size/), [Benchmarks](/reference/benchmarks/)                                                                                       |
| 046          | Complete for usage-aware runtime pruning and the generic ecosystem lint/codemod policy; ecosystem-specific style preferences remain opt-in and metadata-backed                                                                                                                                        | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/)                                                                       |
| 047–048      | Complete for measured runtime hot-path optimization and codebase simplification, with the frozen API and `SwapIR` fast path preserved                                                                                                                                                                 | [Benchmarks](/reference/benchmarks/), [Architecture](/contributing/architecture/)                                                                    |
| 049          | Complete for the optional tooling-only Effect 4 boundary, ordered bounded task runner, Node filesystem/path adapter, and substitution tests                                                                                                                                                           | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/)                                                                       |
| 050–058      | Complete for the pivot runtime, adapter migration, dynamic lowering, token preservation, and codemod proof work; bounded residuals remain explicit in the route catalog                                                                                                                               | [Adapter migrations](/interop/css-in-js-adapters/), [Testing](/contributing/testing/)                                                                |
| 059          | Complete for package-surface ownership, runtime/build dependency separation, generated-artifact freshness, and maturity labeling                                                                                                                                                                      | [Architecture](/contributing/architecture/), [Size](/reference/size/)                                                                                |
| 060          | Complete for 19 dependency-installed web proof directions and an executable route-evidence gate; all routes remain experimental until broader fixtures justify promotion                                                                                                                              | [Current limitations](/reference/current-limitations-and-criticism/), [Testing](/contributing/testing/)                                              |
| 061          | Complete for capability reports, explicit dynamic/runtime residuals, official-loader diagnostics, and host-bound evidence labels; framework-native behavior remains host-owned                                                                                                                        | [Adapter contract](/reference/adapter-contract/), [Current limitations](/reference/current-limitations-and-criticism/)                               |
| 062          | Complete for separate sandbox and real package/Vite fixture lanes, typed MCP validation and benchmark ports, scoped resources, and visible CSS/IR diagnostics; the fixture records SSR-build success while browser/hydration remain unavailable                                                       | [Tooling workflows](/tooling/workflows/), [Current limitations](/reference/current-limitations-and-criticism/)                             |
| 063–064      | Complete for the codebase simplification wave, cohesive migration boundaries, registry ownership, and the retained substitution-test architecture                                                                                                                                                     | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/)                                                                       |
| 065          | Complete for ordinary-CI proof gates, scanner-owned shared JSX host ranges, official-loader context evidence, a multi-file installed Tailwind proof, typed opt-in MCP host seams, and consumer generated-artifact verification; broader framework and ecosystem proof remains explicitly experimental | [Architecture](/contributing/architecture/), [Testing](/contributing/testing/), [Current limitations](/reference/current-limitations-and-criticism/) |
| 066          | Complete for the React Strict DOM web/native style backend, public style surface, bidirectional codemod adapter, documented API evidence, and copyable examples; RSD host/compiler semantics remain explicitly external                                                                               | [Backends](/reference/backends/), [React Strict DOM integration](/interop/react-strict-dom/), [Adapter migrations](/interop/css-in-js-adapters/)     |
| 067          | Complete for opt-in runtime CSS code generation, shared attachment rendering, typed method projections, and freshness checks                                                                                                                                                                          | [Code generation](/tooling/codegen/), [Architecture](/contributing/architecture/)                                                                    |
| 068          | Complete for opt-in Pandwind-owned namespaces across dynamic carriers, critical markers, and matching build/runtime boundaries                                                                                                                                                                        | [CSS API](/api/css/), [Vite plugins](/tooling/vite-plugins/), [Current limitations](/reference/current-limitations-and-criticism/)                   |
| 069          | Complete for strategy-aware `Stack` bindings, explicit Tailwind fast path, renderer class-attribute policy, and conservative configured-engine folding                                                                                                                                                | [Backends](/reference/backends/), [Advanced guide](/guides/advanced/)                                                                                |
| 070          | Complete for the preset-bound safe CSS factory and explicit `pandwind/unsafe/css` escape hatch, including package and generated-consumer proof                                                                                                                                                        | [CSS API](/api/css/), [Getting started](/getting-started/)                                                                                           |
| 071          | Complete for publishable `pandwind.lib` artifacts, explicit consumer registration, compatibility fingerprints, stale-artifact rejection, and source-extraction fallback                                                                                                                               | [Component libraries](/guides/component-library/), [Code generation](/tooling/codegen/)                                                              |
| 072          | Complete for explicit structural and token-aware preset layers, generated package surfaces, and migration-safe preset selection                                                                                                                                                                       | [Presets](/api/presets/), [CSS API](/api/css/)                                                                                                       |
| 073          | Complete for CSS fallback declaration chains and generated CSS typings, with type-safe accepted/rejected property/value contracts                                                                                                                                                                     | [CSS API](/api/css/), [Code generation](/tooling/codegen/)                                                                                           |
| 074          | Complete for the approved starter-preset/reset scope; the StyleX lane is intentionally skipped and the keyframes follow-up is shipped by Plan 076                                                                                                                                                     | [Presets](/api/presets/), [Resets](/api/resets/), [Size](/reference/size/)                                                                           |
| 075          | Complete for the generated Tailwind typography/prose stylesheet, pinned upstream generation, provenance, and explicit reset/preset/prose boundary                                                                                                                                                     | [Prose stylesheet](/api/prose/), [Authored CSS](/reference/authored-css/)                                                                            |
| 076          | Complete for static component-local `css.keyframes()`, deterministic names, extraction/folding, route splitting, diagnostics, and measured runtime/compiler evidence                                                                                                                                  | [CSS API](/api/css/), [Authored CSS](/reference/authored-css/), [Size](/reference/size/)                                                             |
| 077          | Complete for validated named cascade layers shared by pure CSS, Vite, runtime sheets, and publishable artifacts; the existing shorthand remains unchanged                                                                                                                                             | [CSS API](/api/css/), [Component libraries](/guides/component-library/), [Adapter contract](/reference/adapter-contract/)                            |

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
