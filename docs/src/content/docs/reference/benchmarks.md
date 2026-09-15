---
title: Runtime benchmarks — measured, not guessed
description: Per-call throughput of tw() / css() / cx() against stylex, tailwind-merge, emotion and panda.
sidebar:
  order: 3
---

Last measured: **2026-09-10** for the runtime-size contract, **2026-08-23**
for `cx()` v3 (whole-input cache), **2026-08-22**
for the competitor table. Local macOS (arm64), Node v24.19.0. Interleaved
rotated-order rounds, best-of-5-pass median sample. This is local-machine
evidence, not a published benchmark suite — numbers vary with hardware and
versions. See
[BENCH.md](https://github.com/astahmer/pandwind/blob/main/BENCH.md) in the
repo for the complete methodology and caveats.

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

## Current runtime size record — 2026-09-10

The canonical byte table is [the size reference](/reference/size/); the
exact record is the committed `runtime-size.json.snap` and the hard
ceilings are in `runtime-budget.json`.

| entry                        | minified |  gzip |
| ---------------------------- | -------: | ----: |
| `createUnsafeCss()` fallback |    6,781 | 2,974 |
| `tw()`                       |    2,711 | 1,266 |
| `cx()` plain strings         |    6,031 | 2,671 |
| `cx()`                       |   12,709 | 5,309 |
| all direct runtime entries   |   15,311 | 6,245 |
| `createRuntimeCss()` + sheet |   20,907 | 8,423 |

The combined runtime is effectively at the supplied Emotion reference:
both round to 15.31 KB min / 6.25 KB gzip against the supplied 15.3 KB /
6.25 KB reference. The root `SIZE.md` is only a pointer and no longer
duplicates these numbers.

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
| callable core   |    3,894 | 1,755 |
| `class`         |    3,949 | 1,776 |
| `vars`          |    5,496 | 2,428 |
| `class,vars`    |    5,550 | 2,450 |
| all attachments |    6,691 | 2,914 |

The `class,vars` module therefore removes **1,141 minified bytes / 464 gzip
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

## Styling ecosystem typecheck benchmark

The standalone
[styling TypeScript benchmark](https://github.com/astahmer/pandwind/tree/main/benchmarks/styling-tsc)
compares realistic consumer typecheck cost across Pandwind, Panda CSS, StyleX,
and Vanilla Extract Sprinkles. It uses native APIs for each library and records
the compiler program size, symbols, types, type instantiations, memory, check
time, and total time for fresh TypeScript processes.

The first matrix has two workload sizes:

- <code>natural</code>: 12 repeated component-style uses and a 16-entry token
  catalog;
- <code>stress</code>: 180 repeated component-style uses and a 128-entry token
  catalog.

Pandwind's fixture covers the callable css API, class and props projections,
variables, groups and inputs, class composition, tokens, semantic tokens,
color palettes, conditions, and strict property typing. The comparison
fixtures use Panda's generated css/cva API, StyleX's vars/create/props API,
and Sprinkles' generated helper.

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
