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
  and lossiness behavior.
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
- [x] Add StyleProgram v3 metadata and capability requirements for dynamics,
      themes, composition, runtime, plugins, and framework semantics.
- [ ] Decompose the remaining Panda orchestration into independently testable
      discovery, semantic conversion, emission, rewrite, and validation stages.
- [ ] Replace remaining direct parser calls and extension heuristics with the
      shared scanner service.
- [ ] Implement target-aware lowerings for themes, dynamics, composition,
      runtime/SSR/hydration, plugin transforms, and framework output.
- [ ] Add the next adapter families and real repositories to the corpus.
- [ ] Add browser/SSR/RSC/hydration/dependency validators to the matrix.
- [ ] Publish adapter SDK documentation, compatibility/version policy, and
      release artifacts.
- [ ] Run final cross-package, example, corpus, and release validation; update
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

- [ ] A third-party adapter package can be discovered, registered, routed, and
      validated without modifying Pandwind core files.
- [ ] Panda migration stages can be replaced/tested independently and the
      public migration result remains stable.
- [ ] Codemod, Vite, analyzer, and Panda use the shared source scanner contract
      for all supported source languages.
- [ ] Every semantic lowering either produces equivalent target behavior or a
      precise residual/capability report in safe mode.
- [ ] The differential matrix covers every supported adapter pair that claims
      compatibility, including browser, SSR, hydration, and streaming cases.
- [ ] At least three real repositories produce stored, reproducible migration
      reports with zero unexplained silent drops.
- [ ] SDK docs, package exports, typecheck, lint, tests, corpus checks, and
      release smoke/preflight all pass.
- [ ] This plan is fully checked off before the goal is marked complete.

## Decisions log

- 2026-08-27 — Keep `SwapIR` as the cheap path; use StyleProgram only when
  richer semantics or adapter validation require it.
- 2026-08-27 — Make plugin discovery explicit and injectable rather than
  ambient, so package loading stays deterministic and safe.
- 2026-08-27 — Preserve capability-honest safe mode: unsupported semantics are
  residuals, never silent partial rewrites.
- 2026-08-27 — Treat the existing Panda parser/theme/project/module files as
  domain owners and decompose the remaining orchestration around them.
