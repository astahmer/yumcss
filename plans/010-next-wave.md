# Plan 010 — Next wave briefs

## A. SIZE micro-touch (bitset delta)

Refresh SIZE.md tables/prose and runtime-budget.json headroom commentary for
the bitset-signature byte delta. Pull exact values from
packages/pandwind/tests/snapshots/runtime-size.json.snap (run
`pnpm test:size -u` first if drifted). Docs-only + budget JSON if genuinely
needed (justify). No src changes.

## B. Plan 007 item D — cross-engine dedup proof harness

Generalize the parity harness (tests/css-tw-parity.test.ts pattern) into a
parameterized suite that runs the same assertions per installed
ClassNameStrategy mode (default hash, named-atoms): every emitted class has
exactly one rule in the generated stylesheet; resolved declarations equal
intent; cx()-merged survivors recompile to survivors' rules only. tw adapter
mode stays separate (external compiler). No engine behavior changes.

## C. Plan 007 item E — packaging readiness

1. Audit/complete `exports` map in packages/pandwind/package.json (./css,
   ./tw, ./cx subpaths + types conditions; decide whether codegen entry ships
   under ./codegen and wire it).
2. Root README quickstart: fresh-app setup (install -> preset -> codegen ->
   vite plugins) mirroring apps/example.
3. CHANGELOG.md capturing the 2026-08-22/23 waves (concise, grouped).

## D. Plan 007 item B — semantic tokens probe (+ impl if clean)

Probe what real tailwindcss accepts for CONDITION-bound tokens (`@theme`
cannot nest in media queries — test `.dark`-style overrides vs custom
variants vs CSS var overrides outside @theme) using __unstable__loadDesignSystem
exactly like the parity suites do. If a clean mapping exists, implement in
generate-theme.ts + tests; otherwise write up findings in the plan section
and stop. Either way append an Outcomes subsection.

## E. cx cold-path allocation pressure

Cold unique-token merges run ~88–119K ops/sec (allocation/Map-growth bound).
Profile with node --cpu-prof on the cold shape from packages/pandwind/
cx-bench.mts; reduce allocations (reused scratch buffers, fewer intermediate
arrays, leaner first-segment index). Behavior must stay identical
(parity/fuzz/golden green). Target >=1.5x cold. Report before/after.

## F. `pandwind analyze` fold-coverage CLI

New package packages/analyze: CLI that runs the vite cx/tw folding passes
over given globs and reports per-file + total fold statistics (% of calls
eliminated fully/partially, unfoldable reasons breakdown), reusing
tests/vite-cx-coverage.test.ts machinery. Wire root script `analyze`.
Tests for the reporter with fixture files. Link in README.

## G. PR comment bot (size + fold coverage)

.github/workflows/pr-report.yml: on PRs affecting packages/pandwind, run the
size gate + fold-coverage corpus and post/update a sticky PR comment with
size table delta vs base and fold-coverage %. Keep it simple and robust
(permissions: pull-requests write; fail-open on API errors).

## H. Bench lane wiring gap (tabs / multifile / product-grid)

In /Users/astahmer/dev/css-in-js-bench (scratch branch): investigate why
techs/pandwind-buildtime loses to vanilla on tabs (0.39x), multifile-
composition (0.46x), product-grid (0.68x) — hypothesis: per-module wiring /
virtual-module regeneration overhead rather than class-string cost. Measure
to confirm, fix what is legitimately fixable in the LANE (not by gaming),
re-run those cells + vanilla, report before/after. Never modify pandwind
sources.
xxtolqlt 3b17e71f "docs(changelog): grouped entries for the 2026-08-22 and 2026-08-23 development waves" (rebase destination)
### D. Outcomes (2026-08-23) — probe results + implementation

Probe method: real tailwindcss 4.3.3 via `compile()` from @tailwindcss/node
(same oracle as the parity suites), candidate `bg-success` with a bridged
`--color-success`.

| probe                                                        | result                                                                            |
| -----------------------------------------------------
### B. Outcomes (2026-08-23)

- New tests/css-dedup-parity.test.ts: parameterized battery over the two
  sheet-backed modes (default hash, named-atoms). Per mode asserts:
  one-rule-per-class (per atom + global duplicate check), resolved
  declarations equal intent, and cx() survivor recompilation for last-wins,
  disjoint-coexistence and variant-scoped scenarios. Cross-mode test proves
  named-atoms resolves byte-identically to hash mode.
