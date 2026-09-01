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
5. Conflict-free `tw` compilation now writes directly to a string array,
   avoiding emitted-rule objects and signature maps when no conflict metadata
   is configured. The conflict-aware path is unchanged.
6. Stylesheet path canonicalization uses one filtered mutable array and
   `lastIndexOf` instead of repeated `split`/`filter`/`toSorted` allocations.
7. Runtime-pruner virtual modules are cached per plugin instance with a cap of
   64 entries, and its AST traversal reuses one ancestor stack instead of
   allocating an array for every node.
8. Engine miss resolution and cross-module constant analysis use bounded
   2,048-entry caches. Trivial codemod edit application avoids sorting for zero
   or one edit.

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

- representative CSS object: local hot-loop sample ~562K → ~715K calls/sec;
- conflict-free nested `tw` object: local hot-loop sample ~887K → ~1.29M
  calls/sec;
- configured `tw` remains on the conflict-aware path (local sample ~316K
  calls/sec after the specialization);
- no-config `cx` with three/four tokens: ~11.7M/~10.5M calls/sec;
- current full CSS fallback: 6,538 min / 2,953 gzip;
- current compiler-pruned CSS call: 3,931 min / 1,892 gzip;
- current `tw`: 2,396 min / 1,141 gzip;
- current all-engine runtime: 14,671 min / 6,054 gzip.

The all-engine size increase is intentional and bounded by the reviewed
14,700-minified-byte budget; the `tw` specialization contributes only to the
combined engine entry and keeps its standalone entry within budget. Static
calls remain compiler-erased, so these optimizations primarily improve
dynamic and unsupported semantic fallbacks. The remaining unbounded-looking
runtime collections are correctness state: emitted unique CSS atoms and
their merge identities cannot be evicted while their class names remain in
the document. Tooling caches are bounded or scoped to one project/plugin
instance.
