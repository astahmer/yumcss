# Plan 040 — any-to-any semantic migration

## Context

Pandwind has the essential pivot substrate: a versioned semantic
`StyleProgram`, the flat `SwapIR` fast path, registry-backed source and target
adapters, shared scanning, official configuration-loader ports, host adapters,
lowering plugins, and differential proof tooling.

The remaining weakness is visible in the frequent
`pandwind:migrate-skip (adapter capability mismatch)` marker. The semantic IR
can describe more than the current lowering registry and target contracts can
prove. A capability gate is therefore rejecting programs before a complete
target-specific representation has been planned. The same generic marker is
also used for parse and lowering residuals, which hides the real reason.

## Goal

Make Pandwind a genuinely bidirectional pivot layer for every registered
source/target adapter pair. For every source `X` and target `Y`, migration must
either:

1. lower the source semantics losslessly to a static target representation;
2. use the smallest validated runtime carrier when static extraction is not
   possible; or
3. preserve the source and emit a structured, target-specific residual.

No semantic may disappear, and no route may fail with an unexplained generic
capability marker.

“100% done” means 100% of the declared capability contract has a tested route,
not that arbitrary undocumented plugins or impossible platform semantics can
be invented by the IR.

## Design principle

The HIR is the portability boundary, not the lowering itself:

```text
source adapter
  → project/document context
  → StyleProgram or SwapIR
  → semantic requirements
  → lowering planner
  → static target API / CSS variable / runtime carrier / residual
  → target adapter + host adapter
  → canonical, browser, SSR, hydration, and size validators
```

The planner must negotiate representations instead of treating
`exact | partial | unsupported` as the only decision. A `partial` capability
is useful only when a registered lowering proves how the specific semantic is
represented for that target.

## Workstreams

### 1. Make residuals truthful

- Split the generic marker into `capability-blocked`, `parse-residual`,
  `lowering-residual`, `host-rewrite-required`, and
  `configuration-residual` categories.
- Include source adapter, target adapter, semantic kind, exact requirement,
  available representations, and suggested lowering in the report.
- Keep the original source unchanged for every blocked route.
- Add tests proving that no marker is emitted without a structured reason.

### 2. Build a lowering planner

- Derive requirements from every `StyleProgram` node, including declarations,
  conditions, rules, themes, composition, runtime context, plugins, subjects,
  framework semantics, and provenance.
- Resolve target capabilities through a registry, then select ordered lowering
  strategies:
  static evaluation → target-native construct → custom property → runtime
  carrier → residual.
- Let source and target adapters contribute lowering strategies without adding
  ecosystem branches to orchestration.
- Preserve the flat `SwapIR` path for literal declaration swaps.
- Make lowering outcomes typed and independently testable.

### 3. Complete semantic lowering

Implement and validate target-specific lowerings for:

- runtime interpolations and theme callbacks;
- function-valued styles and prop wrappers;
- token access, variants, shortcuts, recipes, and composition;
- styled-component subjects, `attrs`, polymorphism, and standalone exports;
- JSS imperative rule application;
- plugin-generated styles and normalization transforms;
- globals, keyframes, font-face, layers, supports, selectors, nesting, and
  ordering;
- framework-specific React, Vue, Svelte, Astro, Solid, and native bindings;
- SSR, hydration, RSC, and streaming behavior.

Each lowering must declare whether it is static, runtime-backed, or residual
producing, and must carry provenance through the semantic IR.

### 4. Complete context and official configuration

- Load official ecosystem config, presets, plugins, themes, tokens, shortcuts,
  variants, and generated CSS whenever the package provides a loader.
- Pass the resulting project context to both source parsing and lowering.
- Make missing roots, unavailable packages, evaluation errors, and unsupported
  config constructs explicit configuration residuals.
- Add context fixtures for custom Panda, Chakra, Tailwind, UnoCSS, Tokenami,
  StyleX, Stitches, Vanilla Extract, MUI, and Mantine projects.

### 5. Make adapter contracts representation-aware

- Keep the public adapter boundary versioned and interface-first.
- Add internal representation requirements and lowering registrations without
  making the migration runner import concrete ecosystem modules.
