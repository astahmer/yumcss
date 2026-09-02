---
title: Runtime benchmarks — measured, not guessed
description: Per-call throughput of tw() / css() / cx() against stylex, tailwind-merge, emotion and panda.
sidebar:
  order: 3
---

Last measured: **2026-09-01** for the runtime hot-path and runtime-size contracts and **2026-08-23**
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

## Runtime hot-path pass — 2026-09-01

The current runtime keeps the optimizations deliberately narrow:

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

The intentional current size record is 6,538 min / 2,953 gzip for the full
CSS fallback, 3,931 / 1,892 for a compiler-pruned CSS call, 2,319 / 1,103
for `tw()`, 12,321 / 5,206 for `cx()`, and 14,594 / 6,008 for all engines.
The CSS fallback is roughly 406 minified bytes larger than the previous
snapshot because the measured dynamic CSS speedup is worth the modest size
trade-off; literal calls are still erased by the compiler.

Literal calls remain statically erased by the Vite compiler, so these runtime
costs apply to dynamic or unsupported calls only.

## Re-running

The repo-owned evidence is split by cost center: `packages/pandwind/tests/runtime-size.test.ts`
is the runtime byte/gzip gate; the committed CSS snapshots and Vite/Rollup
browser fixtures cover generated stylesheet behavior and integration; and
`packages/pandwind/cx-bench.mts` plus its smoke test cover composition
throughput. The competitor rig lives outside the repo; rebuild instructions are in
[BENCH.md](https://github.com/astahmer/pandwind/blob/main/BENCH.md#re-running).

## Repository-scale tooling benchmark — 2026-09-02

The committed harness at `scripts/benchmark-tooling.mts` runs the same 250-file
synthetic repository through the shared source workspace, analyzer, codemod,
and unplugin transform. It reports cold time, warm mean, p50/p95 warm samples,
RSS growth, processed output count, and input bytes. The reference run was the
pre-optimization benchmark revision `b6538c880a95170572079505b2a9b459a55467a8`;
the current run was `66120db9d577149346cb4c98d8339ab4c0c824e6`.

| pipeline | cold before | cold after | warm p50 before | warm p50 after | p95 before | p95 after |
| -------- | ---------: | --------: | --------------: | ------------: | ---------: | --------: |
| scanner | 175.13 ms | 52.46 ms | 191.41 ms | 8.54 ms | 209.64 ms | 8.97 ms |
| analyzer | 130.16 ms | 14.43 ms | 55.06 ms | 11.10 ms | 66.22 ms | 13.21 ms |
| codemod | 313.50 ms | 83.59 ms | 193.80 ms | 50.90 ms | 329.77 ms | 76.01 ms |
| unplugin | 281.46 ms | 56.98 ms | 111.10 ms | 6.07 ms | 139.10 ms | 11.43 ms |

The scanner improvement comes from a bounded cross-workspace cache of exact
scan results. Analyzer avoids parsing the same module twice. Unplugin reuses
the parsed program and memoizes unchanged transforms; invalidation clears the
result cache so imported constants and generated configuration remain correct.

Run it with:

```sh
nub scripts/benchmark-tooling.mts --files 250 --samples 7
```

These are local evidence, not universal performance claims. V8 compilation,
filesystem cache state, and garbage collection can move individual samples;
RSS deltas are especially noisy. The harness is intentionally not a CI gate.

A current 1,000-file scaling smoke (`--samples 3`) completed with warm p50 of
48.68 ms for scanning, 55.52 ms for analysis, 183.53 ms for codemod, and
23.42 ms for unplugin transforms. This larger run is a scaling check only; the
before/after table above remains the controlled comparison.
