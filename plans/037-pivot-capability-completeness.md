# Pivot capability completeness plan

## Context

Pandwind already has the important pivot substrate: a versioned semantic
`StyleProgram`, the flat `SwapIR` fast path, adapter/plugin registries,
capability and lossiness contracts, shared scanner boundaries, CSS/RN/OpenTUI
backend seams, and static-first migration lanes. The real-repository proof
matrix currently demonstrates five ecosystems, while the other registered
adapters still have fixture-level evidence only.

The remaining work is not another abstraction pass. It is the semantic,
host, validation, corpus, and release work required to make the pivot useful
for arbitrary applications within explicitly declared capabilities.

The user-facing API remains deliberately small: `tw()`, `css()`, `cx()`,
`createDesignCss`, and the existing code-generation entry points are not
expanded by this plan.

## Goal

Make Pandwind a capability-honest, static-first pivot layer for migrating
between CSS-in-JS ecosystems: every declared capability lowers losslessly or
produces a precise residual, and every promoted adapter is proven in a real
repository across source, build, browser, SSR, hydration, and size behavior.

“Any CSS-in-JS solution” means any solution covered by a declared adapter
contract and capability matrix. It does not mean pretending that a target can
preserve semantics it cannot represent.

## What

### 1. Semantic completeness

Complete the versioned semantic IR and lowering pipeline for:

- dynamic prop, theme, state, environment, and CSS-variable expressions;
- static evaluation across local imports, re-export barrels, and config files;
- composition, recipes, slots, inheritance, `cx`, and extension semantics;
- styled-component subjects, polymorphism, `.attrs`, and host rewrites;
- globals, keyframes, font-face, layers, supports, nesting, selectors, and
  ordering;
- plugin-generated styles and configuration transforms;
- runtime context, SSR, hydration, RSC, and streaming behavior.

### 2. Static-first execution

Every migration first attempts compile-time extraction. Runtime CSS is only a
fallback for genuinely dynamic semantics, and the fallback must be isolated
to the smallest safe dependency closure. No unsupported style may be silently
dropped or approximated as static CSS.

### 3. Adapter SDK and locality

Finish the adapter SDK as the only extension boundary. Each ecosystem owns one
plugin object or folder containing detection, config, parsing, normalization,
emission, dependencies, capabilities, validation, and host rewrites. Shared
orchestration must not contain ecosystem-specific switches.

### 4. Host and scanner coverage

Make the scanner and host rewrite ports work consistently for TSX/JSX, Vue,
Svelte, Astro, Solid, MDX, and React Server Components. Framework behavior is
represented as explicit semantic metadata and validated by a host adapter.

### 5. Differential proof and corpus

Promote adapters only after real repositories prove canonical CSS, browser
states, SSR, hydration, streaming where applicable, dependency behavior,
residual reporting, and non-increasing CSS output. Maintain one or two pinned
repositories per promoted source ecosystem and keep upstream checkouts
read-only.

### 6. Quality and release gates

Enforce adapter, scanner, backend, lowering, and validator conformance in CI;
measure coverage by adapter and capability; run Knip; and make SDK/package
publishing reproducible through release preflight and smoke tests.

## Why

The pivot fails if it only translates happy-path declarations. Real styling
systems encode behavior in runtime functions, themes, component subjects,
plugins, framework compilers, injection order, and server/client boundaries.
Those semantics must either move through the neutral IR and target contracts
or remain visibly isolated as a safe fallback.

A domain expert would reject a universal-support claim based only on synthetic
fixtures or generated CSS snapshots: that evidence cannot reveal hidden
framework, dependency, browser, or hydration behavior. This plan therefore
uses capability declarations plus independent real-project proof as the
promotion rule.

## How

```mermaid
flowchart TD
  A[Source workspace] --> B[Language scanner registry]
  B --> C[Source adapter/plugin]
  C --> D[StyleProgram v3 + provenance]
  D --> E[Semantic lowering registry]
  E --> F[Target adapter/plugin]
  F --> G[Host compiler + backend]
  G --> H[Validator registry]
  H --> I[Residual and differential report]
  J[SwapIR fast path] -. literal declarations .-> F
```

The core use case is deliberately boring:

