# Plan 041 — any adapter to any adapter, in either direction

## Goal

Pandwind should be a genuine pivot library: for every registered source and
target adapter, migration must work in either direction through one semantic
boundary. A route such as `X → Y` must not be a bespoke converter, and `Y → X`
must not be a second special case. Both routes use the same source adapter,
semantic program, lowering planner, target adapter, host integration, and
validators.

The versioned `StyleProgram`/HIR is necessary but not sufficient. It preserves
meaning; it cannot manufacture a target representation that the target API or
host does not provide. Therefore every semantic must end in exactly one of:

1. a lossless static target representation;
2. the smallest validated target-native or host runtime carrier; or
3. unchanged source plus a structured, target-specific residual.

No route may silently discard semantics, and no route may expose the obsolete
generic `adapter capability mismatch` diagnosis.

## Current evidence and known gap

The current registry and route matrix exercise all registered pairs and retain
the flat `SwapIR` fast path. Named style maps and function-valued styles now
have explicit representation contracts. The remaining work is to turn that
contract into complete, production-level coverage rather than merely making a
fixture matrix green.

The most important unresolved families are:

- runtime interpolations, themes, and function-valued styles;
- named maps, composition, recipes, and variant systems;
- styled-component subjects, `attrs`, polymorphism, and use-site rewrites;
- JSS imperative rule application and plugin-generated styles;
- globals, keyframes, font-face, layers, supports, selectors, nesting, and
  ordering;
- framework props/bindings across React, Preact, Vue, Svelte, Astro, Solid,
  React Native, and OpenTUI;
- official project configuration, presets, plugins, generated CSS, and custom
  token/shortcut/variant context;
- SSR, hydration, streaming/RSC, injection order, and dependency changes.

## Workstreams

### 1. Freeze one route architecture

- Keep one versioned adapter/plugin contract containing identity, detection,
  configuration, parsing, emission, dependencies, capabilities, lowering,
  validation, lossiness, host rewrites, and provenance.
- Keep ecosystem behavior inside one adapter plugin/folder. Shared orchestration
  must only depend on ports and registries.
- Make representation negotiation explicit: static map, class map, native
  map, component wrapper, custom property, runtime carrier, or residual.
- Make capability and representation IDs typed and registry-owned.
- Add substitution tests proving that a fake source/target/lowering/host can be
  registered without editing the orchestrator.

### 2. Complete semantic lowering

For every HIR node and metadata field, add a registered lowering strategy and
target-specific proof:

- literal and token values;
- theme reads, theme callbacks, and project token context;
- dynamic scalar values and function-valued styles;
- named maps, variants, recipes, composition, and ordered precedence;
- component subjects, custom subjects, `attrs`, polymorphic `as`, and wrapper
  props;
- globals, keyframes, font-face, layers, supports, property rules, selectors,
  nesting, and order;
- plugin transforms and generated declarations;
- framework-specific prop/style/class bindings;
- runtime context, SSR, hydration, RSC, and streaming metadata.

Every lowering must state whether it is static, target-native, host-runtime,
or residual-producing, preserve provenance, and be independently unit tested.

### 3. Complete official project context

- Use official loaders when an ecosystem exposes them.
- Load custom presets, plugins, themes, tokens, shortcuts, variants, generated
  CSS, and framework configuration through adapter-owned ports.
- Pass normalized context into parsing, lowering, emission, and validation.
- If a loader is missing, fails, or cannot evaluate a construct, emit an
  explicit configuration residual; never silently fall back while claiming
  full parity.
- Add fixtures for customized Panda, Tailwind, UnoCSS, Chakra, MUI, Mantine,
  Tokenami, StyleX, Stitches, Vanilla Extract, and the remaining adapters.

### 4. Make every direction testable

For every registered pair `X × Y`, test both directions and both capability
modes:

- unit: parser, semantic normalization, lowering, emitter, validator, and
  residual edge cases;
- integration: real registry, scanner, project context, route orchestration,
  import/dependency rewrite, and idempotency;
- browser: computed styles, pseudo states, responsive states, injection order,
  and host behavior;
- SSR/hydration: markup, CSS, style deduplication, and client replacement;
- streaming/RSC where the host supports it;
- canonical CSS and size comparison;
- structured residual and lossiness assertions.

A route that cannot be fully represented is still a passing safety outcome only
when its residual is explicit, source-preserving, and actionable. A green route
count alone is not proof.

### 5. Promote reproducible real repositories

- Pin one or two real repositories per supported source ecosystem by commit.
- Keep repositories out of the product tree; provide a deterministic materialize
  and migration script with commit hashes and dependency lock information.
- Run every supported Pandwind target API against each corpus where the source
  semantics make that route meaningful.
- Require build, typecheck, lint, browser, SSR, hydration, applicable streaming,
  canonical CSS, bundle-size, and residual checks.
- Record per-adapter/per-capability evidence, manual fixes, and remaining
  residual classes.

### 6. Enforce completion gates

CI must fail when:

- a registered adapter lacks direct, integration, and real-corpus evidence;
- a declared capability has no lowering and meaningful proof;
- unsupported semantics disappear without a residual;
- a static input unnecessarily uses a runtime carrier;
- a runtime fallback lacks a host/configuration proof;
- a route emits the obsolete generic capability marker;
- browser output includes Node-only code;
- canonical CSS, browser, SSR, hydration, streaming, or size parity regresses;
- Knip finds unowned exports or generated artifacts are mistaken for source.

## Definition of done

The plan is complete only when each registered adapter can be selected as source
or target, every pair is exercised in both directions, every declared
capability has a passing proof, and every undeclared/unrepresentable semantic
produces a structured residual. Static extraction wins whenever source meaning
is statically knowable; runtime is a rare, validated fallback. The final docs
must state the exact proven capability boundary and include reproducible commands
for the matrix and real-repository corpora.

## Execution order

`route architecture → semantic lowering → official context → bidirectional
contract suites → real-repository promotion → browser/SSR/RSC proof → CI/docs
completion`.

Each workstream is delivered in focused JJ revisions with its own tests and
evidence. Do not mark this plan complete because a residual matrix is green;
completion requires the stronger gates above.
