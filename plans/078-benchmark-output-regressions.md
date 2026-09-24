# Benchmark output regression plan

Status: complete (2026-09-24)

## Context

- The current 2026-09-24 CSS-in-JS Arena run used Pandwind revision
  `65a1cfdca44da3c33899c2f138523309a9cf6834`; it passed 18/18 geometry checks
  and 72/72 screenshot checks. Pandwind ranks fourth for full first load at
  125,838 B and client JavaScript at 111,644 B Brotli, while compressed CSS
  ranks third at 8,724 B. The first-load gap to Bamboo is 15,844 B; the
  client-JavaScript gap is 14,540 B.
- Arena's 800-extra-style sweep measured 36,514 B Brotli CSS for Pandwind,
  versus 16,934 B for Bamboo and 19,023 B for Panda. The normalized slope was
  5.8 Brotli bytes per added declaration, versus 2.0 for Bamboo and Panda.
  The initial orphan probe added 9,353 raw and 2,036 Brotli CSS bytes for
  Pandwind; the new regression gate confirms the same unimported fixture adds
  0 raw and 0 Brotli bytes.
- The current CSS-in-JS Bench run completed on 2026-09-24 with WPD 0.15.1,
  Chrome 154.0.8037.57, and Firefox stable_156.0.1: all five lanes passed
  196/196 cells. DOM and pixel parity passed across all 19 techs and 13 cases.
  The build-time Pandwind product-grid lane measured 43,339 gzip bytes
  (21,221 B JS, 7,781 B CSS, 14,337 B HTML); its ranks are #18/18 payload,
  #6/18 SSR throughput, #7/18 mount, #3/18 hydration, and #14/19 cold client
  build. Interaction stays unranked because the measured frame-time medians
  cluster too tightly to support a useful rank.
- Bench source revision `6124070ab65c` and Pandwind source revision
  `65a1cfdca44da3c33899c2f138523309a9cf6834` are recorded in the normalized
  snapshot. The lane uses a revision-pinned package artifact and its own atom
  stylesheet adapter, so its payload is a real workload result, not a direct
  estimate of the package's standalone runtime cost.
- `PERF-SUMMARY.md`, `PERF.md`, and both normalized benchmark snapshots are in
  the repo. The reference benchmark page links the summary and identifies the
  current Arena categories. Related work: [usage-aware runtime pruning](046-usage-aware-runtime-pruning.md),
  [runtime hot-path optimization](047-runtime-hot-path-optimization.md),
  [CI and fresh benchmarks](006-ci-and-fresh-bench.md), and
  [benchmark documentation truth](009-docs-bench-truth.md).

## Goal

Reduce avoidable browser bytes and CSS growth in real workloads, while keeping
the parity gate and static-first compiler behavior intact.

## What

- Attribute the Arena JavaScript and Bench payload to Pandwind code, shared
  framework/app code, SSR markup, and benchmark harness code. Optimize only
  bytes that belong to Pandwind or are caused by its integration.
- Prevent an unimported source module from changing downloaded CSS unless that
  module explicitly contributes supported global side effects.
- Improve compressed CSS growth across the existing 0/50/200/800-style sweep;
  raw byte count alone is not an adequate transfer-size measure.
- Keep external benchmark lanes pinned, portable, parity-gated, and represented
  accurately in snapshots and docs.

## Why

The initial Arena output is competitive for CSS raw bytes and server-rendered
markup, but its JavaScript makes total first load fourth. The scaling sweep
shows the compressed CSS gap grows with style count, and the orphan-file probe
shows source that is not imported can still affect output. These are more
useful targets than build speed: Arena build and dev startup both rank first.

## How

### Conceptual model

Treat output as four separately owned costs: browser JavaScript, linked CSS,
SSR HTML, and build/dev work. Keep each cost and its compression method visible
instead of optimizing one aggregate rank.

### Operations / behavior

1. Reproduce the pinned Arena and Bench baselines, including parity and exact
   source revisions. Capture asset-level attribution for JS, CSS, and HTML.
2. Trace the 50-style orphan case through file discovery, module reachability,
   extraction, and asset emission. Preserve deliberate global stylesheet
   behavior; unused modules must not silently add reachable rules.
3. Profile CSS at 0, 50, 200, and 800 added styles and at the existing theme
   counts. Record raw, gzip, Brotli, emitted rule count, and bytes per added
   declaration. Pick the smallest compiler/bundler-owned representation change
   that lowers transfer growth without changing cascade or output semantics.
4. Use asset attribution to decide whether the JS work belongs in the existing
   usage-aware pruning plan or in package exports / plugin tree-shaking. Do not
   duplicate that plan's runtime-specialization work.
5. Make the Bench lane consume a pinned tarball or stable package contract,
   not a sibling checkout path. Verify its JS/CSS/HTML totals against the
   benchmark report before interpreting ranks.
