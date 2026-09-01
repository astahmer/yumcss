# Runtime benchmarks — measured, not guessed

Last measured: **2026-09-01** for the runtime hot-path pass and **2026-08-23** for `cx()` (v3 whole-input cache — see the
section below), **2026-08-22** for the competitor table. Local macOS (arm64),
Node v24.19.0. Entries were bundled with esbuild (node platform, no minify —
irrelevant to timing) and run in-process: warmup, then interleaved rounds
(rotated order) of ~250–300 ms samples with batched clock checks; the table
shows the best-of-5-pass median sample (ops/sec) plus the p10–p90 spread of
that pass. This is local-machine evidence, not a published benchmark suite —
numbers will vary with hardware and versions.

> **Load caveat (2026-08-22 run):** the machine was heavily loaded by
> unrelated background work during measurement (load average 19–28 on 10
> cores; the 2026-08-15 run below was taken on a quiet machine). Every
> absolute number in the table is therefore a **lower bound** — competitors
> scaled down ~1.6–2.7× vs their 2026-08-15 values. The relative ordering
> within a pass (all implementations interleaved under identical load) and
> the `cx()` delta are the meaningful signal.

## What is being measured

Every row performs its framework's **primary runtime call** on the same
logical style corpus (flex column, centered, gap/padding/radius, blue
background, white semibold text, margin-top; `tw()`/`cx()` use the equivalent
Tailwind utilities including a `hover` and `sm` variant). The rows are not all
the same operation — the table says exactly what each call does:

| runtime                   | operation measured                                                           | median ops/sec |     p10–p90 |
| ------------------------- | ---------------------------------------------------------------------------- | -------------: | ----------: |
| `@stylexjs/stylex` 0.19.0 | `stylex.props()` on a babel-compiled object (the compile step is build-time) |      7,830,000 | 1.75M–9.53M |
| `tailwind-merge` 3.6.0    | `twMerge()` of two precomputed class strings                                 |      2,620,000 |  845K–2.89M |
| `@emotion/css` 11.13.5    | `css(styles)` — hash + cache lookup + class name                             |        472,000 |   220K–497K |
| pandwind `cx()`           | `cx(stringA, stringB)` — tokenize, resolve atoms + conflict map, last-wins   |        448,000 |   149K–510K |
| `@pandacss/core` 1.12.0   | generated `css(styles)` — runtime system walk                                |        429,000 |   180K–450K |
| pandwind `css()`          | `css(styles)` — flatten, hash, property-priority merge                       |        197,000 |   153K–202K |
| pandwind `tw()`           | `tw(styles)` — walk object, compose utilities, conflict-resolve              |         80,000 |     23K–95K |

