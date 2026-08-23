# Plan 009 — docs/bench truth pass

Part 1: refresh BENCH.md + SIZE.md/README after cx v3 + smarter compiler:

- BENCH.md: whole-input cache explanation; fresh cx-bench.mts numbers vs real
  tailwind-merge same-run interleaved; narrative: v3 beats twMerge warm on
  long pairs, ~0.8x short pairs, cold path honest. Reconcile history.
- SIZE.md/README: cx entry 6930 min / 3017 gz (v3); update ALL table/prose
  claims from packages/pandwind/tests/snapshots/runtime-size.json.snap
  (run pnpm test:size -u first if drifted).
- src/** untouchable.

Part 2 (css-in-js-bench clone, scratch branch): swap techs/pandwind runtime
lane hand-written merge shim to REAL cx() from the pandwind default tip
(read-only), re-run SSR microbench for pandwind + tailwind-merge lanes,
report old-vs-new tables.
