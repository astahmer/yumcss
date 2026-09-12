# Runtime benchmarks — measured, not guessed

Last measured: **2026-09-12** for the runtime size and package runtime-path records,
**2026-09-10** for the `createRuntimeCss()` comparison, **2026-09-02** for the historical optimization replay,
**2026-09-01** for the historical runtime hot-path pass, **2026-08-23** for `cx()` (v3
whole-input cache — see the section below), **2026-08-22** for the competitor
table. Local macOS (arm64),
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
  runtime** ([canonical size reference](docs/src/content/docs/reference/size.md)) — and for literal calls the vite plugins
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

## Historical runtime hot-path pass — 2026-09-01

Five narrow optimizations were measured at that historical checkpoint against the size gate:

- `createCx()` takes a no-config/no-atom fast path for two distinct,
  whitespace-free class tokens. The cold unique-pair harness measured
  **10.2M ops/sec** in this run; complex and configured inputs retain the full
  merge algorithm. The `cx` entry grew **+184 min / +61 gz bytes** and remains
  inside its reviewed budget.
- `createTw()` materializes the composing-utility set once per created runtime,
  instead of once per style call. Direct `compileStyles()` callers still accept
  the generated array form.
- CSS null-reset normalization is now clone-on-write, so ordinary dynamic
  style objects are not copied before flattening. A representative CSS object
  moved from ~552K to ~617K calls/sec (+12%). Null-reset and nested-condition
  behavior remain covered by runtime tests.
- Flat CSS objects bypass the owned flattener when they contain no nested, null, or
  undefined values; conditional and array styles still use the general
  flattener. Atomic property extraction also avoids a split allocation for
  flat keys.
- `normalizeCssValue` returns string values immediately and only performs
  camel-case/unit checks for numeric values. This keeps the common string path
  allocation-free.
- The no-config `cx()` fast path now handles up to four distinct,
  whitespace-free string tokens. A three-token call measured ~11.7M ops/sec
  and a four-token call ~10.5M ops/sec; duplicates, whitespace, arrays, and
  configured/atom-backed calls retain the full merge path.

The size record at that historical checkpoint was:

| entry                    | minified |  gzip |
| ------------------------ | -------: | ----: |
| CSS fallback             |    6,538 | 2,953 |
| CSS compiler-pruned call |    3,931 | 1,892 |
| `tw()`                   |    2,319 | 1,103 |
| `cx()`                   |   12,321 | 5,206 |
| all engines              |   14,594 | 6,008 |

The CSS fallback grew by about 406 minified bytes versus the previous
snapshot. That is an intentional trade: the measured representative CSS
object path improved by about 12%, while literal calls continue to be erased
by the compiler and the reviewed hard budgets remain explicit in
`packages/pandwind/tests/runtime-budget.json`.

The earlier runtime-sheet cache remains part of the same pass:

- `createRuntimeSheet()` memoizes ordering and serialized CSS until a rule or
  token mutation. The substitution test verifies that repeated reads invoke
  neither policy again, while every state change invalidates both caches.

These optimizations preserve the static-first delivery path: literal calls are
still erased by the Vite compiler, so the runtime bundle is only paid for
dynamic or unsupported calls.

## Current runtime size record — 2026-09-10

The canonical table is [the reference size page](docs/src/content/docs/reference/size.md);
the exact record is the committed `runtime-size.json.snap` and the hard
ceilings are in `runtime-budget.json`. The current primary entries are:

| entry                        | minified |  gzip |
| ---------------------------- | -------: | ----: |
| `createCss()` fallback       |    6,781 | 2,974 |
| `tw()`                       |    2,711 | 1,266 |
| `cx()`                       |   12,709 | 5,309 |
| all direct runtime entries   |   15,311 | 6,245 |
| `createRuntimeCss()` + sheet |   20,907 | 8,423 |

The combined runtime rounds to the supplied `@emotion/css` 11.13.5 reference
(15.3 KB / 6.25 KB). The size compaction shares one dash-case helper across
the runtime, removes unused merge-state storage, and gives the runtime sheet
its own lean stylesheet/token path while retaining the direct class, variable,
and LRU performance work.

## `createRuntimeCss()` versus Emotion — 2026-09-10

The comparator figures below use `@emotion/css` 11.13.5 numbers from the
reference run supplied for this comparison. Pandwind was remeasured after
the runtime compiler changes in Node v24.19.0 on the same macOS arm64
machine. Pandwind used
`createRuntimeCss(examplePreset, { sheet: createRuntimeSheet({ autoMount: false }) })`,
which is the lazy/SSR mode: registrations update the in-memory sheet, and the
complete CSS string is requested once after the timed calls. Emotion was run
without a DOM as well, so this isolates style resolution, hashing, caching, and
sheet bookkeeping rather than measuring browser style insertion.

The seven-property repeated case is the closest comparison to the corpus above.
This remeasurement used declaration memoization, the direct class-string
projection, single-key variable encoding, batched sheet registration, and
incremental ordering. Each row warmed up first and then used five timed
samples; the fresh-rule case created a fresh runtime/sheet per sample so
new-rule registration remained part of the measured work:

