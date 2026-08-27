# CSS-in-JS pivot plan

**Status: IN PROGRESS — first full pivot implementation landed; integration hardening remains**

## Context

pandwind already has three complementary layers:

1. a typed utility surface (`tw()`),
2. an atomic/design-vocabulary surface (`css()` and `createDesignCss()`), and
3. build-time tooling for extraction, merging, analysis, and codemods.

The current CSS backend is intentionally small and fast, but the product goal is
broader: pandwind should be a first-class CSS-in-JS system while also being the
pivot that makes migration between CSS-in-JS systems practical.

The existing implementation is strongest for static declarations. Its flattened
IR and `ClassNameStrategy` do not yet model the full CSS-in-JS problem: runtime
injection, dynamic values, SSR/hydration, global rules, keyframes, selectors,
layers, recipes, component composition, and host-framework behavior.

The codemod direction already has a useful neutral IR, but it must become
project-aware and must preserve authored token identity and non-declaration
semantics. It must not be coupled to the example preset.

## Current outcome

The first complete implementation slice now exists:

- rule-level semantic IR `/2` with ordered style/global/keyframes/font-face/
  layer/supports/property nodes and canonical serialization;
- adapter contract `/2` with detection, project config, parse/emit,
  dependencies, capabilities, validation, and explicit residuals;
- pandwind, Emotion, styled-components, vanilla-extract, and Stitches object
  adapters;
- canonical/browser-hook/SSR-hydration differential validation;
- recipe/component IR plus runtime recipes and slot recipes;
- renderer-neutral React, Preact, Solid, Vue, Svelte, and Astro host contracts.

This is a deliberately breaking internal contract revision: pandwind owns the
adapter and semantic-IR API, so there is no compatibility shim for the old
capability schema or style-program schema. The flat `SwapIR` path remains the
performance path for literal declaration swaps.

Remaining hardening is concrete rather than conceptual: real browser and
framework fixtures, project config/package detection, tagged-template parsing,
first-class authored rule runtime APIs, and complete bidirectional round trips
for each external library.

## Goal

Make pandwind a verifiable, typed, runtime-capable CSS-in-JS system whose
semantic compiler and adapter toolkit can safely migrate static and dynamic
styles to or from other CSS-in-JS systems, with explicit residuals whenever an
equivalent translation is impossible.

## What

### Runtime CSS-in-JS

- Runtime stylesheet insertion with deterministic ordering and deduplication.
- SSR extraction and client hydration without duplicate rules.
- Streaming/RSC-safe integration guidance and tests.
- Dynamic values through stable custom-property rules where possible.
- Authored global styles, keyframes, font-face, layers, supports, and property
  primitives.
- Stable debug/provenance metadata for class names and emitted rules.
- Explicit CSP/non-DOM adapter boundaries rather than hidden browser globals.

### Semantic compiler and migration pivot

- A versioned semantic style IR above the existing flat declaration IR.
- Project context loaded from generated metadata and the host preset/config.
- Token graph preservation: aliases, semantic modes, type, provenance, and
  ambiguity reporting.
- Structured conditions and selectors instead of condition-name strings only.
- Recipe/component IR for variants, defaults, compound variants, slots,
  polymorphism, prop filtering, and composition.
- Adapter contracts covering detection, config loading, parsing, emission,
  capabilities, dependencies, and validation.
- Safe and partial migration modes with machine-readable residual reports.

### Adapter coverage

First-class static and dynamic adapters, prioritized by real demand:

- pandwind, Tailwind, Panda, and StyleX: harden the existing adapters;
- Emotion and styled-components;
- vanilla-extract and Stitches;
- Linaria/JSS where their semantics can be represented;
- Vue, Svelte, Astro, Solid, and Preact host syntax adapters.

Each adapter must declare what it supports. “Any CSS-in-JS system” means any
system with an adapter and a declared semantic capability boundary; it does not
mean silently approximating incompatible behavior.

## Why

The strongest product position is not another isolated styling syntax. It is a
style system that can be adopted incrementally, run at runtime when needed,
compile away when possible, and prove what changed during migration.

This also gives pandwind a practical escape hatch: teams can start from
Emotion, styled-components, Panda, StyleX, vanilla-extract, or raw CSS and
move toward pandwind without a rewrite cliff. They can also export selected
surfaces when a library boundary or platform requires another system.

