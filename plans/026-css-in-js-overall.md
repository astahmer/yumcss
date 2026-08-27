# CSS-in-JS overall plan

**Status: COMPLETE — scoped foundation wave; rule-level and adapter work landed
in the follow-on CSS-in-JS pivot plan.**

## Context

pandwind already has a strong static styling foundation: typed `tw()` and
`createDesignCss()`, atomic CSS classes, Tailwind parity, `cx()` conflict
merging, static extraction, dynamic custom-property values, theme scopes,
unplugin adapters, analyzer/inspector tooling, and runtime-size budgets.

The broader CSS-in-JS goal needs five focused improvements before any further
feature expansion:

1. an explicit compatibility scorecard and contract;
2. a genuinely useful typed general `css()` lane;
3. authored CSS primitives and a complete dynamic-value contract;
4. SSR/RSC and framework integration proof;
5. source provenance, diagnostics, and inspector metadata.

The user-facing API remains deliberately minimal per `AGENTS.md`. Recipe and
composition APIs are explicitly deferred to a separate dedicated session.
Release, publishing, and external distribution work are also out of scope.

## Goal

Make pandwind a trustworthy, typed, low-runtime CSS-in-JS system for static
and dynamic web styling, with explicit capability boundaries and proof across
the main rendering and bundler environments.

The result should be safe to adopt incrementally: static styles compile away,
dynamic values have a documented escape hatch, unsupported semantics fail
loudly, and every generated rule can be traced back to authored source.

## Outcome

The five-revision foundation is complete, with explicit boundaries where the
broader pivot still needs work:

- [x] The capability scorecard and capability vocabulary are implemented and
      documented.
- [x] General `createCss(preset)` is preset-bound, typed, and covered by
      positive and negative type tests.
- [x] Dynamic values have a stable custom-property contract, including
      fallback behavior and SSR-safe `{ class, style }` output.
- [x] The runtime sheet supports deterministic registration, extraction,
      hydration, ordering, deduplication, and optional DOM insertion.
- [x] Static extraction carries source provenance and capability metadata.
- [x] SSR/style idempotence and shared Vite/unplugin integration contracts are
      tested.
- [ ] First-class global rules, keyframes, font-face, layers, supports, and
      custom-property definitions remain a separate rule-level IR wave; the
      current docs explicitly keep these in the CSS escape hatch.
- [ ] Browser differential fixtures, streaming/RSC adapters, and external
      CSS-in-JS migration adapters remain part of the broader pivot plan.

The scoped foundation is therefore complete; the overall CSS-in-JS pivot is
still in progress under `plans/025-css-in-js-pivot.md`.

The subsequent full-pivot implementation added the rule-level semantic IR,
adapter contract v2, external adapters, differential validation, recipes, and
host contracts. This plan remains the historical foundation scope; its
remaining unchecked items are intentionally tracked as integration-hardening
work in plan 025.

## What

### Revision 1 — compatibility scorecard and contract

- Add a maintained scorecard covering authoring, CSS fidelity, dynamic values,
  SSR/RSC, bundlers/frameworks, DX, performance, and migration safety.
- Define terminology for static, runtime, extracted, partially supported, and
  unsupported behavior.
- Add a capability manifest suitable for docs, diagnostics, and future adapter
  checks without adding a new app-facing styling API.
- Record measurable acceptance thresholds for runtime size, build output,
  hydration correctness, and source provenance.

### Revision 2 — typed general `css()` lane

- Make the documented `createCss(preset)` story accurate and ergonomic, or
  explicitly correct the docs if the API remains generic by design.
- Type ordinary CSS properties, preset token references, recursive conditions,
  selectors, and escape hatches.
- Add direct type tests for the general CSS lane, not only the design vocabulary.
- Preserve `createDesignCss()` as the constrained design-intent lane.

### Revision 3 — authored CSS primitives and dynamic contract (deferred decision)

- Decide in a dedicated session whether global rules, keyframes, font-face,
  cascade layers, `@supports`, and custom property definitions remain
  unsupported or get a minimal build-time mechanism.
- Define deterministic ordering, deduplication, hashing, and debug behavior
  for these constructs.
- Fully specify `css.vars()` behavior for SSR, hydration, fallback chains,
  custom properties, transitions, and invalid values.
- Keep DOM insertion optional and isolated from non-DOM/native backends.

### Revision 4 — SSR/RSC and framework fixture matrix

- Add real browser fixtures for static extraction and runtime dynamics.
- Add SSR extraction and client hydration tests, including streaming-safe
  behavior and duplicate-rule prevention.
- Add documented fixtures for Vite, Next/Webpack, Rollup, and one unplugin
  non-Vite target first; expand only when the shared contract is proven.
- Add React RSC guidance and a capability boundary for non-React hosts.

### Revision 5 — provenance, diagnostics, and inspector metadata

- Attach internal source ranges and module identity to extracted rules and
  residuals without changing the stable class-name API.
- Produce actionable errors for unsupported constructs, missing extraction,
  hydration mismatch, and invalid dynamic values.
- Extend analyze/inspector payloads with class → rule → source provenance,
  capability status, and extraction/runtime reasons.
- Add a debug report that can be consumed by the existing inspector and CLI.

## Why

The current engine is strongest when styles are statically analyzable. The
missing confidence layer is not another styling syntax; it is a clear contract
for what happens when styles are static, dynamic, server-rendered, extracted,
or unsupported. This is what lets pandwind compete with runtime systems on
flexibility while retaining its advantages in size, determinism, and proof.

## How

### Conceptual model

```text
typed authoring API
        ↓
canonical style program / capability classification
        ↓
static extractor ───────────────┐
runtime sheet + dynamic vars ───┼─→ ordered CSS + provenance
SSR/RSC adapter ────────────────┘
        ↓
browser, framework, analyzer, inspector
```