- Require every adapter to expose one plugin object owning detection, config,
  parsing, normalization, emission, dependencies, host rewrites, validation,
  capabilities, and lossiness.
- Add substitution tests using fake adapters and fake lowerings.

### 6. Prove the complete matrix

For every registered source and target pair:

- unit tests cover happy declarations, conditions, rules, dynamics, themes,
  composition, and edge syntax;
- integration tests run the real adapter registry, scanner, config loader,
  lowering planner, emitter, and validator;
- browser tests cover computed styles and host behavior;
- SSR/hydration tests cover server markup, client replacement, and duplicate
  style prevention;
- RSC/streaming tests run where the host supports it;
- canonical CSS and output-size comparisons are recorded;
- residual tests prove unsupported semantics remain visible and actionable.

The existing Cartesian route test is the baseline: it invokes all 576
registered routes and rejects silent outcomes. It must be upgraded from
“conversion or residual exists” to capability-specific proof once each
lowering is implemented.

### 7. Enforce completion in CI

CI must fail when:

- a declared capability has no lowering or proof;
- a route emits a generic capability marker without a detailed cause;
- an unsupported construct disappears;
- a registered adapter lacks direct, integration, and browser evidence;
- static-first conversion unnecessarily emits runtime code;
- browser bundles include Node-only paths;
- canonical CSS, browser state, SSR, hydration, or size proof regresses;
- Knip finds unowned adapter/lowering/validator exports.

## Acceptance checklist

- [x] Every marker explains the actual semantic blocker.
- [x] Configuration failures are source-visible and categorized separately.
- [x] Lowering plans expose the selected and available representations.
- [ ] Every HIR construct has a target lowering, runtime carrier, or residual.
- [ ] Every registered source×target route is exercised in both modes.
- [ ] Static extraction wins whenever the source is statically representable.
- [ ] Runtime fallback is emitted only for genuinely dynamic semantics.
- [ ] Framework host rewrites are AST/scanner-backed and validated.
- [ ] Official configuration is used whenever available and failures are
      explicit.
- [ ] Every adapter passes unit, integration, browser, SSR, hydration, and
      applicable streaming proofs.
- [ ] The full route matrix and residual policy are enforced in CI.
- [ ] Documentation describes the actual proof boundary and no longer implies
      that a generic capability marker is an acceptable final outcome.

## Current implementation evidence

The first wave is implemented and tested in focused JJ revisions:

- typed migration diagnostics distinguish configuration, parse, lowering, and
  capability outcomes;
- the lowering registry composes source/target adapter-owned strategies and
  clears residuals explicitly when a later strategy replaces them;
- the semantic parser folds literal arithmetic, conditionals, and template
  interpolations before target negotiation;
- the existing Cartesian route test remains green and the flat `SwapIR` path
  remains unchanged;
- migration results expose one representation plan per parsed match, and the
  bidirectional matrix now includes dynamic, malformed, and framework-shaped
  edge cases for every registered adapter in both directions;
- partial target-native dynamic support is accepted only when the lowering
  planner explicitly resolves the corresponding capability and the emitted
  result passes the target validator.
- named style maps are represented as named rule nodes with a dedicated
  `named-rules` capability, so targets without a class-map representation
  report the real semantic limitation instead of mislabeling it as a CSS
  condition mismatch.

The remaining checkboxes are intentionally still open until each capability
family has a concrete lowering and differential proof rather than only a
route-level outcome.

## Non-goals

- Adding more author-facing APIs; `tw`, `css`, `cx`, and design presets remain
  frozen.
- Replacing or removing the flat `SwapIR` fast path.
- Claiming to translate undocumented library plugins without a project
  context, adapter contract, and proof.
- Silencing residuals to make a matrix green.

## JJ execution order

Use focused revisions in this order:

1. residual taxonomy and diagnostics;
2. lowering planner and representation contracts;
3. semantic lowerings, one capability family at a time;
4. official context/configuration completion;
5. Cartesian unit/integration matrix promotion;
6. browser/SSR/hydration/streaming proof promotion;
7. CI/docs completion and final audit.