```text
source adapter → StyleProgram or SwapIR → lowering policies
              → target adapter/backend/host → validator/report
```

Registries select implementations. Adapters own ecosystem policy. Language
and filesystem providers own documents and parsing access. Validators compare
independent observations rather than trusting the emitter that produced them.

### Design decisions

- Preserve `SwapIR` for cheap literal swaps; do not force simple migrations
  through rich semantic nodes.
- Keep the semantic IR versioned and provenance-rich; dynamic expressions,
  themes, composition, runtime phase, plugins, and framework identity must be
  structured metadata, not only residual strings.
- Make static lowering the default policy. Runtime fallback requires an
  explicit capability decision and retains the source dependency closure.
- Use enum-backed built-in identities and branded third-party identities.
- Keep third-party plugin discovery explicit and injectable; never execute an
  ambient scan of `node_modules`.
- Treat real repositories as acceptance evidence, not distributable source
  fixtures. Record repository URL, commit, source path, commands, and report.
- Compare rendered behavior and authored CSS semantics; do not make runtime
  style-node placement itself a false incompatibility.

## What this allows

- Add a source or target ecosystem without editing the migration orchestrator.
- Migrate safe static code to generated CSS/classes with no runtime styling
  dependency.
- Preserve dynamic behavior through target runtime context when supported.
- Produce actionable residuals for unsupported semantics with provenance and
  capability identifiers.
- Reuse the same scanning, lowering, backend, host, and validation services
  across codemod, Vite, analyzer, compiler, and migration proof paths.
- Make evidence-backed claims per adapter, capability, framework, and lane.

## What this does not allow

- It does not guarantee lossless conversion where no target equivalent exists.
- It does not make opaque runtime code statically extractable by guessing.
- It does not turn framework-specific AST behavior into generic CSS.
- It does not require every adapter to support every backend or host.
- It does not claim CSS is smaller for a repository whose dependency graph was
  not actually built and measured.
- It does not publish packages or change remote bookmarks without explicit
  operator action.

## UI & UX

No new end-user UI is required. CLI, analyzer, inspector, and CI reports must
share one evidence shape: converted ranges, residuals, capabilities,
provenance, dependencies, target/runtime decisions, and validation results.

## Data model

The completion work is organized around these contracts:

- `SourceDocument`, `SourceWorkspace`, and `SourceScannerRegistry`;
- `StyleAdapter`, `StyleAdapterPlugin`, and `StyleAdapterRegistry`;
- versioned `StyleProgram`, `StyleProgramSource`, and residual nodes;
- capability, lossiness, lowering, host, and backend identities;
- `StyleValidatorRegistry` and `DifferentialCorpusRunner`;
- per-adapter/per-capability coverage and real-proof matrix entries.

Every semantic node must retain source provenance. Every lowering result must
state whether it is lossless, intentionally lossy, unsupported, or runtime
preserved, with a machine-readable reason.

## Implementation steps

### Phase 1 — establish the contract baseline

- [ ] Audit the current IR, adapter, host, backend, scanner, lowering, and
      validator contracts against this plan.
- [ ] Generate a single capability matrix from registered adapters instead of
      maintaining disconnected static catalogs.
- [ ] Add conformance tests proving minimal substitute implementations work at
      every registry boundary.
- [ ] Make adapter and capability coverage gates fail for missing meaningful
      tests.

### Phase 2 — finish semantic lowering

- [ ] Add structured dynamic-expression nodes and static-evaluation evidence.
- [ ] Lower theme/token access to target theme APIs or CSS custom properties.
- [ ] Lower composition, recipes, slots, and extension semantics.
- [ ] Implement styled subject/polymorphic component rewrites through host
      adapters.
- [ ] Implement globals, keyframes, font-face, layers, supports, nesting, and
      ordering across all applicable targets.
- [ ] Register plugin normalization and transform passes.
- [ ] Add runtime-context, SSR, hydration, RSC, and streaming validators.

### Phase 3 — enforce static-first migration

- [ ] Make compile-time extraction the first decision in every supported lane.
- [ ] Minimize runtime fallback closures and record their exact dependencies.
- [ ] Add tests proving static code has no runtime style insertion or source
      runtime dependency.
