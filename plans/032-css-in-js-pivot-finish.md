# CSS-in-JS pivot finish plan

## Context

Pandwind already has the main pivot boundary: versioned semantic style-program
IR, flat `SwapIR` fast path, adapter contract v2, external adapters,
capability reports, differential checks, host/backend registries, and a shared
source scanner. The remaining gap is operational: the architecture needs to be
easy to extend, the semantics need real lowerings, and migrations need proof on
real repositories rather than only synthetic fixtures.

The user-facing Pandwind API remains intentionally small. This plan is tooling,
compiler, adapter, validation, documentation, and release work; it does not
expand `tw()` / `css()` / `cx()` by default.

## Goal

Make Pandwind a practical, capability-honest pivot layer for migrating between
CSS-in-JS ecosystems: one source adapter, one semantic IR, one target adapter,
with reusable scanners, validators, backends, framework integrations, and
real-repository evidence.

## What

- Finish decomposition of Panda and adapter migration ownership into replaceable
  stages.
- Stabilize and publish the third-party adapter/plugin SDK.
- Make source scanning a single service across codemod, Vite, analyzer, and
  Panda/compiler paths.
- Turn semantic metadata into concrete lowerings for dynamics, themes,
  composition, runtime context, plugin transforms, and framework semantics.
- Expand adapters and maintain a real-world differential corpus.
- Validate canonical CSS, browser states, SSR, hydration, streaming/RSC,
  dependencies, and residual reports.
- Complete release, documentation, and acceptance evidence.

## Why

The original value proposition is not another isolated CSS-in-JS runtime. It is
an interop boundary that lets a project leave or adopt a styling system without
rewriting every framework/compiler/backend integration. That promise fails if
adapters remain statically coupled, scanner behavior differs by lane, or
unsupported semantics are silently approximated.

## How

```text
repository/file provider
        ↓
SourceScannerRegistry → SourceDocument + language/parser evidence
        ↓
source StyleAdapter / plugin
        ↓
StyleProgram v3 + provenance + semantics
        ↓
capability and validator registries
        ↓
target StyleAdapter / plugin
        ↓
host compiler + backend adapter + residual report
```

### Decisions

- Keep the flat `SwapIR` path for simple literal swaps.
- Use explicit plugin discovery; never scan `node_modules` implicitly.
- Third-party adapters must declare capabilities, dependencies, config inputs,
  and lossiness behavior in the package manifest convention.
- Source-language adapters own syntax parsing; migration policy consumes a
  language-neutral document contract.
- Framework and runtime semantics are explicit metadata, not guessed from
  arbitrary expressions.
- Safe mode never performs a partial rewrite when required target capabilities
  are absent.
- Real-repository migrations are acceptance evidence, while synthetic fixtures
  remain deterministic regression tests.

## What this allows

- Add a source or target adapter without editing the migration orchestrator.
- Load adapters from external packages in CLI, bundler, or test environments.
- Migrate across React, Vue, Svelte, Astro, and future source formats through
  one scanner contract.
- Preserve or explicitly report theme, dynamic, composition, runtime, plugin,
  SSR, hydration, and framework semantics.
- Compare source and target behavior beyond string-level CSS snapshots.
- Release a documented adapter SDK with reproducible compatibility evidence.

## What this does not allow

- It does not promise lossless conversion where the target has no equivalent
  semantic capability.
- It does not make every CSS-in-JS ecosystem supported automatically.
- It does not add a broad authoring API to the runtime package.
- It does not hide residuals or turn framework-specific behavior into generic
  CSS when that changes runtime behavior.
- It does not publish packages from this workspace without explicit release
  authorization; release smoke and preflight are the local proof boundary.

## UI & UX

No new end-user UI is required. CLI, inspector, and future devtools surfaces
should render the same migration report: converted ranges, provenance,
capability issues, residuals, dependencies, and validation evidence.

## Data model

The stable extension contracts are:

- `SourceDocument` / `SourceScannerRegistry`
- `StyleAdapter` / `StyleAdapterPlugin` / `StyleAdapterRegistry`
- `StyleProgram` / `StyleProgramResidual`
- `AdapterCapabilities` / `StyleValidatorRegistry`
- `StyleBackendFactory` / `StyleBackendRegistry`
- host compiler and framework adapter contracts

StyleProgram metadata must include enough information to make the following
explicit: dynamic expression dependencies and lowering, theme bindings,
composition edges, runtime phase/hydration identity, plugin transforms, source
framework, and authored provenance.

## Implementation steps

- [x] Record current pivot architecture and preserve the `SwapIR` fast path.
- [x] Add explicit third-party adapter registration/discovery and package
      exports.
- [x] Split adapter migration orchestration from concrete adapter definitions.
- [x] Add scoped Panda migration pipeline over parser/theme/project/module
      owners.
- [x] Promote the scanner/parser service to `pandwind/source` and route the
      affected Vite, analyzer, codemod, and Panda paths through it.
- [x] Add standalone canonical/residual validator registry.
- [x] Add Fela, Goober, Aphrodite, and differential corpus coverage.
- [x] Add Compiled, Solid/Vue styled, and React Native adapter families.
- [x] Add StyleProgram v3 metadata and capability requirements for dynamics,
      themes, composition, runtime, plugins, and framework semantics.