6. Add focused regression gates for orphan reachability, compressed CSS slope,
   and attributable first-load bytes. Keep the cross-library Arena/Bench runs
   on the documented cadence rather than running them for every JJ revision.
7. Regenerate snapshots and reports, fix the stale Arena statement in the
   reference benchmark docs, and retain source/environment/parity metadata.

### Tech choices

| Choice                                            | Decision                                              | Rationale                                                                            |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Optimize aggregate rank or attribute bytes first  | Attribute assets first                                | Avoid shrinking shared React/app code or misreading harness overhead as library cost |
| CSS raw bytes or compressed growth                | Gate both, prioritize Brotli slope                    | Transfer size is the observed scaling gap; raw size is already strong                |
| New runtime optimization or existing pruning plan | Extend `plans/046` only when attribution points there | Keep one owner for usage-aware runtime specialization                                |
| Benchmark source import                           | Pinned artifact or stable package contract            | Reproduce results outside the original local worktree                                |
| Rank targets                                      | Use only against pinned versions and environment      | Rankings move when competitors or tools change                                       |

### Architecture

```text
authored modules ── reachability ── compiler extraction ── linked CSS
       │                    └────── package/plugin imports ── client JS
       └────────────────────────── SSR ── HTML
                                      │
                  parity + byte/slope gates + pinned reports
```

## What this allows

- Internal compiler, bundler, and package-boundary changes that remove proven
  unused output.
- New deterministic benchmark checks for exact asset bytes and style-count
  growth.
- A measured optimization of CSS emission or tree-shaking when the attribution
  shows it is responsible for the gap.

## What this does not allow

- Changing CSS cascade, selector matching, SSR output, or runtime semantics to
  improve a byte score.
- Making new user-facing styling APIs or weakening the existing public API
  contract.
- Claiming a library regression from total app bytes without separating shared
  framework and harness costs.
- Using a CSS raw-size win to excuse a worsening compressed-size slope.

## UI & UX

No end-user UI change. Maintainers get accurate generated summaries, detailed
asset attribution, and regression output that identifies the cost category.

## Data model

No product data model changes. Extend the existing benchmark snapshot only if
it needs normalized scale points or per-asset attribution; generated reports
remain derived from those snapshots.

## Implementation steps

1. Re-run the exact pinned lanes and confirm the recorded baselines; preserve
   the Arena parity gate and document any environment drift.
2. Add a reproducible asset breakdown for client JS, CSS, and SSR HTML. Arena
   reports exact downloaded chunks plus Rollup module-source attribution;
   Bench reports the product-grid payload components and the runtime versus
   build-time lane comparison.
3. Fix unimported-module CSS emission or document and test the intentional
   global side-effect contract that explains it.
4. The opt-in named-atoms strategy measures 1.8 B/declaration, closing more
   than half the default hash strategy's gap to the 2.0 B/declaration peer
   slope, and passes the same visual and geometry gates. Keep hash as default
   because named atoms add 62 B to baseline first load and 89,501 raw
   class-attribute bytes; retain the opt-in for style-heavy applications.
5. Arena attribution identifies each downloaded chunk and its Rollup module
   owners. The Pandwind and app modules share a chunk, so the run cannot assign
   compressed bytes to each source module. No further safe runtime removal was
   demonstrated; usage-aware runtime pruning is already implemented. Revisit
   trimming when profiling or module evidence identifies a removable path and
   its measured output savings.
6. The Bench lane consumes a revision-pinned package artifact. Its parity-
   checked product-grid payload is 43,339 B gzip and guarded by component
   budgets of 22,300 B JS, 8,200 B CSS, 15,100 B HTML, and 45,600 B total.
7. Add focused guards, refresh both external snapshots/reports, update the
   reference docs, and describe implementation work in separate JJ revisions.

## Open questions

1. Resolved: Arena's 50-style orphan fixture is not imported and is not a
   supported global stylesheet entry. Its Pandwind output is now guarded at
   exactly zero added raw and Brotli bytes.
2. Resolved: the Bench product-grid report separates gzip JavaScript, CSS,
   and HTML; its runtime/build-time comparison quantifies the integration
   trade-off. Arena attribution separates chunk transfer sizes and module
   owners, while documenting that pre-minification module lengths do not imply
   per-module compressed savings.
3. Resolved: no safe additional Arena runtime removal is supported by this
   comparison. Keep the existing pruning implementation; require a concrete
   removable path and a measured byte reduction before opening further work.

## Acceptance criteria

- [x] All byte and timing claims identify the benchmark revision, Pandwind
      revision, environment, compression, and parity result.
- [x] An unimported module contributes no reachable style rules unless the
      tested contract explicitly marks it global.
- [x] The opt-in 800-style Brotli strategy closes more than half the gap to the
      2.0 B/declaration peer slope, with the same visual/cascade behavior; the
      first-load and class-attribute costs that keep it opt-in are documented.