- [ ] Add tests proving dynamic code remains behaviorally valid and is never
      silently converted into an incorrect static approximation.

### Phase 4 — complete hosts and scanners

- [ ] Route every consumer through the shared source workspace/scanner.
- [ ] Complete Vue SFC, Svelte, Astro, Solid, MDX, JSX dialect, and RSC
      language adapters.
- [ ] Add host-specific rewrite and hydration contracts.
- [ ] Add framework fixtures for client-only, server-only, and streaming
      components.

### Phase 5 — promote the adapter matrix

- [ ] Finish independent adapters for Emotion, MUI, Mantine, Vanilla Extract,
      Stitches, Linaria, JSS, Fela, Goober, Aphrodite, Treat, Compiled,
      Style9, Next-yak, and Solid/Vue styling systems.
- [ ] Clone one or two popular repositories per promoted source library into
      the reference repository store, pin commits, and keep them read-only.
- [ ] Run each migration through every exposed compatible target lane.
- [ ] Fix all safe residuals; retain only residuals proven to be genuine target
      capability gaps.

### Phase 6 — independent differential proof

- [ ] Compare canonical CSS and CSS size with an independent parser/oracle.
- [ ] Compare browser states, screenshots, computed styles, interactions, and
      responsive conditions.
- [ ] Compare SSR, hydration, and RSC/streaming output where applicable.
- [ ] Compare dependency/runtime artifacts and document intentional deltas.
- [ ] Require zero unexplained residuals and zero silent source drops.
- [ ] Promote an adapter into the real-proof matrix only after all applicable
      dimensions pass.

### Phase 7 — release and maintenance

- [ ] Run Knip and remove dead code/exports at the owning boundary.
- [ ] Run package typecheck, unit, integration, E2E, corpus, and release smoke
      suites.
- [ ] Publish the adapter SDK documentation and manifest/version policy.
- [ ] Record completed domains in the architecture documentation and update
      this plan with evidence and revision IDs.

## Open questions

- Which libraries should be promoted as first-party adapters versus community
  plugins after their real-repository proof passes?
- Which RSC and framework behaviors require a host compiler rather than a
  generic codemod rewrite?
- Which repositories can be cloned automatically in CI and which require an
  opt-in acceptance command due to licensing or size?
- What CSS equivalence normalization should be shared across browser and SSR
  validators without hiding meaningful injection-order regressions?

## Acceptance criteria

- [ ] Every registered adapter has a versioned manifest, independent owner
      module, declared capabilities, dependencies, validator, and conformance
      fixture.
- [ ] Every registered capability has at least one positive fixture and every
      unsupported path has a structured residual test.
- [ ] Static extraction is attempted first and runtime fallback is explicit,
      minimal, and dependency-closed.
- [ ] All supported source languages use the shared scanner contract.
- [ ] All supported backends and hosts pass their contract suites.
- [ ] Every promoted adapter has one or two pinned real repositories with
      successful build, route, browser, SSR/hydration, and CSS-size evidence.
- [ ] Differential reports prove no silent drops and classify every difference.
- [ ] Knip, typecheck, lint, unit, integration, E2E, corpus, and release smoke
      checks pass.
- [ ] Architecture docs, adapter SDK docs, proof matrix, and this plan agree
      with the code and current JJ history.
- [ ] The plan is not marked complete until every required checkbox is checked
      and the final evidence is reproducible.

## Decisions log

| Date       | Decision                                                                                                                    | Reason                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-08-30 | Define “any CSS-in-JS” by declared capabilities and proof, not an unconditional universal promise.                          | Runtime, framework, and plugin semantics have no guaranteed static equivalent.                  |
| 2026-08-30 | Keep the existing small authoring API frozen while expanding compiler, adapter, host, backend, and validation capabilities. | The pivot value is portability and proof, not API surface growth.                               |
| 2026-08-30 | Use a fresh JJ workspace based on `main` for this plan and implementation.                                                  | The default workspace has unrelated changes and multiple other migration workspaces are active. |

## Progress

Plan created in JJ workspace `pandwind-pivot-completeness`, based on
`main` at `77491442`. Implementation begins with Phase 1 after this plan is
recorded as its own focused revision.