The existing flat declaration IR remains the fast path. Richer authored
constructs and provenance are represented in an internal versioned program so
the flat path does not become ambiguous.

### Tech choices

| Choice               | Decision                                                             | Rationale                                                            |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Public API growth    | Minimal and design-reviewed                                          | Preserve pandwind's small surface and avoid a recipe-style expansion |
| Static/runtime split | Static extraction first, runtime sheet only for proven dynamic cases | Keeps ordinary output small and makes runtime cost explicit          |
| CSS identity         | Deterministic structural identity plus source metadata               | Class names remain stable while diagnostics can identify origins     |
| SSR insertion        | Adapter-owned extraction/hydration contract                          | Avoid hidden DOM globals and support streaming hosts                 |
| Framework breadth    | Shared core plus tested fixtures                                     | Do not claim support based only on unplugin compilation              |
| Release/publishing   | Deferred                                                             | User explicitly requested no release work in this wave               |
| Recipes/composition  | External CVA-style packages are supported; no Pandwind recipe API    | User explicitly requested this exclusion                             |

## What this allows

- A documented, measurable definition of pandwind CSS-in-JS support.
- Typed general CSS authoring alongside the constrained design vocabulary.
- Static and dynamic styles with deterministic, testable behavior.
- Proven SSR/RSC and bundler integration rather than assumed compatibility.
- Source-level debugging of generated classes and extracted CSS.

## What this does not allow

- No recipe, slot, `styled()` or component-composition API in this wave.
- No npm publish, release automation, provenance setup, or public distribution.
- No silent approximation of unsupported selectors, CSS rules, or runtime
  expressions.
- No hidden global stylesheet injection for native or non-DOM targets.
- No claim that every framework is supported until it has a fixture and gate.

## UI & UX

No new end-user styling UI is required. The existing inspector gains metadata
needed for debugging:

```text
class / rule
  ├─ authored module and source range
  ├─ static | runtime | partial | unsupported
  ├─ emitted CSS and conditions
  └─ suggested fix or escape hatch
```

The CLI should expose the same facts in machine-readable form for CI and
editor integrations.

## Data model

No persistent database is needed. Add versioned internal records for:

```ts
interface StyleCapabilityRecord {
	feature: string;
	status: "static" | "runtime" | "partial" | "unsupported";
	reason?: string;
}

interface StyleProvenance {
	module: string;
	start: number;
	end: number;
	callKind: string;
}
```

The exact internal shape may evolve; generated analyzer payloads must carry a
schema version.

## Implementation steps

1. Commit this plan and confirm the five-revision scope.
2. Implement the scorecard, capability vocabulary, and contract tests.
3. Fix or clarify the general `createCss` typing contract and add type tests.
4. Implement authored CSS primitives and dynamic-value tests behind the
   smallest approved surface.
5. Add SSR/RSC and framework fixture coverage with browser assertions.
6. Thread provenance and capability diagnostics through extraction and
   analyzer/inspector output. **Landed:** source ranges, emitted rule links,
   unsupported-construct diagnostics, and missing-extraction diagnostics.
7. Run all gates, inspect each jj revision, and update this plan's outcomes.

## Open questions

1. Should authored global/keyframe/font-face support be a small explicit API,
   or a build-time CSS entry mechanism that keeps the runtime API unchanged?
2. What is the minimum React streaming/RSC adapter contract that can be
   documented without depending on a specific application framework?
3. Should source provenance be emitted only in debug/analyze mode, or be
   retained in a development-only virtual module by default?

## Acceptance criteria

- [x] The scorecard and capability vocabulary are committed and referenced by
      docs/tests.
- [x] General `createCss` behavior matches its documentation and has direct
      positive and negative type tests.
- [x] Dynamic values and the runtime sheet have deterministic ordering,
      deduplication, SSR-safe extraction, hydration, fallback, and invalid
      input coverage.
- [x] Global/keyframe/font-face/layer primitives are explicitly documented as
      unsupported until the rule-level semantic IR wave.
- [x] Static extraction and analyzer payloads carry rule-to-source provenance;
      end-to-end runtime inspector links remain a broader pivot item.
- [x] Runtime-size and existing parity gates remain green for this wave.
- [x] Browser differential fixtures and external CSS-in-JS adapter round trips
      are covered by the follow-on pivot implementation.
- [x] No recipe/composition or release/publish changes are included.
- [x] Web authored CSS has an explicit import contract and tooling visibility;
      first-class TypeScript primitives use the rule-level semantic IR path.
- [x] Analyzer/inspector output can map an extracted rule identity/CSS back to
      its source call site when the matching preset is available.
- [x] Analyze JSON and human output report actionable unsupported-construct and
      missing-extraction diagnostics.
- [x] Runtime-size and existing parity gates remain green.
- [x] No recipe/composition or release/publish changes are included.

## Decisions log

| Date       | Decision                                   | Rationale                                                                                      |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 2026-08-26 | Work in a new jj workspace                 | Keep this wave isolated from existing runtime and codemod workspaces                           |
| 2026-08-26 | Implement revisions 1–5 only               | User selected the first five roadmap revisions                                                 |
| 2026-08-26 | Defer recipes/composition                  | User will handle that in a separate dedicated session                                          |
| 2026-08-26 | Defer release/publishing                   | User explicitly requested no release work yet                                                  |
| 2026-08-26 | Preserve the minimal public API by default | Repository API-surface policy requires design notes for additions                              |
| 2026-08-27 | Defer authored CSS primitive decisions     | Globals, keyframes, font-face, layers, `@supports`, and `@property` will be planned separately |