## How

### Layering

```text
authoring / host-library syntax
        ↓
source adapter + project context
        ↓
semantic StyleProgram IR
        ↓
target adapter / pandwind backend
        ↓
runtime sheet, extracted CSS, class strings, or native objects
```

The existing `StyleBackend` remains the low-level terminal lowering boundary.
`ClassNameStrategy` remains a class-naming concern. The richer adapter contract
must not overload either one.

### IR requirements

The semantic IR must preserve, where present:

- declarations and shorthand intent;
- token references plus resolved values;
- structured pseudo/media/container/supports conditions;
- selectors, nesting, specificity, layers, and ordering;
- globals, keyframes, font-face, and custom-property definitions;
- dynamic expressions with source ranges and safe-lowering hints;
- recipes/components and their variant semantics;
- source provenance and residuals.

The current flat declaration IR remains a fast, lossless subset for simple
objects. It should be versioned rather than stretched until it becomes
ambiguous.

### Runtime contract

Runtime CSS-in-JS is part of pandwind’s product, not merely a fallback. The
runtime must expose a small stable contract around:

- registering deterministic rules;
- inserting or extracting the current sheet;
- hydrating an existing sheet;
- resolving dynamic values to custom properties when safe;
- preserving rule order across server and client;
- resetting/disabling DOM insertion for SSR, tests, and native hosts.

The public authoring API stays minimal unless a design note and concrete
consumer justify an addition. New complexity should live in the runtime sheet,
semantic IR, generated modules, and adapters first.

### Safety model

- `safe` mode rewrites only proven-equivalent constructs.
- `partial` mode can split static and dynamic pieces when the target semantics
  are explicit and testable.
- Every residual retains source text, source range, reason, and suggested action.
- Every adapter declares exact, lossy, and unsupported mappings.
- Validation compares canonical emitted CSS and representative browser states,
  plus SSR/hydration where applicable.

## What this allows

- Runtime CSS-in-JS for styles that cannot be statically extracted.
- Zero-runtime output for styles that can be compiled away.
- Incremental migration from and to multiple CSS-in-JS ecosystems.
- Shared tokens, conditions, and design semantics across web and native targets.
- Generated migration reports that are useful as CI budgets and manual worklists.
- A stable adapter ecosystem without multiplying pandwind’s core API.

## What this does not allow

- Silent dropping of unsupported styles.
- Claiming semantic equivalence for selectors, cascade, or runtime behavior that
  the target cannot express.
- Treating `tw()` as the universal portable IR; the semantic CSS layer is the
  portability boundary.
- Making every external runtime library a permanent pandwind dependency.
- Expanding the core API with recipes, `styled`, or arbitrary convenience
  surfaces before the semantic/runtime contracts are proven.

## UI & UX

No new end-user UI is required for the foundation wave. The developer-facing
experience should provide:

- readable debug class/rule provenance;
- an inspectable runtime sheet;
- CLI reports showing exact, partial, and residual conversions;
- devtools/inspector links from emitted classes back to source call sites.

## Data model

Introduce a versioned semantic style program internally, with separate records
for declarations, conditions/selectors, dynamic expressions, tokens, recipes,
and residuals. Generated metadata must include a schema version and the project
context used to produce it.

## Implementation steps

1. Write the compatibility scorecard and freeze the semantic/runtime contracts. **Complete.**
2. Remove codemod coupling to `examplePreset`; add project context and generated
   interop metadata. **Complete for the current codemod path; config discovery hardening remains.**
3. Version and extend the semantic IR while retaining the flat fast path. **Complete:** rule-level `/2` nodes now preserve structured conditions, selectors, nesting, dynamic expressions, source ranges, ordering, and non-declaration rules.
4. Build the runtime sheet: insertion, extraction, hydration, ordering, and
   dynamic custom-property lowering. **Foundation complete:** the runtime
   sheet, snapshots, hydration, ordering, and `css.vars()` contract exist;
   host/framework adapters and browser fixtures remain.
5. Add global/keyframe/font-face/layer primitives and their extraction parity.
   **Not complete:** these are still explicit unsupported/escape-hatch
   boundaries in the current authoring contract.
6. Add SSR/RSC/framework fixtures and a browser differential harness.
   **Partial:** server-safe values, stylesheet idempotence, and shared
   unplugin coverage are tested; streaming/RSC and browser differential gates
   are still needed.
