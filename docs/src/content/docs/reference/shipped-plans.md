---
title: Shipped plans and evidence
description: The user-facing record of completed Pandwind implementation waves and their proof boundaries.
sidebar:
  order: 1
---

The files in `plans/` are engineering records: they preserve decisions,
experiments, rejected options, and JJ revision history. This page translates
completed implementation work into the current product surface. The
[implementation status](/reference/implementation-status/) page remains the
source of truth when a plan and an older example disagree.

## Authoring, code generation, and runtime

### Typed utilities and tokens

`tw()` keeps Tailwind's overloaded utilities while exposing semantic subkeys
when the generated conflict map can prove the distinction:

```ts
tw({ textSize: "2xl", textColor: "gray-900", textAlign: "center" });
```

The same preset can feed DTCG token groups into a generated Tailwind v4
`@theme` stylesheet. Code generation writes the typed runtime, theme bridge,
and optional interop metadata; the real Tailwind compiler remains the
validation oracle. See [the `tw()` API](/api/tw/) and
[code generation](/tooling/codegen/).

### Compile-time composition and strategies

Literal `cx()` expressions are folded by the Vite compiler when their values
are provably static. Unknown identifiers, dynamic interpolations, spreads,
and unresolved style objects remain runtime expressions. The runtime merge
engine is independently optimized and keeps the same conflict semantics.

`ClassNameStrategy` is the target port for CSS naming. The built-in atomic,
named-atom, and Tailwind strategies prove that one style intent can be
emitted through different class systems without changing application code.
See [advanced mode](/guides/advanced/) and
[the Tailwind adapter](/interop/tailwind-adapter/).

### Dynamic values, themes, and layout

The static-first runtime boundary is explicit:

- `css.vars()` carries genuinely dynamic values through stable classes and
  inline custom properties;
- theme and component scopes emit deterministic variable blocks;
- route splitting and critical-CSS inlining are opt-in build policies;
- `pandwind.agents.json` exposes generated project context to tooling; and
- the erasable `pandwind/stack` helper provides a small renderer-neutral
  layout primitive with React, Solid, Vue, and Preact bindings; its default
  utility mapper is explicitly Tailwind-compatible, while `createStack(css)`
  routes every renderer through the supplied class-name strategy.

These features preserve the small frozen authoring API while moving runtime
work into compiler and host contracts. See [theming](/api/theming/),
[Vite plugins](/tooling/vite-plugins/), and [backends](/reference/backends/).

### Dynamic value lowering

Every dynamic styling value resolves to one of three honest outcomes. A
finite value set registers every possible output class (`tw()`) or folds the
static part and lowers the dynamic remainder through `css.vars()` /
`css.props()` (engine `css()`, JSX-position gated). A dynamic raw value that
exactly matches a configured token's resolved value emits the token spelling
instead of an arbitrary value, through a value-to-token catalog generated
next to the conflict map. Anything unbounded keeps runtime behavior and is
reported: `unresolvedTokens`/ `onUnresolved` for `tw()`, typed capability
residuals for codemod migrations. Values never silently disappear from
generated CSS. See [tw() dynamic values](/api/tw/), the
[css() vars carrier](/api/css/), and the codemod residuals in
[codemod tooling](/tooling/codemod/).

### Tooling and adoption closeout

The local codebase Migration Preview (053), token-governance ledger (054), non-CSS-in-JS
source adapters (055), renderer-neutral Stack bindings (056), and dynamic
lowering for every Pandwind API (057–058) are complete. Their focused tests,
typechecks, generated artifacts, and pinned-reference evidence are kept with
the repository plans. Migration Preview also has a real Chromium host proof for CSS
injection and computed-style evidence; static-only projects retain an explicit
unavailable preview state.

## Tooling and adoption proof

Plans 006, 009–013, 017, and 023 completed the operational layer:

- CI-facing size, benchmark, type, test, coverage, Knip, release-preflight,
  and pack-smoke gates;
- analyzer and inspector reports for fold coverage, residuals, provenance,
  authored CSS, CSS shape, budgets, and token usage;
- real dogfood migrations, including Kumo/8bitcn and the pinned website
  corpora; and
- a reproducible reference-repository workflow that keeps upstream sources
  outside this repository and checks them out by exact commit (plan 038 adds
  the offline coverage gate and the scheduled full-proof composition root).

Reproduce the checked-in corpus setup with:

```sh
pnpm run references:prepare
pnpm run pivot:proof
pnpm run test:all
pnpm run test:coverage
pnpm run knip
pnpm run release:check
```

The reference clones live under
`${PANDWIND_REFERENCE_ROOT:-~/.references}`. Pandwind tracks URLs, commits,
source paths, commands, and reports, not upstream source trees. Browser and
SSR claims are promoted only when their corresponding dimension was actually
executed; source-static evidence is intentionally not mislabeled as full
production proof. See [testing](/contributing/testing/) and
[adoption](/reference/adoption/).

The long-running reference workflows also have an optional Effect 4 tooling
implementation. It adapts Pandwind-owned task and filesystem ports to the
official Node services, providing bounded ordered batches, cancellation, and
task-scoped failures without adding Effect to the shipped runtime or Vite hot
path. This remains an internal tooling choice and can be replaced without
changing adapter or scanner contracts.

## Multi-target and migration contracts

### Backends

The resolved style IR is lowered through one backend contract with separate
CSS, React Native, React Strict DOM, and OpenTUI implementations. CSS owns
selectors, cascade, SSR, and browser artifacts; object backends own their unit,
condition, and capability policies. Canvas remains deferred until a concrete
consumer exists.

### React Strict DOM support