- [x] On the pinned Arena set, the remaining client-JS and first-load gap is
      documented alongside per-chunk/module owners, the limit of compressed
      attribution, and the evidence required before attempting further pruning.
- [x] The Bench lane runs without a sibling-worktree source path; its payload
      breakdown and budget are reproducible.
- [x] Arena geometry/screenshot gates pass; the generated summary and
      normalized snapshots agree on external measurements, while `PERF.md`
      remains the detailed local report linked from the summary and reference
      benchmark docs.
- [x] Build, dev-start, and HMR results remain recorded to guard against
      trading away Pandwind's current strong toolchain performance.

## Completion evidence

- Arena source revision `6e38b1802d96be4c499a8cfc478df0193cc06216`, Pandwind
  revision `65a1cfdca44da3c33899c2f138523309a9cf6834`, Apple M4 (arm64), macOS,
  Node 24.20.0, and Vite 8.2.1. Geometry passed 18/18; screenshots passed
  72/72. The 50-style unimported-module gate adds 0 raw and 0 Brotli CSS bytes.
- Arena ranks Pandwind first for raw CSS, mean SSR HTML, class-attribute bytes,
  cold/warm build, dev startup, shared-edit websocket, and both correct-paint
  phases; third for compressed CSS; and fourth for client JS, full first load,
  and component-edit websocket. The four-sweep HMR run pooled 28 websocket
  samples and 20 browser pairs per engine and edit kind. The 800-style
  named-atoms option measures 1.8 Brotli B/declaration; hash remains the default
  due its first-load and class-attribute trade-off.
- CSS-in-JS Bench run `6124070ab65c` used Pandwind
  `65a1cfdca44da3c33899c2f138523309a9cf6834`, Apple M4 (arm64), Node 24.20.0,
  WPD 0.15.1, Chrome 154.0.8037.57, and Firefox stable_156.0.1. WPD passed
  196/196 cells in each of five lanes; the full verifier passed DOM and pixel
  parity across 19 techs and 13 cases. The build-time product-grid payload is
  21,221 B JS + 7,781 B CSS + 14,337 B HTML = 43,339 B gzip; all component and
  total budgets pass.
- `PERF-SUMMARY.md` renders the top-five Bench categories and per-metric Arena
  top-three rankings. It, both normalized snapshots, and the reference benchmark
  docs agree on external results; `PERF.md` remains the detailed local report
  linked from those docs. Focused comparisons run with affected compiler/runtime/
  bundler changes; refresh local comparisons before releases and monthly during
  active performance work, and refresh external comparisons quarterly or after
  a benchmarked dependency's major-version change. JJ revisions alone do not
  trigger a full run.
- Validation: the Arena HMR probe regression suite passed 5/5, CSS-in-JS Bench
  WPD and payload tests passed 14/14, and Arena parity/build/dev/scale/theme
  checks passed. The current core test stage passed 93 files / 1,016 tests; TSTyche
  passed 168 tests / 377 assertions. The Pandwind and lint-plugin package
  typechecks, targeted Oxlint (four changed TS files), owned-file formatting,
  Bench summary freshness check, payload guard, parity verifier, WPD tests, and
  Arena geometry/screenshot gates passed.
- Timing gates need a quiet-host rerun before treating their result as code
  regression: runtime `css.default.raw` measured 369,771 ops/s versus a
  1,686,424 baseline (421,606 minimum), and `css.merge` measured 73,066 versus
  353,170 (176,585 minimum). The TSC check-time gate exceeded limits narrowly:
  0.117 / 0.110 / 0.068 / 0.102 s against 0.097 / 0.097 / 0.064 / 0.092 s;
  instantiation limits did not fail. Host load averaged 17.33, then 12.85.
  The current default diff has no changes under `packages/pandwind/src/css` or
  `src/cx`; avoid updating performance baselines from this run.
- Broad-check caveats: root `pnpm run typecheck` still reports two errors in
  `packages/devtools/src/plugin.ts` (`devtools` missing from `Plugin<any>` and
  implicit-any `ctx`). Root lint now completes after the cyclic-AST walker fix,
  but exits with 51 errors and 5 warnings: 34 `require-migration-residual`
  findings across runtime source and examples, 3 findings in generated E2E
  output, and remaining import, regex, unused-symbol, and array-method
  findings. The focused lint-plugin suite and targeted Oxlint on the four
  changed TS files pass. Root formatting still reports six other files
  (`.studio-history`, generated E2E output, the styling-size snapshot, docs
  size, and CSS typings); the Bench importer and normalized Bench snapshot
  pass the focused formatter check.

## Decisions log

| Date       | Decision                                                                            | Rationale                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-09-24 | Keep this plan focused on emitted browser output and external benchmark reliability | The strongest performance findings concern bytes and scaling; runtime throughput/build speed are separate metrics  |
| 2026-09-24 | Keep hashed classes as default and avoid speculative runtime trimming               | The opt-in named-atom trade-off is measured, while chunk attribution does not prove a safe compressed-byte removal |
