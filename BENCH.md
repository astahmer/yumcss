# Runtime benchmarks — measured, not guessed

Last measured: 2026-08-15, local macOS (arm64), Node v24.18.1. Each entry was
bundled with esbuild (node platform, no minify — irrelevant to timing) and
run in-process: warmup, then 7 samples of ~250 ms each; the table shows the
median sample (ops/sec) plus the p10–p90 spread. This is local-machine
evidence, not a published benchmark suite — numbers will vary with hardware
and versions.

## What is being measured

Every row performs its framework's **primary runtime call** on the same
logical style corpus (flex column, centered, gap/padding/radius, blue
background, white semibold text, margin-top; `tw()`/`cx()` use the equivalent
Tailwind utilities including a `hover` and `sm` variant). The rows are not all
the same operation — the table says exactly what each call does:

| runtime                   | operation measured                                                           | median ops/sec |     p10–p90 |
| ------------------------- | ---------------------------------------------------------------------------- | -------------: | ----------: |
| `@stylexjs/stylex` 0.19.0 | `stylex.props()` on a babel-compiled object (the compile step is build-time) |     20,965,644 | 18.6M–21.6M |
| `tailwind-merge` 3.6.0    | `twMerge()` of two precomputed class strings                                 |      4,298,699 | 4.16M–4.30M |
| `@emotion/css` 11.13.5    | `css(styles)` — hash + cache lookup + class name                             |        926,040 |   914K–927K |
| `@pandacss/core` 1.12.0   | generated `css(styles)` — runtime system walk                                |        738,340 |   720K–741K |
| pandwind `css()`          | `css(styles)` — flatten, hash, property-priority merge                       |        388,945 |   329K–393K |
| pandwind `tw()`           | `tw(styles)` — walk object, compose utilities, conflict-resolve              |        199,276 |   188K–200K |
| pandwind `cx()`           | `cx(stringA, stringB)` — tokenize, resolve atoms + conflict map, last-wins   |        176,857 |   175K–179K |

## Reading the table honestly

- **stylex is not comparable directly.** Its `create()` — the analog of
  pandwind's `css()`/`tw()` compile — is compiled away by babel. What runs in
  the browser is `props()`, which iterates a precompiled object and joins
  class names. pandwind's equivalent work happens in `css()`/`tw()` at call
  time (387K/199K ops/sec), or is hoisted to build time by the vite plugins,
  which then makes the remaining runtime cost zero for literal calls.
- **twMerge is faster than `cx()` because it does less.** It merges two
  already-compiled class strings; it cannot resolve hashed css() atoms, and
  it does no style-object work. `cx()` also resolves every token through the
  css atom registry and the generated conflict map, so it can merge raw
  strings, `tw()` output and css atoms against each other. The 4M vs 177K gap
  is the price of that cross-engine resolution; optimizing it (and moving it
  to compile time) is an open item.
- **pandwind `css()` beats emotion and panda per call** on the same
  style-object compile while shipping a smaller runtime (see [SIZE.md](./SIZE.md)).
- Every value here is **one call, cold-ish**: no memoization of the input
  object across iterations. Emotion and panda hash every call; pandwind does
  the same. In real apps the vite inliner removes the per-call cost of
  literal `tw()`/`css()` calls entirely, so these numbers are the worst case.

## Re-running

The measurement rig lives outside the repo (scratch install, pinned versions
listed above). Rebuild it with:

```sh
mkdir /tmp/pw-bench && cd /tmp/pw-bench
npm init -y
npm i @emotion/css @stylexjs/stylex @pandacss/core tailwind-merge @chakra-ui/react esbuild
pnpm add -D @pandacss/dev   # then `panda codegen` with a minimal config
# bundle the entries in BENCH.md with esbuild, time in node:perf_hooks
```

For pandwind itself, `packages/pandwind/tests/runtime-size.test.ts` is the
repo-owned size gate, and the benchmark entries import
`packages/pandwind/src/*` directly plus the generated config in
`apps/example/src/tw.ts`.
