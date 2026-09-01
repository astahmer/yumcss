# Runtime hot-path optimization

Status: in progress

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

## Initial targets

1. Make CSS null-reset normalization clone-on-write so ordinary styles retain
   their original object graph and avoid `map`/`Object.fromEntries` work.
2. Avoid intermediate arrays when compiling one or several CSS style objects,
   and use direct key extraction for flat atomic declarations.
3. Extend the already conservative no-config `cx` fast path to trivial inputs
   only when it is provably equivalent to the normal deduplicating path.

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