> The `cx()` row above predates the v3 whole-input cache (2026-08-23) and was
> also taken under heavy background load — it is a floor, not the current
> number. See [the v3 section below](#cx-whole-input-cache--v3-2026-08-23)
> for same-machine interleaved measurements against real tailwind-merge.

For reference, the previous (2026-08-15, quiet machine) absolute values:
stylex 21.0M, twMerge 4.30M, emotion 926K, panda 738K, css() 388.9K,
tw() 199.3K, cx() 176.9K — do not compare across the two tables directly;
the load caveat above applies.

## Reading the table honestly

- **stylex is not comparable directly.** Its `create()` — the analog of
  pandwind's `css()`/`tw()` compile — is compiled away by babel. What runs in
  the browser is `props()`, which iterates a precompiled object and joins
  class names. pandwind's equivalent work happens in `css()`/`tw()` at call
  time, or is hoisted to build time by the vite plugins,
  which then makes the remaining runtime cost zero for literal calls.
- **twMerge vs `cx()`: shape-dependent, and `cx()` wins where it matters
  most.** twMerge merges two already-compiled class strings; it cannot
  resolve hashed css() atoms, and it does no style-object work, so its short
  inputs stay faster (~0.7× on a 4+3-token pair). But on realistic class
  lists (13+9 tokens incl. variants) warm `cx()` measures **at or above
  tailwind-merge** (see the v3 section), while doing strictly more work:
  resolving css() atoms through the registry and merging across engines.
  Both engines memoize repeated identical inputs the same way.
- **pandwind `css()`/`tw()` trade per-call speed for a much smaller shipped
  runtime** ([SIZE.md](./SIZE.md)) — and for literal calls the vite plugins
  hoist the entire cost to build time, making the per-call number irrelevant
  in real apps.
- Every value here is **one call, cold-ish**: no memoization of the input
  object across iterations. Emotion and panda hash every call; pandwind does
  the same. In real apps the vite inliner removes the per-call cost of
  literal `tw()`/`css()` calls entirely, so these numbers are the worst case.

## `cx()` whole-input cache — v3 (2026-08-23)

The v2 numbers exposed a scaling gap on long class lists (~242–314K ops/sec
on 13+9-token pairs vs twMerge's multi-million headline). Profiling showed
per-token cost was already near-optimal — the gap was that **tailwind-merge's
headline rides its internal whole-input LRU**, while every `cx()` call re-ran
the full merge.

v3 added the equivalent to `createCx`: a whole-input result cache keyed on
pure-string argument lists, with one extra correctness guard tailwind-merge
does not need — entries record the atom-registry size at compute time (css()
atoms resolve live against a growing registry) and a hit with a changed
registry size re-computes. Arrays/objects always take the merge path.
Opacity-modifier regexes on the parse hot path were replaced by manual scans.

Committed harness (`packages/pandwind/cx-bench.mts`, quiet machine,
median-of-15):

| shape                              | before v3 |                                  after v3 |
| ---------------------------------- | --------: | ----------------------------------------: |
| short pair (4+3 tokens)            |      747K |                                     6.28M |
| long pair (13+9 tokens, warm)      |      242K |                                 **2.70M** |
| long single string                 |      418K |                                     21.1M |
| cold: unique-token pairs (no hits) |         — | ~101–125K (allocation-bound first render) |

Same-process **interleaved** comparison against real `tailwind-merge` 3.6.0
(median of 5 rotated rounds, identical shapes, outputs verified equivalent):

| shape     | pandwind `cx()` | `tailwind-merge` | ratio |
| --------- | --------------: | ---------------: | ----: |
| short 4+3 |       5,477,384 |        7,557,572 |  0.72 |
| long 13+9 |       2,283,256 |        2,203,928 |  1.04 |

So warm `cx()` matches or beats tailwind-merge exactly where class strings
grow — while additionally resolving css() atoms and merging across engines.
The cold path is allocation/Map-growth bound and applies only to the
first-render vocabulary of an app; steady-state rendering lives in the warm
regime. Size cost of the cache: cx entry +413 min / +185 gz bytes vs v2
(intentional, inside the raised budgets in
`packages/pandwind/tests/runtime-budget.json`).

## Runtime hot-path pass — 2026-09-01

Three narrow optimizations were measured against the existing size gate:

- `createCx()` takes a no-config/no-atom fast path for two distinct,
  whitespace-free class tokens. The cold unique-pair harness measured
  **10.2M ops/sec** in this run; complex and configured inputs retain the full
  merge algorithm. The `cx` entry grew **+184 min / +61 gz bytes** and remains
  inside its reviewed budget.
- `createTw()` materializes the composing-utility set once per created runtime,
  instead of once per style call. Direct `compileStyles()` callers still accept
  the generated array form.
- `createRuntimeSheet()` memoizes ordering and serialized CSS until a rule or
  token mutation. The substitution test verifies that repeated reads invoke
  neither policy again, while every state change invalidates both caches.

These optimizations preserve the static-first delivery path: literal calls are
still erased by the Vite compiler, so the runtime bundle is only paid for
dynamic or unsupported calls.

## Re-running

The measurement rig lives outside the repo (scratch install, pinned versions
listed above). Rebuild it with:

```sh
mkdir /tmp/pw-bench && cd /tmp/pw-bench
npm init -y
npm i @stylexjs/stylex@0.19.0 @stylexjs/babel-plugin tailwind-merge@3.6.0 \
  @emotion/css@11.13.5 @pandacss/core@1.12.0 esbuild @babel/core
npm i -D @pandacss/dev@1.12.0   # then generate styled-system/ via @pandacss/node codegen
# entries/*.ts per row, bundled with esbuild (alias pandwind/* -> workspace src),
# timed with node:perf_hooks: interleaved rotated-order rounds, batched clock
# checks (~200–400 ops between samples), best-of-passes median reported
```

Measurement notes from the 2026-08-22 rig:

- clock checks must be batched (~200+ ops between `performance.now()` calls)
  or timer overhead dominates fast ops (halves stylex/twMerge);
- `stylex.create()` is compiled ahead of time with `@stylexjs/babel-plugin`
  (`dev: false`) so only `props()` runs at benchmark time;
- pandwind's generated conflict map is extracted once from
  `apps/example/src/tw.ts` into JSON before bundling so the bench bundle has
  no parser dependency;
- measure load average before trusting absolute numbers — this rig is
  single-machine evidence, not CI-grade.

For pandwind itself, `packages/pandwind/tests/runtime-size.test.ts` is the
repo-owned size gate, `packages/pandwind/cx-bench.mts` is the repo-owned
cx microbench (`pnpm tsx ../../packages/pandwind/cx-bench.mts` from
`apps/example`, so the generated config in `apps/example/src/tw.ts`
resolves), and the benchmark
entries import `packages/pandwind/src/*` directly plus the generated config
in `apps/example/src/tw.ts`.
