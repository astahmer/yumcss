---
title: Runtime benchmarks — measured, not guessed
description: Per-call throughput of tw() / css() / cx() against stylex, tailwind-merge, emotion and panda.
sidebar:
  order: 3
---

Last measured: **2026-08-23** for `cx()` v3 (whole-input cache), **2026-08-22**
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

## Re-running

The repo-owned entry points: `packages/pandwind/tests/runtime-size.test.ts`
(the size gate), `packages/pandwind/cx-bench.mts` (cx microbench,
`tsx cx-bench.mts` from `apps/example`). The competitor rig lives outside the
repo; rebuild instructions are in
[BENCH.md](https://github.com/astahmer/pandwind/blob/main/BENCH.md#re-running).
