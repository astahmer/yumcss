# Lazy runtime methods plan

Status: rejected for the runtime-only implementation; compiler-aware pruning
is the accepted delivery mechanism.

## Context

Pandwind’s callable runtime factories are deliberately small at the API
surface, but `createCss()` currently allocates every attached method and its
closure for every factory instance. The public type promises that `vars`,
`class`, `raw`, `props`, `group`, and `input` exist, while most applications
use only a subset. This is the same shape as the problem described in Zod’s
method-memoization work: eager bound methods cost retained memory even when
never accessed.

Pandwind is not a schema-object library, so the optimization must be scoped.
The runtime’s main hot path is calling the root style function and resolving
already-created `cx`/atom state. Lazy properties must not add a branch to
those paths, change the public typings, or make frequently used methods slower
after their first access.

## Goal

Reduce retained memory for unused runtime API methods while preserving the
existing frozen API, behavior, bundle budgets, and hot-path performance.

## What

- Lazily define attached `createCss()` methods as memoizing accessors.
- Materialize each method once, replace the accessor with a normal data
  property, and preserve enumerable/writable/configurable behavior.
- Keep the root callable `css()` path eager and branch-free.
- Measure descriptor shape, first access, repeated access, output parity, and
  browser bundle size.
- Evaluate the same technique for `createCx()` and runtime sheets only after
  measurements show meaningful per-instance allocation and no hot-path cost.

## Why

The expert choice is not to lazily optimize every object. It is to target
factory-created API surfaces where methods are optional and instances may be
created repeatedly. A getter that remains on a hot path would be a regression;
memoization makes the cost one first-access lookup and restores a direct own
property thereafter.

## How

### Conceptual model

```text
createCss()
  ├─ root callable: allocated immediately, unchanged hot path
  ├─ vars: getter ──first read──> function own property
  ├─ class: getter ─first read──> function own property
  ├─ raw: getter ───first read──> function own property
  ├─ props: getter ─first read──> function own property
  ├─ group: getter ─first read──> function own property
  └─ input: getter ─first read──> function own property
```

### Operations / behavior

1. Install a descriptor for an optional method.
2. On first read, invoke its factory exactly once.
3. Replace the descriptor with the resulting function.
4. Return the function; later reads are ordinary property reads.
5. Keep the TypeScript `CssFn` interface unchanged.

### Tech choices

| Choice         | Decision                                                          | Rationale                                                                       |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Lazy mechanism | Self-replacing accessor                                           | Defers closure allocation and returns to direct property lookup after first use |
| Public typings | Unchanged `CssFn`                                                 | DX must continue to expose every API directly                                   |
| Root `css()`   | Eager                                                             | It is the principal hot path and must not pay accessor overhead                 |
| Scope          | Start with `createCss`; measure other factories                   | Avoid cargo-culting an optimization where instance count is low                 |
| Validation     | Behavior, descriptor, memory-shape, size, and focused perf checks | Memory savings are only useful if semantics and hot paths remain stable         |

### Architecture

```text
createCss composition root
  ├─ backend / atom registry
  ├─ eager root compiler
  └─ lazy method materializer
       ├─ vars
       ├─ class
       ├─ raw
       ├─ props
       ├─ group
       └─ input
```

## What this allows

- Many `createCss()` instances to retain only the root compiler and methods
  actually used by the application.
- Runtime bundles to keep the complete typed API while avoiding unused method
  closures at runtime.
- A reusable optimization pattern for future factory APIs when measurements
  justify it.

## What this does not allow

- Removing any typed API from the runtime.
- Lazy-loading code across chunks or changing tree-shaking boundaries by
  itself.
- Assuming that fewer closures always means a faster call; first-access and
  steady-state measurements remain required.

## UI & UX

No user-facing UI change. Property access remains synchronous and returns the
same function shape and output as before.

## Data model