React Strict DOM has a target-owned style backend and
`pandwind/react-strict-dom` surface. Web uses StyleX-compatible compiled maps;
native uses the React Native object policy. The codemod recognizes `css.create`,
`html.*`, `style`, `css.keyframes`, and `css.defineVars` and preserves
`compat.native`, compiler themes, and host/provider behavior as typed residuals.
The package is not bundled into Pandwind; RSD remains responsible for its host
runtime and platform compiler. See [React Strict DOM integration](/interop/react-strict-dom/).

### Bidirectional codemods and Panda

The swap pipeline supports Pandwind-to-Pandwind and outbound routes through a
neutral IR, while Panda project migration is a staged pipeline for discovery,
theme loading, scanning, recipe/pattern extraction, semantic conversion,
module emission, rewrites, and validation. Panda recipes and patterns are
generated when representable; unsupported runtime behavior remains a
structured residual.

Token conversion uses one normalized token set between source and target
format adapters. Current formats include DTCG, Tailwind `@theme`, Panda,
Pandwind presets, Style Dictionary, Figma Tokens, root CSS variables, and
StyleX export.

See [codemods](/tooling/codemod/), [adapter migrations](/interop/css-in-js-adapters/),
and [the adapter contract](/reference/adapter-contract/).

### The CSS-in-JS pivot

The pivot is defined as a capability contract rather than an unconditional
claim that unrelated runtimes are interchangeable:

```text
source adapter → StyleProgram or SwapIR → lowering registry
              → target adapter/backend/host → validator → evidence report
```

The semantic `StyleProgram` carries rule-level globals, keyframes, font faces,
layers, supports, selectors, nesting, ordering, themes, composition, dynamic
expressions, runtime context, plugin transforms, framework metadata, and
provenance. `SwapIR` remains the cheaper path for literal declaration swaps.

Every ecosystem adapter declares detection, configuration, parsing, emission,
dependencies, capabilities, validation, and lossiness. Scanner, host,
backend, lowering, validator, and differential registries accept substitute
implementations. Built-in adapters are independently owned; third-party
plugins are discovered explicitly through the manifest contract.

Static extraction is attempted first. Runtime CSS is retained only when the
source value is genuinely dynamic and the target can preserve its behavior.
Otherwise the source remains in place with a structured residual and source
provenance. Differential proof covers canonical CSS, browser states,
SSR/hydration, streaming where applicable, dependencies, CSS size, and
residuals.

The final proof wave adds a reproducible adapter-reference runner. It verifies
all pinned non-project adapters at their exact source commits, exercises their
registered migration pipeline in Chromium, and records 23 passing
adapter-program references in `plans/evidence/adapter-reference-proof.json`.
This report is deliberately separate from installed-site promotion: the
checked-in production matrix remains the authority for framework builds,
application SSR, and route-level browser claims.

## Package and compiler closure

The final implementation wave closed the remaining package, compiler, and
adoption boundaries without expanding the frozen authoring API:

- Runtime code generation is opt-in through `pandwind-codemod runtime generate`.
  It shares the attachment registry and renderer with Vite pruning, emits
  deterministic typed modules, and supports freshness checks for non-Vite
  consumers.
- CSS/runtime/build factories accept an opt-in namespace for dynamic carriers,
  while caller-owned class strategies remain authoritative. `Stack` bindings
  can use the configured compiler strategy through `createStack(css)`; the
  bare helper remains the explicit Tailwind-compatible fast path.
- The safe CSS factory requires a preset. Generated and adapter-owned code can
  use the explicit `pandwind/unsafe/css` boundary, which keeps missing design
  system semantics visible instead of silently widening the canonical API.
- Component libraries can publish a versioned `pandwind.lib` artifact with
  extracted rules, token usage, provenance, and compatibility fingerprints.
  Consumers register artifacts explicitly; malformed, stale, or incompatible
  artifacts fail closed, while unregistered libraries keep source extraction.
- Preset layers separate structural CSS types from token-aware defaults, and
  generated CSS typings preserve accepted and rejected property/value
  combinations. Starter presets and reset/prose assets remain opt-in and are
  generated from pinned upstream sources with measured package-surface cost.
- Component-local `css.keyframes()` is a static, deterministic, tree-shakeable
  lane. Presets also provide a narrow build-time `web` contract for flat
  selector rules, explicitly named keyframes, and typed font faces; resets,
  layers, nesting, arbitrary at-rules, and host-owned selectors remain
  authored CSS. Named cascade layers use one validated outer layer across
  pure CSS, Vite, runtime sheets, and library artifacts.

The ecosystem starter-preset work remains active where its acceptance scope is
not yet closed. Unfinished generated assets, package surfaces, and measured
evidence stay in the engineering workspace until complete.

## Deliberately not complete

These records must not be presented as shipped product commitments:

- The Inspector UX review was non-blocking; presentation polish remains
  optional.
- Competitive research was point-in-time context, not a feature checklist.
- The third-argument `define.preset(theme, options, web)` contract is shipped for the narrow
  build-time surface described in [Preset contracts](/api/presets/); authored
  CSS remains the complete web-global escape hatch for broader syntax.
- Canvas and build-time Metro support remain extension points without a
  validated consumer.
- Tokenami and UnoCSS have documented token-bridge workflows but no dedicated
  semantic source adapters yet.
- Public npm publication still requires an operator, credentials, and a
  release changeset. Local release preflight and pack smoke are the proof
  boundary, not a publication claim.

When adding a new capability, update the owning adapter contract, add a
substitution/conformance fixture, add or update the relevant user-facing guide,
and record evidence in an active plan and proof artifact.
