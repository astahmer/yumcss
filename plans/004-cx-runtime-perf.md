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