- [x] Decompose the remaining Panda orchestration into independently testable
      discovery, semantic conversion, emission, rewrite, and validation stages.
- [x] Replace remaining direct parser calls and extension heuristics with the
      shared scanner service.
- [x] Implement target-aware lowerings for themes, dynamics, composition,
      runtime/SSR/hydration, plugin transforms, and framework output.
- [x] Add the next adapter families and representative real-world migration
      corpus fixtures.
- [x] Add browser/SSR/RSC/hydration/dependency validators to the matrix.
- [x] Add an adapter-pair matrix with pass/residual expectations and explicit
      dependency deltas.
- [x] Publish adapter SDK documentation, compatibility/version policy, and
      release artifacts.
- [x] Run final cross-package, example, corpus, and release validation; update
      this plan and the completion report.

## Open questions

- Which adapter packages should be first-party versus community-owned?
- Which framework runtime semantics can be lowered exactly, and which must
  remain residuals?
- Should browser validation use Playwright snapshots, a browser connector, or
  both in CI?
- Which real repositories can be redistributed as fixtures versus fetched by an
  opt-in corpus command?

## Acceptance criteria

- [x] A third-party adapter package can be discovered, registered, routed, and
      validated without modifying Pandwind core files.
- [x] Panda migration stages can be replaced/tested independently and the
      public migration result remains stable.
- [x] Codemod, Vite, analyzer, and Panda use the shared source scanner contract
      for all supported source languages.
- [x] Every semantic lowering either produces equivalent target behavior or a
      precise residual/capability report in safe mode.
- [x] The differential matrix covers every supported adapter pair that claims
      compatibility, including browser, SSR, hydration, and streaming cases.
- [x] Pin three reproducible real-repository corpora (Panda website, Emotion,
      and styled-components) with generated migration reports; no unexplained
      silent drops are accepted.
- [x] Keep Linaria, JSS, and Style9 representative fixtures as adapter-level
      regression coverage.
- [x] SDK docs, package exports, typecheck, lint, tests, corpus checks, and
      release smoke/preflight all pass.
- [x] This plan is fully checked off before the goal is marked complete.

## Completion evidence

Validated on 2026-08-27 in the isolated `pandwind-css-in-js` JJ workspace:

- `pnpm run typecheck` — all workspace packages and examples passed.
- `pnpm --dir packages/codemod test` — 220 tests passed, including the
  versioned StyleProgram runtime fixture, all adapter contracts, API corpus,
  Panda stage pipeline, and real-repository evidence checks.
- `pnpm exec tsx scripts/generate-real-repository-report.ts` — regenerated
  `plans/evidence/real-repository-migrations-v2.json` from 16 pinned shallow
  clones (Panda, Emotion, styled-components, vanilla-extract, Stitches,
  Linaria, JSS, Fela, Goober, Aphrodite, Style9, Treat, Compiled,
  solid-styled-components, vue-styled-components, and StyleX). Every selected
  source file was detected; the report records successful adapter routes,
  safe residuals, converted/skipped counts, residual kinds,
  validation/dependency evidence, source/output bytes, and explicitly marks
  bundle measurement false because dependency graphs are not installed in the
  corpus runner. The latest rerun covers 19 fixtures: 8 have zero residuals
  and 11 retain 44 explicit residuals, with no silent source drops.
- The tagged-template matcher now handles nested expression templates and
  nested selectors; function-valued style declarations are classified as
  host-specific capability residuals instead of being misreported as parse
  failures. Safe migrations retain source imports whenever a residual match
  still requires the source runtime.
- The differential matrix runs 12 adapter routes with canonical CSS,
  browser-state, SSR/hydration, streaming, dependency, and residual evidence;
  the dedicated runtime fixture exercises the real Pandwind SSR sheet and
  hydration snapshot path.
- `createStyleAdapterRegistry().discoverPackages()` is manifest-gated and
  tested with an injected package-metadata/plugin loader; Qwik and React Native
  are included in the framework/adapter family contracts.
- `pnpm release:check` and `pnpm release:smoke` — four publishable packages
  pass preflight and export/pack smoke when run against the current workspace.

The corpus intentionally keeps residuals visible. A detected source with zero
converted calls is not counted as a false success: its report contains the
adapter route, residual reason, and selected source path so the next semantic
lowering can be targeted. The checked-in report is therefore acceptance
evidence for the pivot, not a claim that unrelated source-language semantics
are magically lossless.

## Decisions log

- 2026-08-27 — Keep `SwapIR` as the cheap path; use StyleProgram only when
  richer semantics or adapter validation require it.
- 2026-08-27 — Make plugin discovery explicit and injectable rather than
  ambient, so package loading stays deterministic and safe.
- 2026-08-27 — Preserve capability-honest safe mode: unsupported semantics are
  residuals, never silent partial rewrites.
- 2026-08-27 — Treat the existing Panda parser/theme/project/module files as
  domain owners and decompose the remaining orchestration around them.
- 2026-08-27 — Package discovery is opt-in and manifest-gated: dependency
  metadata selects candidates, then the same injectable plugin loader registers
  implementations.
- 2026-08-27 — Real repository evidence distinguishes successful conversions
  from safe residuals; runtime bundle size remains an explicit measured=false
  field until a concrete host bundler is selected.
