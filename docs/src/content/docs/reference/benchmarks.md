---
title: Runtime benchmarks — measured, not guessed
description: Per-call throughput of tw() / css() / cx() against stylex, tailwind-merge, emotion and panda.
sidebar:
  order: 3
---

Last measured: **2026-09-16** for the public API typecheck, runtime-throughput,
and runtime-size records, **2026-08-23**
for `cx()` v3 (whole-input cache), **2026-08-22**
for the competitor table. Local macOS (arm64), Node v24.19.0. Interleaved
rotated-order rounds, best-of-5-pass median sample. This is local-machine
evidence, not a published benchmark suite — numbers vary with hardware and
versions. See
[BENCH.md](https://github.com/astahmer/pandwind/blob/main/BENCH.md) in the
repo for the complete methodology and caveats.

The compact snapshot-derived typecheck and bundle-size summary is in
[`PERF.md`](https://github.com/astahmer/pandwind/blob/main/PERF.md). It keeps
rankings per workload and metric instead of inventing one composite score.

## Competitor table

Every row performs its framework's **primary runtime call** on the same
logical style corpus:

| runtime                   | operation measured                                                           | median ops/sec |
| ------------------------- | ---------------------------------------------------------------------------- | -------------: |
| `@stylexjs/stylex` 0.19.0 | `stylex.props()` on a babel-compiled object (the compile step is build-time) |      7,830,000 |
| `tailwind-merge` 3.6.0    | `twMerge()` of two precomputed class strings                                 |      2,620,000 |
| `@emotion/css` 11.13.5    | `css(styles)` — hash + cache lookup + class name                             |        472,000 |
| pandwind `cx()`           | tokenize, resolve atoms + conflict map, last-wins                            |        448,000 |
| `@pandacss/core` 1.12.0   | generated `css(styles)` — runtime system walk                                |        429,000 |
| pandwind `css()`          | flatten, hash, property-priority merge                                       |        197,000 |
| pandwind `tw()`           | walk object, compose utilities, conflict-resolve                             |         80,000 |

Reading it honestly:

- stylex's compile is hoisted to babel; pandwind's equivalent work happens at
  call time — or is hoisted to build time by the vite plugins, making the
  remaining runtime cost zero for literal calls.
- pandwind `css()`/`tw()` trade per-call speed for a much smaller shipped
  runtime ([size](/reference/size/)).
- The CSS projections are peers, not a winner and loser: use `css(a, b)` when
  a mergeable declaration map is useful, or `css.class(a, b)` when the host
  wants one class string. The package harness records both shapes, plus
  `css.props()` for compiled-map host merging and `cx()` for broader mixed
  inputs.
- These numbers are one call, cold-ish — the worst case. In real apps the
  vite inliner removes the per-call cost of literal calls entirely.

## `cx()` whole-input cache — v3

v3 added a whole-input result cache to `createCx`, keyed on pure-string
argument lists, with an atom-registry guard tailwind-merge does not need.
Committed harness (`packages/pandwind/cx-bench.mts`, quiet machine,
median-of-15):

| shape                         | before v3 |  after v3 |
| ----------------------------- | --------: | --------: |
| short pair (4+3 tokens)       |      747K |     6.28M |
| long pair (13+9 tokens, warm) |      242K | **2.70M** |
| long single string            |      418K |     21.1M |

Interleaved against real `tailwind-merge` 3.6.0 (outputs verified
equivalent):

| shape     | pandwind `cx()` | `tailwind-merge` | ratio |
| --------- | --------------: | ---------------: | ----: |
| short 4+3 |       5,477,384 |        7,557,572 |  0.72 |
| long 13+9 |       2,283,256 |        2,203,928 |  1.04 |

Warm `cx()` matches or beats tailwind-merge exactly where class strings grow
— while additionally resolving css() atoms and merging across engines.

## Current runtime size record — 2026-09-17

The canonical size table is [the size reference](/reference/size/); the
exact byte record is the committed `runtime-size.json.snap` and the hard
ceilings are in `runtime-budget.json`. Values below use decimal KB
(1 KB = 1,000 bytes) for readability.

| entry                                          | minified |     gzip |
| ---------------------------------------------- | -------: | -------: |
| `createCssRuntime()` core (internal)           |  5.82 KB |  2.52 KB |
| `createCss(minimal preset)`                    | 13.08 KB |  5.18 KB |
| `createCss(csstypePreset)`                     | 17.57 KB |  6.49 KB |
| `createCss(defaultPreset)`                     | 24.10 KB |  8.68 KB |
| `createCss(tailwindPreset)`                    | 40.56 KB | 13.24 KB |
| `createCss(chakraPreset)`                      | 51.37 KB | 13.88 KB |
| `createCss(pandaPreset)`                       | 44.63 KB | 12.86 KB |
| `createCss(shadcnPreset)`                      | 85.08 KB | 15.95 KB |
| `createCss(fixturePreset)`, test fixture       | 27.43 KB |  9.73 KB |
| `createUnsafeCss()` fallback                   | 10.60 KB |  4.27 KB |
| `tw()`                                         |  2.80 KB |  1.31 KB |
| `cx()` plain strings                           |  7.03 KB |  3.01 KB |
| `cx()` + CSS atom registry                     | 17.54 KB |  6.84 KB |
| `createCss(fixturePreset)` + `tw()`            | 30.11 KB | 10.72 KB |
| `createCss(fixturePreset)` + `cx()`            | 34.38 KB | 12.37 KB |
| `createCss(fixturePreset)` + `tw()` + `cx()`   | 37.06 KB | 13.32 KB |
| all direct runtime entries (`unsafeCss+tw+cx`) | 20.23 KB |  7.80 KB |
| `createRuntimeCss(preset)` + sheet             | 33.73 KB | 12.50 KB |

The combined direct runtime is 20.23 KB min / 7.80 KB gzip in this record for
the unsafe `createUnsafeCss()` + `tw()` + `cx()` shape; the preset-bound
combination of the same lanes is 37.06 KB min / 13.32 KB gzip because it also
carries the preset-aware resolver and its preset's whole catalog. Those rows use
`fixturePreset`, the test fixture that keeps a named color palette, so the
measured shape matches a project that imports a named-color preset. The
`css()` lane is measured with eight presets (minimal, `csstypePreset`,
`defaultPreset`, `tailwindPreset`, `chakraPreset`, `pandaPreset`,
`shadcnPreset`, and the fixture preset) because the preset, not the engine, is
what moves that number; the per-lane rows show what an application that does not
need every engine actually ships, and `shadcnPreset` is the widest catalog of
the eight at 85.08 KB min / 15.95 KB gzip, ahead of `chakraPreset` at 51.37 KB
min / 13.88 KB gzip, `pandaPreset` at 44.63 KB min / 12.86 KB gzip, and
`tailwindPreset` at 40.56 KB min / 13.24 KB gzip. The internal
`createCssRuntime()` row has no public method attachments; it is included to
show the shared engine's base cost, not as an application entry point. Fully
extracted static calls remain below 100 bytes.

Generated Tailwind conflict metadata is a separate opt-in lane. The compact
conflict artifact itself is **22.37 KB min / 7.23 KB gzip**; a conflict-only
`createCx()` bundle is **29.37 KB min / 10.18 KB gzip**, and the measured
example `dss+cx` bundle is **54.07 KB min / 18.88 KB gzip**. These rows are
lower than the previous 55.96 KB / 11.54 KB conflict-only and 80.68 KB /
20.29 KB `dss+cx` bundles because the generated catalog is packed, decoded
lazily, and shared between the optional `tw.runtime.ts` and `cx` paths. Native
Pandwind-only `cx()` does not pay for that catalog. For larger apps,
`tw generate --conflicts bg,p,text` narrows the catalog further; this is safe
only when every arbitrary runtime class that must merge belongs to a selected
prefix. The root `SIZE.md` is only a pointer and no longer duplicates these
numbers.

## Public runtime API throughput snapshot

The package also owns a structured runtime snapshot at
`packages/pandwind/tests/snapshots/runtime-api-benchmark.json.snap`. It
measures every first-class authoring lane and its important projections:
preset-bound, generated, and unsafe `css`; `dss`; runtime CSS and runtime
design CSS; `cx`; configured and root `tw`; Stack; React Native; OpenTUI;
React Strict DOM; class-name strategies; backends; host adapters; and the
supporting stylesheet, source, Vite, lib-artifact, and preset-builder paths.
The report keeps build-category rows visible but labels them separately from
browser runtime work. Each row records the input shape, iterations, median,
and p10/p90 throughput. Rows are evidence for their own operation, not a
single universal score.

The generated ranking is included in
[`PERF.md`](https://github.com/astahmer/pandwind/blob/main/PERF.md), and the
dedicated hot-path regression harness remains separate because it uses a
different micro-input set and slowdown tolerance. The broad public matrix uses
a 25% of baseline floor because very short local operations are noisy; the
snapshot remains the reviewable source for smaller changes.

Refresh the runtime record with:

```sh
pnpm --filter pandwind run test:benchmarks -- -u
pnpm run bench:summary
```

Normal benchmark runs compare each scenario with its recorded median using a
wide 50% slowdown floor. The measurements are intentionally local-machine
evidence; use the p10/p90 spread and the scenario description before drawing
cross-API conclusions.

## Historical runtime hot-path pass — 2026-09-01

At that historical checkpoint, the runtime kept the optimizations deliberately narrow:

- no-config `createCx()` takes a fast path for two distinct whitespace-free
  class tokens. The cold unique-pair harness measured **10.2M ops/sec** in this
  run; configured and complex inputs retain the full merge algorithm. The
  measured `cx` cost is **+184 min / +61 gz bytes**, within its reviewed size
  budget;
- `createTw()` creates its composing-utility set once per runtime instance;
- `createRuntimeSheet()` caches ordering and serialized CSS until a rule or
  token mutation, avoiding repeated work for unchanged reads.
- CSS null-reset normalization is clone-on-write and flat CSS objects bypass
  the general flattener when safe. A representative object call measured about
  552K → 617K calls/sec (+12%).
- no-config `cx()` directly joins up to four distinct whitespace-free tokens;
  three-token and four-token calls measured about 11.7M and 10.5M calls/sec.
  Duplicate/complex/configured inputs keep the full merge path.
- `tw()` now assembles its final output without intermediate `map`/`filter`
  arrays. The generated-config shape measured about 270K → 296K calls/sec
  (+10%).

The intentional size record at that historical checkpoint was 6,538 min / 2,953 gzip for the full
CSS fallback, 3,931 / 1,892 for a compiler-pruned CSS call, 2,319 / 1,103
for `tw()`, 12,321 / 5,206 for `cx()`, and 14,594 / 6,008 for all engines.
The CSS fallback was roughly 406 minified bytes larger than the previous
snapshot at that checkpoint because the measured dynamic CSS speedup was
worth the modest size trade-off; literal calls are still erased by the
compiler.

Literal calls remain statically erased by the Vite compiler, so these runtime
costs apply to dynamic or unsupported calls only.

## Opt-in generated runtime selections

The `pandwind-codemod runtime generate` command lets non-Vite consumers choose
the `createUnsafeCss` attachments they actually use. The current generated-module
record is:

| selection       | minified |  gzip |
| --------------- | -------: | ----: |
| callable core   |    8,165 | 3,402 |
| `class`         |    8,220 | 3,422 |
| `vars`          |   10,512 | 4,244 |
| `class,vars`    |   10,568 | 4,267 |
| all attachments |   12,842 | 5,088 |

The `class,vars` module therefore removes **2,274 minified bytes / 821 gzip
bytes** from the generated all-method module. This is a bundle-size saving;
the callable core and selected attachment implementations are unchanged, so
the optimization does not add runtime dispatch or dynamic loading. The exact
record is part of the Pandwind runtime-size snapshot.

## Re-running

The repo-owned evidence is split by cost center: `packages/pandwind/tests/runtime-size.test.ts`
is the runtime byte/gzip gate; the committed CSS snapshots and Vite/Rollup
browser fixtures cover generated stylesheet behavior and integration; and
`packages/pandwind/cx-bench.mts` plus its smoke test cover composition
throughput. The competitor rig lives outside the repo; rebuild instructions are in
[BENCH.md](https://github.com/astahmer/pandwind/blob/main/BENCH.md#re-running).

## Repository-scale tooling benchmark — 2026-09-02

The committed harness at `scripts/benchmark-tooling.mts` runs a synthetic
repository through the shared source workspace, analyzer, codemod, and
unplugin transform. It reports cold time, warm mean, p50/p95 warm samples,
RSS growth, processed output count, input bytes, and an explicit one-file
incremental run after invalidation. The current 250-file run used five warm
samples:

| pipeline |     cold | warm p50 | warm p95 | one-file incremental |
| -------- | -------: | -------: | -------: | -------------------: |
| scanner  | 35.18 ms | 16.44 ms | 21.99 ms |              2.95 ms |
| analyzer | 26.66 ms | 21.22 ms | 25.49 ms |              9.43 ms |
| codemod  | 86.23 ms | 65.75 ms | 69.29 ms |             49.33 ms |
| unplugin | 58.84 ms |  0.16 ms |  0.27 ms |              0.20 ms |

The incremental improvement comes from three bounded mechanisms: exact
parsed-program reuse, shared source-workspace entries, and watcher-directed
invalidation that avoids re-globbing/re-reading unchanged files. The analyzer
also consumes files one at a time, so it does not retain a second repository-
wide source array. Unplugin checks its content-keyed transform cache before
parsing or resolving configuration. Codemod remains a pure, uncached
single-file use case; repository callers can add bounded orchestration caching
without making the migration API retain source state.

Run it with:

```sh
nub scripts/benchmark-tooling.mts --files 250 --samples 5
nub scripts/benchmark-tooling.mts --files 1000 --samples 3
```

The larger 1,000-file run is a scaling check, not a release budget:

| pipeline |      cold |  warm p50 |  warm p95 | one-file incremental |
| -------- | --------: | --------: | --------: | -------------------: |
| scanner  | 108.33 ms |  34.31 ms |  48.23 ms |              6.58 ms |
| analyzer |  89.11 ms |  89.71 ms | 115.62 ms |             56.12 ms |
| codemod  | 237.86 ms | 153.28 ms | 255.62 ms |            151.13 ms |
| unplugin | 184.59 ms |   0.60 ms |   0.85 ms |              0.18 ms |

These are local evidence, not universal performance claims. V8 compilation,
filesystem cache state, and garbage collection can move individual samples;
RSS deltas are especially noisy. The incremental column is the useful HMR
signal: the changed file is invalidated while unchanged files remain cache
hits. Codemod has no such stateful watcher boundary, so its incremental value
is a full migration run.

## Pandwind API typecheck snapshot

The package also owns a focused API regression snapshot at
`packages/pandwind/tests/snapshots/tsc.json.snap`. Unlike the ecosystem
comparison, this matrix isolates Pandwind's public API shapes: default,
generated, custom, and unsafe CSS; a complete anonymized product theme (both
construction and downstream usage); dynamic `css` projections; `dss` and
runtime design CSS; `cx`; configured and root `tw`; preset builders; Stack;
class-name strategies; platform backends; tooling contracts; and one combined
app-style fixture. Every row is measured in three fresh TypeScript processes
and records the compiler program size, symbols, types, instantiations, memory,
check time, and total time. It runs as part of the normal Pandwind package test
and can be refreshed deliberately. Instantiations, memory, and check time are
the regression gates; total process time is retained for context because fresh
process startup is noisy:

```sh
pnpm --filter pandwind run test:tsc
pnpm --filter pandwind run test:tsc -- -u
```

## Styling ecosystem typecheck benchmark

The standalone
[styling TypeScript benchmark](https://github.com/astahmer/pandwind/tree/main/benchmarks/styling-tsc)
compares realistic consumer typecheck cost across Pandwind and a broad set of
type-dependent styling APIs. It includes Panda CSS, StyleX, Vanilla Extract
(core, recipes, and Sprinkles), Emotion, styled-components, Goober, Linaria,
Compiled, Griffel, Stitches, JSS, React-JSS, Fela, Aphrodite, Style9, Treat,
TypeStyle, next-yak, and React Strict DOM. It uses native APIs for each library
and records the compiler program size, symbols, types, type instantiations,
memory, check time, and total time for fresh TypeScript processes.

The first matrix has two workload sizes:

- <code>natural</code>: 12 repeated component-style uses and a 16-entry token
  catalog;
- <code>stress</code>: 180 repeated component-style uses and a 128-entry token
  catalog.

Pandwind's fixture covers the callable css API, class and props projections,
variables, groups and inputs, class composition, tokens, semantic tokens, color
palettes, conditions, and strict property typing. The comparison fixtures use
each library's native object, template, styled-component, variant, generated,
or static-style API. Stitches is retained as a historical reference because
it is no longer maintained; legacy lanes are evidence about type-surface cost,
not recommendations. Component suites such as MUI and Chakra are excluded
because their type costs are inseparable from their larger component systems.

Run the comparison from the repository root:

```sh
pnpm run bench:tsc:styling -- --update
```

The committed
[JSON snapshot](https://github.com/astahmer/pandwind/blob/main/benchmarks/styling-tsc/snapshots/tsc.json)
and [Markdown report](https://github.com/astahmer/pandwind/blob/main/benchmarks/styling-tsc/snapshots/tsc.md)
are the reviewable evidence. Pandwind rows are regression gates with
noise-tolerant thresholds; competitor rows are descriptive because generated
declaration graphs and dependency sets belong to their pinned releases. These
are typecheck measurements, not universal library or runtime performance
claims.