| case                                                 |       pandwind |  `@emotion/css` | reading                                                     |
| ---------------------------------------------------- | -------------: | --------------: | ----------------------------------------------------------- |
| repeated seven-property `runtimeCss.class()`         | ~3.32M ops/sec |  ~1.10M ops/sec | Pandwind is about 3× faster for this repeated call shape.   |
| fresh unique one-property `runtimeCss.class()` rules | ~0.29M ops/sec |  ~0.61M ops/sec | Emotion is about 2.1× faster while registering new rules.   |
| repeated one-property `runtimeCss.vars()`            | ~3.41M ops/sec | ~3.02M ops/sec* | Pandwind is about 1.1× faster for this stable carrier path. |

The repo-owned `createRuntimeCss()` size fixture is **20,907 bytes minified /
8,423 gzip** with a minimal preset; the ordinary `createCss()` entry is
**6,781 / 2,974** in the same guard. A real application preset contributes
its own token and condition data, so that application-specific payload is not
part of this library baseline. The direct class projection and variable
registration fast paths remain covered by separate reviewed budgets in
`packages/pandwind/tests/runtime-size.test.ts`.

Repeated class and stable-variable calls no longer lose the comparison: the
common paths avoid rebuilding intermediate declaration objects and avoid
re-registering known variable atoms. Cold unique rules still favor Emotion,
because each call must resolve, serialize, and register a new rule; that is a
different optimization target from the hot repeated-call path.

`*` The `vars()` row is a semantic comparison rather than an identical
operation: Emotion's call creates or looks up a CSS class, while Pandwind's
`vars()` deliberately avoids a class per value and emits an inline custom
property. On a separate changing-value run (50,000 calls cycling through
60,000 HSL values), Pandwind measured ~2.17M ops/sec versus Emotion at
~0.44M; that is the case where var-inline avoids one new class and rule per
value. The table measures Pandwind's lazy no-DOM sheet; mounted browser mode
uses CSSOM insertion for new rules and should be benchmarked separately for a
specific host.

This is why `createRuntimeCss()` is not the default application path. A normal
Vite application should use `createCss()` with extraction; literal calls are
removed from the browser hot path. Use `css.vars()` / `css.input()` for values
that change at runtime, and use `createRuntimeCss()` when a runtime-only or SSR
host must own the sheet. Arbitrary runtime-created class vocabularies remain
valid, but they pay the target library's runtime resolution cost and grow the
sheet by design.

The package-level runtime throughput record lives in
[`packages/pandwind/tests/snapshots/runtime-benchmark.json.snap`](./packages/pandwind/tests/snapshots/runtime-benchmark.json.snap)
and is exercised by `packages/pandwind/tests/runtime-benchmark.test.ts`. It
records named `css.flat`, `css.nested`, `css.merge`, `runtime.css`,
`runtime.sheet`, `tw`, `cx.plain`, and `cx.nested` median/p10/p90 measurements.
The workloads cover ordinary flat/nested/merged styles, the live runtime sheet,
and nested class inputs without making pathological deep-input behavior part of
the performance contract.
Because throughput is not deterministic like bundle bytes, normal runs compare
against the recorded median with a broad slowdown floor and retain ordinary
assertions for output correctness. Refresh it deliberately after a meaningful
runtime change with:

```sh
cd packages/pandwind
pnpm run test:benchmarks -u
```

The historical replay remains a manual evidence tool; it is intentionally not
called by this fast package test.

## `cn`-inspired consecutive argument cache — 2026-09-02

