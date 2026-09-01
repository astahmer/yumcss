# Runtime hot-path optimization

Status: complete

## Goal

Make the browser runtime faster for dynamic or unsupported calls while keeping
the static-first compiler path unchanged and keeping bundle growth proportional
to measured throughput wins.

## Method

- measure the existing `tw`, `css`, and `cx` paths with repeatable local
  microbenchmarks;
- optimize only allocation, lookup, and dispatch work that is independent of
  style semantics;
- prove behavior with the existing unit/integration suites and add assertions
  for every new fast path;
- remeasure minified/gzipped runtime entries and document the trade-off.

## Completed work

1. CSS null-reset normalization is clone-on-write so ordinary styles retain
   their original object graph and avoid `map`/`Object.fromEntries` work.
2. Flat CSS objects bypass the general flattener when safe, several CSS
   declaration paths avoid intermediate arrays/splits, and string values skip
   numeric normalization work.
3. The already conservative no-config `cx` fast path now handles up to four
   only when it is provably equivalent to the normal deduplicating path.
4. `tw` output assembly avoids intermediate `map`/`filter` arrays.

## Guardrails

- no new user-facing API;
- no behavior change for null resets, nested conditions, atom registration,
  conflict merging, or opaque class deduplication;
- compiler-pruned/static output remains the primary optimization;
- a size increase is acceptable only when the measured runtime improvement is
  meaningful and the relevant entry remains within its reviewed budget.

## Completion criteria

- targeted benchmark results are recorded before and after;
- unit tests cover fast-path equivalence and null-reset edge cases;
- runtime-size and type checks pass;
- focused JJ revisions describe each independently reviewable optimization.

## Measured outcome

- representative CSS object: ~552K → ~617K calls/sec (+12%);
- generated-config `tw` object: ~270K → ~296K calls/sec (+10%);
- no-config `cx` with three/four tokens: ~11.7M/~10.5M calls/sec;
- full CSS fallback: 6,538 min / 2,953 gzip;
- all-engine runtime: 14,594 min / 6,008 gzip.

The CSS fallback size increase is intentional and bounded by the reviewed
runtime budget. Static calls remain compiler-erased, so these optimizations
primarily improve dynamic and unsupported semantic fallbacks.