No persistent data model. A viable implementation would use shared prototype
accessors plus small per-instance state; the rejected spikes are retained in
the status notes below as evidence, not as runtime architecture.

## Implementation steps

1. Add a small internal memoizing-property primitive and descriptor-shape
   tests.
2. Convert optional `createCss()` methods without changing `CssFn`.
3. Run focused output, props, group, preset, runtime, and size tests.
4. Add a measured comparison for `createCx()` and runtime sheets; optimize
   only if the allocation profile warrants it.
5. Document the result and update the runtime performance notes.

## Open questions

1. Do real applications create enough independent `createCss()` instances for
   retained-heap reduction to matter beyond test/build processes?
2. Are `createCx()` and runtime-sheet instances numerous enough to justify the
   same pattern without making their hot paths harder to reason about?

## Acceptance criteria

- [ ] All `CssFn` methods remain available with unchanged TypeScript types.
- [ ] Unused optional methods are accessors before first use and are memoized
      as direct properties after first use.
- [ ] Every method factory runs at most once per `createCss()` instance.
- [ ] Existing focused CSS behavior tests pass unchanged.
- [ ] Root callable steady-state behavior has no new per-call branch.
- [ ] Runtime bundle budgets and snapshots do not regress unexpectedly.
- [ ] Additional factory optimizations are either measured and accepted or
      explicitly rejected with evidence.

## Current implementation status

The first two implementation spikes were intentionally rejected:

- Per-instance self-replacing accessors added roughly 236 minified bytes and
  60 gzip bytes, while still allocating an accessor closure per instance.
- Shared-prototype accessors avoided that per-instance accessor closure, but
  increased the CSS runtime bundle to roughly 6,501 minified bytes and caused
  every method factory to remain reachable from the prototype object.

The existing runtime implementation is therefore retained. The next viable
slice must combine compiler-aware method pruning with a measured retained-heap
benchmark; a runtime-only accessor change is not accepted merely because it
resembles Zod’s technique.

## Re-evaluation — 2026-09-01

The idea was remeasured against the current runtime after compiler-aware CSS
method pruning and the runtime hot-path pass.

With 20,000 instances on Node 24.19.0:

| shape | retained bytes/instance | own methods |
| --- | ---: | --- |
| root compiler only | ~1,345 | none |
| current `createCss()` | ~2,490 | `vars`, `class`, `raw`, `props`, `group`, `input` |

The eager attached methods therefore retain roughly **1.15 KB per instance**.
That is a genuine memory opportunity when a host creates thousands of
independent CSS factories. It does not improve the hot path: the root callable
is unchanged, and every first method read would pay an accessor/materialization
step before steady-state direct property access. A runtime-only lazy layer also
does not remove method implementations from the browser bundle; compiler-aware
pruning already does that for factories whose usage is known.

The shared-prototype variant additionally changes the observable own-property
shape (`Object.keys(createCss())` no longer lists the methods) unless it adds
per-instance descriptors, which gives back much of the retained-memory win.

Decision: **do not add runtime-only lazy method accessors now**. The measured
benefit is memory-only and instance-count dependent, while the cost is a
universal implementation/complexity tax and a first-use slowdown. Revisit only
if a real host demonstrates many independently-created factories and provides
a retained-heap budget that justifies a compatibility-preserving design.

## Decisions log

| Date       | Decision                                                                    | Rationale                                                                          |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 2026-09-01 | Evaluate Zod’s method memoization idea for `createCss()` attached methods | It has several optional closures while preserving a callable root hot path         |
| 2026-09-01 | Do not change the public `CssFn` type                                       | The frozen API must remain fully discoverable even when implementations are lazy   |
| 2026-09-01 | Reject the first lazy-method implementations                                | They violated the runtime-size contract without sufficient measured memory benefit |
| 2026-09-01 | Keep eager methods after retained-heap remeasurement                         | The ~1.15 KB/instance saving is real but memory-only, instance-count dependent, and compiler pruning already handles bundle delivery |