The official [`cn` implementation](https://github.com/shadcn-ui/cn) uses
compiled conflict tables, fused token parsing, and whole-input caching. Pandwind
already had the first two and a bounded whole-input cache, so the useful
additional lesson was narrower: a configured `cx(a, b)` call should not rebuild
the `a\0b` cache key when the exact pair is rendered again immediately.

Pandwind now keeps one generation-aware two-argument slot per `createCx()`
instance. It is deliberately limited to primitive string pairs; arrays, style
objects, `cx.vars()`, and non-consecutive reuse keep the existing merge/cache
path. The atom-registry generation guard ensures that a growing CSS atom
registry cannot make a cached result stale.

The measured bundle change, against the committed pre-change record, is:

| entry       | before min/gzip | after min/gzip |      change |
| ----------- | --------------: | -------------: | ----------: |
| `cx()`      |  12,277 / 5,174 | 12,586 / 5,301 | +309 / +127 |
| all engines |  14,627 / 6,025 | 15,218 / 6,242 | +591 / +217 |

The focused `cx-bench.mts` shape is configured and repeatedly merges the same
4+3-token and 13+9-token pairs. The pre-change run measured 6.09M and 2.65M
ops/sec respectively; three post-change runs measured 25.2–67.8M and
32.1–87.4M ops/sec. The cold unique-token pair stayed at 111K ops/sec, so the
optimization targets repeat rendering without claiming to improve the
allocation-bound first vocabulary pass. The samples are intentionally reported
as ranges because sub-millisecond local measurements are noisy.

This is a targeted optimization, not a copy of `cn`'s public API. Project
specialization remains the next larger lesson: generated Pandwind metadata can
prune unused conflict tables when a compiler build has a trustworthy usage
graph. That should be implemented only with a separate retained-size and
missed-candidate proof.

## Historical optimization replay — 2026-09-02

The recent optimization chain was replayed from the revision immediately before
the first runtime optimization through every perf checkpoint. The committed
harness is [`scripts/benchmark-perf-history.mts`](./scripts/benchmark-perf-history.mts).
It creates disposable Git worktrees at pinned commit IDs, links only the local
dependency store, runs the same probes, and removes each worktree in a `finally`
block. It does not move JJ workspaces or modify the source tree.

This is a bounded local replay: five timed samples per probe on macOS arm64,
Node v24.19.0. Values are ops/sec and should be compared within this table,
not treated as portable CI performance numbers. The probes are deliberately
named after the affected mechanism:

- `tokens` — repeated immutable stylesheet token serialization;
- `sheet` — repeated stylesheet processing through the path canonicalizer;
- `pruner` — runtime CSS AST pruning;
- `edit` — one source edit through the codemod source-pass primitive;
- `engine` — repeated resolution of one Tailwind engine miss;
- `tw`, `cx`, and `css` — control paths for unrelated runtime behavior.

| checkpoint                        |  css |        tw |    cx |    sheet |     tokens |  pruner |      edit |    engine |
| --------------------------------- | ---: | --------: | ----: | -------: | ---------: | ------: | --------: | --------: |
| baseline (`b33a64c`)              | 368K |     1.30M | 6.19M |     429K |        96K |     28K |     20.7M |      731K |
| `perf/runtime` (`a8d5baf`)        | 377K |     1.24M | 6.72M |     425K | **183.2M** |     28K |     19.5M |      581K |
| `perf/tw` (`2506a5f`)             | 372K | **1.06M** | 6.61M |     445K |     178.1M |     28K |     17.8M |      856K |
| `perf/codemod-edit` (`1e2eaeb`)   | 381K |     1.21M | 7.34M |     444K |     185.9M |     29K | **87.2M** |      776K |
| `perf/codemod-engine` (`b030d01`) | 379K |     1.23M | 7.43M |     450K |     187.2M |     30K |     76.9M | **56.0M** |
| `perf/css` (`f03e586`)            | 381K |     1.23M | 7.60M | **529K** |     190.9M |     30K |     76.3M |     91.8M |
| `perf/vite` (`fa0dea2`)           | 381K |     1.22M | 7.50M |     530K |     183.8M | **49K** |     78.1M |     62.4M |
| `docs/perf` (`8034414`)           | 388K |     1.24M | 7.45M |     533K |     187.4M |     46K |     75.9M |     88.6M |

The attributable deltas are:

| revision              | measured result                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perf/runtime`        | Immutable token serialization: **96K → 183M ops/sec (~1,900×)**. This is the expected cache hit after the first call; the other columns are controls. |
| `perf/tw`             | Conflict-free compilation: **1.30M → 1.06M ops/sec** versus the immediately previous point (~18% faster).                                             |
| `perf/codemod-edit`   | One-edit source rewrite: **17.8M → 87.2M ops/sec (~4.9×)**.                                                                                           |
| `perf/codemod-engine` | Repeated engine miss lookup: **776K → 56.0M ops/sec (~72×)**.                                                                                         |
| `perf/css`            | Stylesheet path processing: **450K → 529K ops/sec (~18% faster)**.                                                                                    |
| `perf/vite`           | Runtime-pruner traversal: **30K → 49K ops/sec (~63% faster)**.                                                                                        |
| `docs/perf`           | Documentation/comment-only checkpoint; no algorithmic gain is claimed. The small movement is measurement noise.                                       |

The `css`, `cx`, and unrelated columns are controls, not claims that those
revisions improved those APIs. The two large cache results are intentionally
reported separately from cold/first-render behavior: they describe repeated
steady-state calls, while cache growth and cold misses remain bounded by the
existing runtime and engine cache limits. The harness is evidence tooling, not
a new production size or throughput gate.

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
  `examples/example/src/tw.ts` into JSON before bundling so the bench bundle has
  no parser dependency;
- measure load average before trusting absolute numbers — this rig is
  single-machine evidence, not CI-grade.

For pandwind itself, `packages/pandwind/tests/runtime-size.test.ts` is the
repo-owned size gate, `packages/pandwind/cx-bench.mts` is the repo-owned
cx microbench (`nub ../../packages/pandwind/cx-bench.mts` from
`examples/example`, so the generated config in `examples/example/src/tw.ts`
resolves), and the benchmark entries import the published `pandwind/*`
subpaths plus the generated config in `examples/example/src/tw.ts`. The only
source-addressed imports in the perf-history harness are intentional: each
run loads the exact historical worktree revision being measured.
Repeated class and stable-variable calls no longer lose the comparison: the
common paths avoid rebuilding intermediate declaration objects and avoid
re-registering known variable atoms. Cold unique rules still favor Emotion,
because each call must resolve, serialize, and register a new rule; that is a
different optimization target from the hot repeated-call path.
