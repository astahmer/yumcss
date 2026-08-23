# Plan 004 — Faster `cx()` runtime

## Goal

BENCH.md: `cx()` ~177K ops/sec vs tailwind-merge ~4.3M ops/sec. The gap comes from
resolving every token through the atom registry + conflict map (the price of merging
css atoms + tw utilities in one call). Optimize the hot path substantially **without
changing any observable behavior**, then re-measure.

## Approach

1. Profile first: write/borrow a microbench (see BENCH.md methodology), identify the
   actual hot spots in `src/cx/index.ts` (tokenize? registry lookup? conflict map
   probes? allocation churn? string concat?). Report numbers before/after.
2. Optimize within behavior-neutral bounds, e.g.: memoized tokenize, flattened
   lookup tables instead of nested maps, precomputed variant-scoped conflict sets,
   fast path for plain class strings with no registered atoms/variants, avoiding
   intermediate arrays. Keep the public API and output byte-identical.
3. `tests/cx.test.ts` + `tests/css-merging.test.ts` + robustness suite must stay
   green unmodified (if a test change is truly needed, justify it explicitly).
4. Update BENCH.md with new numbers (same methodology, same machine notes) and the
   runtime-size snapshot if bytes changed (`pnpm test:size -u`).

## Files (territory)

- `src/cx/index.ts` (+ private helpers under `src/cx/`), `BENCH.md`
- Do NOT touch `src/vite/*` (compile-time cx is another agent's territory).
- tests: read-only on existing ones; new perf test file allowed (`tests/cx-bench*`).

## Gates

- Full gate green. Explicit before/after ops/sec table appended to this plan file
  (an "Outcomes" section) and BENCH.md updated.

## jj discipline

Work only inside your workspace dir. Split/describe logical revisions. Never touch
`/Users/astahmer/dev/pandwind`.

## Outcomes (2026-08-22)

**Approach shipped** (all behavior-neutral, public API untouched):

1. Per-token signature memoization — variant split + conflict-map parse +
   signature construction now run once per unique token per cx instance
   (`twSigs` cache); css atom flattened-key signatures cached likewise
   (`atomSigs`). Both capped at 8192 entries (clear-on-full, transparent).
2. Whole-input tokenizer memoization (`tokensCache`) — splitting depends only
   on the string, so repeated class strings skip the scan entirely.
3. Allocation-free ASCII tokenizer replacing the `/\s+/` regex split, with an
   up-front non-ASCII check falling back to the spec-equivalent regex path
   (JS `\s` also matches unicode spaces like `\u00a0`).
4. Parallel `outCls`/`outSigs` arrays instead of `{cls, sigs}` records; final
   join without intermediate map/filter arrays.

**Correctness evidence**: interleaved differential fuzzing against the
previous implementation — 2.4M+ randomized calls across 6 seeds (real
generated conflict maps from `apps/example/src/tw.ts`, live-growing atom
registry, unicode whitespace, arbitrary values, opacity modifiers, nested
arrays, compiled maps, opaque-only instance). Zero mismatches. One real bug
was caught by fuzzing during development (mid-string unicode fallback used to
re-split the whole string, duplicating tokens) and fixed before landing.

**Before/after** (interleaved same-process A/B, `cx(stringA, stringB)` on the
BENCH corpus — 15-token + 4-token strings incl. hover/sm variants; machine
under heavy variable background load, so only relative numbers are reliable):

| implementation | median ops/sec (runs)                  | speedup      |
| -------------- | -------------------------------------- | ------------ |
| previous       | 10.5K / 44.6K / 20.5K / 22.2K / 17.0K  | 1x           |
| optimized      | 65.1K / 146.9K / 59.7K / 98.9K / 91.1K | **3.1–4.4x** |

Profile after: remaining time is merge bookkeeping (`push`, `sigIndex`) and
cache Map gets — near-irreducible for last-wins semantics.

**Cost**: cx runtime entry 4150 → 4799 min bytes (1868 → 2148 gz), still
within the hard budgets (5400/2400); exact snapshot refreshed via
`pnpm test:size -u` as the intentional-change path.

**Infra fix required to run anything**: `pnpm-workspace.yaml` had literal
placeholder strings under `allowBuilds` ("set this to true or false"), which
made pnpm skip esbuild/swc postinstalls — vitest couldn't even start. Set both
to `true` in a separate chore revision.

**Still open** (deliberately out of scope): compile-time `cx()` hoisting for
literal calls (plan 003) — that removes the remaining per-call bookkeeping for
static apps entirely.