7. Harden existing adapters, then add Emotion, styled-components,
   vanilla-extract, and Stitches adapters. **Foundation complete:** the
   versioned adapter capability contract and semantic source path exist;
   external system adapters and end-to-end round trips remain.
8. Add recipe/component semantics and host-framework adapters where the
   capability matrix supports them. **Initial implementation complete:**
   recipe/slot IR, runtime recipes, and six host contracts exist; framework
   fixture and component composition hardening remains.
9. Document migration recipes and publish the adapter contract. **Partially
   complete:** the internal contract and scorecard are documented; public
   migration recipes and publishing remain.

### Remaining completion waves

The broad CSS-in-JS pivot is not complete yet. The next implementation order
is:

1. **Rule-level semantic IR:** add versioned records for global rules,
   keyframes, font-face, layers, supports, custom-property definitions,
   selectors/nesting, specificity, and ordering. Preserve the existing flat
   `SwapIR` path for literal declaration objects.
2. **Adapter contract v2:** extend capability contracts with detection,
   config loading, dependency declarations, parse/emit hooks, validation,
   and explicit lossiness. Keep safe mode untouched and partial mode
   machine-readable.
3. **First external adapters:** implement differential fixtures and
   bidirectional mappings for Emotion and styled-components first, then
   vanilla-extract/Stitches based on the capability scorecard.
4. **Differential validation:** compare canonical CSS, representative browser
   states, SSR output, hydration, ordering, and residual reports. Make this a
   migration CI gate rather than an adapter-specific best effort.
5. **Recipes/components and host frameworks:** only after the rule-level and
   adapter contracts can represent their semantics without silently
   approximating them.

## Acceptance criteria

- Runtime CSS injection, SSR extraction, and hydration are deterministic and
  deduplicated.
- Dynamic value tests prove safe custom-property lowering and fallback behavior.
- Global styles, keyframes, font-face, layers, and supports rules have runtime,
  extraction, and ordering tests.
- No codemod path imports or depends on `examplePreset`.
- Static round trips preserve canonical declarations and token identity.
- Unsupported constructs produce actionable residuals and never disappear.
- Adapter capability mismatches fail loudly or remain untouched in safe mode.
- At least two external CSS-in-JS systems pass source, output, SSR, and browser
  differential fixtures.
- Runtime size, build time, CSS size, and migration coverage remain budgeted.

## Open questions

- Which runtime sheet insertion strategy is the default: `<style>` tags,
  constructable stylesheets, or a selectable policy?
- Which dynamic expressions can be lowered automatically without changing
  precedence or serialization semantics?
- Do recipe/component primitives remain generated modules, or does a concrete
  consumer justify a small approved authoring API?
- What is the minimum SSR contract for non-React hosts?

## Decisions log

| Date       | Decision                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-26 | Runtime CSS-in-JS is an explicit product goal, not merely a build-time fallback.                                                              |
| 2026-08-26 | Keep the core authoring surface minimal; put interoperability in the semantic IR, runtime sheet, adapters, and tooling.                       |
| 2026-08-26 | Preserve the existing flat declaration IR as a fast subset and add a versioned semantic IR for richer constructs.                             |
| 2026-08-26 | Use safe-by-default migrations with explicit partial mode and residual reporting.                                                             |
| 2026-08-26 | The codemod must load the project’s real preset/config; `examplePreset` is test data only.                                                    |
| 2026-08-27 | Generated bridge metadata is the CLI discovery boundary for project tokens; missing token context remains conservative and explicit.          |
| 2026-08-27 | Dynamic source objects get a parallel semantic parse; the literal parser and `SwapIR` remain conservative and unchanged for the fast path.    |
| 2026-08-27 | Adapter contracts are versioned separately, classify exact/partial/unsupported capabilities, and enforce only when a caller opts into a mode. |
| 2026-08-27 | The user approved breaking our own internal API: semantic style programs and adapter capabilities move to `/2` without compatibility shims.   |
| 2026-08-27 | Rule-level IR is the portability boundary; the flat `SwapIR` declaration path remains as an explicit fast projection.                         |
| 2026-08-27 | External adapters share one v2 protocol; unsupported dynamic values produce residuals in safe mode instead of guessed output.                 |
