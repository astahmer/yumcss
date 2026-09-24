# Benchmark output regression plan

## Context

- The 2026-09-23 CSS-in-JS Arena comparison passed 18/18 geometry checks and
  72/72 screenshot checks. On that pinned four-engine set, Pandwind ranked
  fourth for full first load at 125,815 B and client JavaScript at 111,623 B
  Brotli, while compressed CSS ranked third at 8,724 B. The first-load gap to
  Bamboo is 15,821 B; 14,519 B of it is client JavaScript.
- Arena's 800-extra-style sweep measured 36,514 B Brotli CSS for Pandwind,
  versus 16,934 B for Bamboo and 19,023 B for Panda. The normalized slope was
  5.8 Brotli bytes per added declaration, versus 2.0 for Bamboo and Panda.
  Adding one unimported 50-style source file added 9,353 raw CSS bytes and
  2,036 Brotli bytes for Pandwind.
- CSS-in-JS Bench's build-time Pandwind lane ranked 18/18 for product-grid
  payload at 43,339 gzip bytes: 21.22 KB JS, 7.78 KB CSS, and 14.34 KB HTML.
  It ranked seventh for SSR throughput and client mount, twelfth for hydration,
  and tenth for cold production build. That lane uses a benchmark-specific atom
  stylesheet adapter, so its bundle and markup must be attributed before
  treating the rank as a general package cost.
- The Bench rerun currently imports Pandwind source through a sibling-worktree
  path. Make the lane reproducible from a pinned package artifact before using
  it as a regression gate.
- `PERF-SUMMARY.md`, `PERF.md`, and both normalized benchmark snapshots are in
  the repo. `docs/src/content/docs/reference/benchmarks.md` still says Arena
  has no Pandwind lane. Related work: [usage-aware runtime pruning](046-usage-aware-runtime-pruning.md),
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

| Choice | Decision | Rationale |
| --- | --- | --- |
| Optimize aggregate rank or attribute bytes first | Attribute assets first | Avoid shrinking shared React/app code or misreading harness overhead as library cost |
| CSS raw bytes or compressed growth | Gate both, prioritize Brotli slope | Transfer size is the observed scaling gap; raw size is already strong |
| New runtime optimization or existing pruning plan | Extend `plans/046` only when attribution points there | Keep one owner for usage-aware runtime specialization |
| Benchmark source import | Pinned artifact or stable package contract | Reproduce results outside the original local worktree |
| Rank targets | Use only against pinned versions and environment | Rankings move when competitors or tools change |

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
2. Add a reproducible asset breakdown and ablations for client JS, CSS, and
   SSR HTML in both benchmark lanes.
3. Fix unimported-module CSS emission or document and test the intentional
   global side-effect contract that explains it.
4. Reduce CSS Brotli growth from the current 5.8 B/declaration. First target
   closing at least half the measured gap to the 2.0 B/declaration peer slope,
   while keeping emitted CSS semantically equivalent.
5. Reduce attributable Arena client JS enough to reach the pinned set's
   current top-three threshold (102,731 B Brotli) and full-first-load threshold
   (117,786 B), or record an evidence-backed limit if those bytes are shared
   application/framework costs.
6. Normalize the Bench lane's source dependency, investigate its 43,339 B
   payload by component, and set a stable budget only after the harness is
   confirmed comparable.
7. Add focused guards, refresh both external snapshots/reports, update the
   reference docs, and describe implementation work in separate JJ revisions.

## Open questions

1. Does Arena's orphan-file probe represent a truly unreachable module, or a
   supported global-style discovery path? Confirm its import graph before
   setting the exact zero-output assertion.
2. Which fraction of the Bench payload is required React/app markup versus
   Pandwind output after the lane is made independent of the sibling worktree?

## Acceptance criteria

- [ ] All byte and timing claims identify the benchmark revision, Pandwind
      revision, environment, compression, and parity result.
- [ ] An unimported module contributes no reachable style rules unless the
      tested contract explicitly marks it global.
- [ ] The 800-style Brotli slope closes at least half the current gap to the
      2.0 B/declaration peer slope, with the same visual/cascade behavior.
- [ ] On the pinned Arena set, attributable browser output reaches the stated
      top-three client-JS and full-load thresholds, or the remaining shared
      bytes are isolated and documented with a follow-up decision.
- [ ] The Bench lane runs without a sibling-worktree source path; its payload
      breakdown and budget are reproducible.
- [ ] Arena geometry/screenshot gates pass; summary, detailed report, snapshots,
      and reference benchmark docs agree.
- [ ] Build, dev-start, and HMR results remain recorded to guard against
      trading away Pandwind's current strong toolchain performance.

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-24 | Keep this plan focused on emitted browser output and external benchmark reliability | The strongest performance findings concern bytes and scaling; runtime throughput/build speed are separate metrics |