- Class matching handles three selector spellings: raw runtime class,
  postcss-normalized escapes, and CSS identifier escaping of leading digits
  (`1k0rf5x` -> `.\31 k0rf5x` via escapeIdentifier).
- **Pre-existing engine divergence found (pinned by an expected-fail test,
  NOT fixed — test-only change):** runtime atoms register under the WRITTEN
  flatten key order while createStylesheet canonicalizes condition parts by
  sorting them. Inverted condition nesting
  (`css({ color: { _hover: "red" } })` instead of
  `css({ _hover: { color: "red" } })`) therefore emits a stylesheet rule
  keyed differently from the registered runtime atom -> missing CSS in hash
  mode. Canonical authoring is unaffected; named-atoms is immune (the
  strategy applies the same sort). Recommend a follow-up engine fix:
  apply the same sort in css.register (one-line canonicalization) + flip the
  pinned test to positive.

### D. Outcomes (2026-08-23) — probe results + implementation

Probe method: real tailwindcss 4.3.3 via `compile()` from @tailwindcss/node
(same oracle as the parity suites), candidate `bg-success` with a bridged
`--color-success`.

| probe                                                        | result                                                                            |
| -----------------------------------------------------
### E. Outcomes (2026-08-23)

Implemented (all behavior-neutral, parity/fuzz/golden suites green unmodified):

- Fused tokenizer: tokenization inlined into the push pass — no intermediate
  token array and no split-cache Map churn (tokensCache removed entirely;
  warm shapes unaffected: short pair 3.35M / long pair 1.75M ops/sec, same
  as pre-round within noise).
- Allocation-free scratch slots for splitVariants/parseUtility results
  (previously one throwaway object per parsed token), lastIndexOf dash
  descent instead of a char loop, closure-free whole-input cache check,
  regex-free border-utility test, regex-free arbitrary-value shape tests
  (isLengthLike/isColorLike with exact-parity fallbacks to the original
  regexes).

Measured cold path (cx(coldA[i], coldB[i]), 8-round interleaved A/B vs the
pre-round implementation): new median range 48K–128K, old 52K–119K across
bursts; best-of bursts 128K (new) vs 119K (old). **Target >=1.5x was NOT
met** — machine load variance (burst medians swing +-50% on identical code)
exceeds the effect size, and the effect itself measured roughly +0..15%.

Why the target is structurally hard: cold cost is dominated by irreducible
per-unique-token work — string slices for utility/value, signature-string
construction + interning hash, twSigs Map insert, CompiledSigs retention —
all required by the parity constraint (string-keyed generated maps). GC
accounted for only ~11% of profile; compute is spread thinly across parse/
intern/push rather than concentrated in one optimizable kernel.

Path to >1.5x (follow-up candidates, larger redesigns):
Final kept state (2026-08-23, after trimming the parts that regressed):

- Kept: fused tokenizer (tokensCache removed entirely), scratch-slot
  splitVariants/parseUtility, lastIndexOf dash descent, closure-free cache
  check, regex-free border test. Reverted during review: two-strike cache
  admission (measurably slower — extra Set hash per unique key exceeded the
  saved Map insert) and manual isLengthLike/isColorLike scanners (added bytes,
  no measurable perf win; original regexes restored).
- Measured on the committed cx-bench.mts (quiet machine, best-of):
  short pair 7.06M ops/sec, long pair 2.88M, long single 21.3M,
  cold unique-token pairs 130K (pre-round interleaved A/B old-vs-new:
  old best-burst 119K vs new 132K => roughly +7..10%, NOT the 1.5x target).
- Size: cx entry 7049 -> 6922 min / 3056 gz (net SHRINK of 127 bytes).
- Parity/fuzz/golden suites green unmodified; full gate green.

1. Trie over the generated conflicts map built once per config — parse by
   walking chars without substring allocation until a terminal value check.
2. Precompile conflict metadata at tw() codegen time into flat typed arrays,
   removing runtime parsing of the map entirely.
3. Numeric property-family bitsets replacing string interning end-to-end.
