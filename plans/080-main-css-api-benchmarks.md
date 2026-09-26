# Main `createCss` API benchmark and optimization plan

## Context

- The 2026-09-24 CSS-in-JS Arena run used Pandwind revision
  `65a1cfdca44da3c33899c2f138523309a9cf6834`. The six-page implementation
  builds with `pandwindCssVite(css)` and passes its geometry and screenshot
  gates. Its authored declarations mostly use `css.class(...)`, which is the
  right projection for its className hosts and measures the real static CSS
  compiler. It does not cover the callable map plus `css.props(...)` host
  boundary, so the corrected suite must exercise that shape in a workload that
  naturally composes and forwards style maps; it must not rewrite Arena call
  sites that correctly need a class string.
- The Arena result is strong overall: Pandwind leads several raw CSS, SSR,
  class-attribute, build, and development metrics. Its remaining measured
  targets include fourth-place first load at 125,838 B, fourth-place client
  JavaScript at 111,644 B Brotli, and third-place CSS at 8,724 B Brotli. The
  current third-place first-load threshold is 117,786 B, about 8 KB below
  Pandwind's result.
- The default hash strategy's CSS growth is 5.8 Brotli bytes per added
  declaration in the 800-style Arena sweep; Bamboo and Panda measured 2.0.
  Named atoms reduce Pandwind's slope to 1.8, but add 62 B to baseline first
  load and 89,501 raw class-attribute bytes. Keep named atoms opt-in unless a
  real style-heavy workload proves a total transfer win.
- The 2026-09-24 CSS-in-JS Bench headline lane is `pandwind-buildtime`: its
  product-grid styles are mostly literal `tw(...)` calls folded by
  `pandwindVite()`. It measures 43,339 B gzip (#18/18 payload), with 21,221 B
  JS, 7,781 B CSS, and 14,337 B HTML. The microbench builds an atom stylesheet
  with Pandwind extraction helpers, but does not run the same
  `pandwindCssVite(css)` product plugin as the Arena app. This is a useful
  `tw()` result, not a rank for Pandwind's main CSS API.
- `pandwindCssVite(css)` already scans and rewrites static `css(...)` and
  `css.class(...)` calls. The missing evidence is whether the main
  `createCss` return shapes used by each workload, including map composition
  and host-props boundaries, reach the intended static client output in both
  external benchmark harnesses.
- The previous output work is recorded in
  [plan 078](078-benchmark-output-regressions.md). This plan corrects API
  representation first, then optimizes only costs that the corrected results
  attribute to Pandwind.

## Goal

Make the `createCss(preset)` API family the primary, parity-gated Pandwind
benchmark lane, retain `tw(...)` as a separately labeled bonus lane, and use
the corrected results to improve first-load size and compressed CSS scaling.

## What

- Author the primary lane with `createCss(preset)` and choose projections by
  host use case: `css.class(...)` when the host needs a class string,
  `css(...styles)` plus `css.props(...)` when maps are composed or forwarded,
  and `css.group(...)` or `css.vars(...)` only where reusable variants or
  genuine dynamic values make them idiomatic. Do not call every method just to
  inflate API coverage.
- Build that lane through the pinned package's actual `pandwindCssVite(css)`
  plugin and its matching preset. Keep the declarations static; represent
  state changes with selections among statically authored styles. Any truly
  dynamic style-value case belongs in a separate, explicitly dynamic result.
- Add the primary lane to both the six-page Arena workload and CSS-in-JS Bench
  product-grid workload. Include a real map-composition/host-props case in the
  Bench matrix alongside natural class-string call sites. Keep the current
  `tw(...)` lane as a separately reported secondary comparison using
  `pandwindVite()`.
- Verify the emitted browser code and stylesheet. Static CSS calls must not
  invoke the declaration compiler at runtime. Measure any remaining
  `css.props(...)` adapter separately and fold it only if the compiler can
  prove an equivalent result.
- Preserve each harness's existing parity checks, exact competitor versions,
  compression methods, pinned Pandwind artifact, source revisions, and
  workload behavior.
- Report results by API lane. The `tw(...)` row must not change the competitor
  denominator or be presented as the main Pandwind score.

## Why

The Arena result is already competitive, so broad speed work is not the best
next move. The current Bench payload rank describes Pandwind's utility API
path, while the product's central authored-style API is `createCss(preset)`.
Measuring its return shapes through the real Vite compiler gives a fair basis for deciding
whether Pandwind can move into the top three for Arena first load and the top
five for Bench payload. It also prevents an API-specific #18 result from
being mistaken for an overall product verdict.

## How

### Conceptual model

```mermaid
flowchart TD
  CSS[css(base, responsive, state)] --> CSSPlugin[pandwindCssVite(css)]
  CSSPlugin --> JS[Static call-site output]
  CSSPlugin --> Sheet[Deduplicated stylesheet]
  JS --> Verify[Bundle attribution and parity gates]
  Sheet --> Verify
  Verify --> Main[Primary css API rankings]
  TW[tw(...)] --> TWPlugin[pandwindVite()]
  TWPlugin --> Bonus[Separate tw bonus results]
```

### Operations / behavior

1. Pin the Arena, Bench, Pandwind artifact, browser, Node, and compression
   inputs. Record the existing `css.class(...)` Arena and `tw(...)` Bench
   results as controls before changing the authored lanes.
2. Audit the Arena Pandwind implementation's host boundaries and retain
   `css.class(...)` where React needs a class string. Use `css(...)` and
   `css.props(...)` only at real map-composition/host-props boundaries; the
   Bench product-grid lane must carry that coverage if Arena has no such
   natural boundary. Preserve routes, interactions, markup meaning, tokens,
   and visual output.
3. Add a Bench `pandwind-css` lane for the existing product-grid scenario.
   Use the same `createCss` preset and `pandwindCssVite(css)` integration as a
   consuming Vite application; exercise class-string and map/props shapes only
   where the workload naturally uses each. Do not copy or reconstruct the
   plugin's compiler behavior in a benchmark-only adapter.
4. Inspect transformed source and final bundles. Compare static call output
   with runtime compiler output, confirm the generated sheet includes every
   reachable declaration once, and record whether the CSS runtime or a
   `css.props` helper remains in client JavaScript.
5. Run the complete Arena and Bench parity gates before comparing size or
   timing. Keep JS, CSS, SSR HTML, build work, mount, and hydration separate;
   use the harness's documented gzip or Brotli measurement for each value.
6. Profile the corrected first-load and payload results. For Arena, test the
   top-three first-load threshold of 117,786 B and keep the CSS-growth slope
   visible against the 2.0 B/declaration peers. Attribute client bytes using
   compressed asset experiments and module evidence before removing code.
7. Explore CSS emission changes that reduce the default strategy's compressed
   growth without changing cascade, selectors, SSR, or class semantics. Treat
   named atoms as a measured candidate with its current first-load and
   class-attribute costs, not as a default switch.
8. Preserve strong raw CSS, SSR, build, dev-start, HMR, and hydration results
   as regressions guards. Update the short benchmark summary with primary-lane
   top-five comparisons and keep detailed per-run measurements in `PERF.md`.

### Tech choices

| Choice                | Decision                                               | Rationale                                                                                 |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Primary benchmark API | The `createCss(preset)` family, selected by host need  | This represents the authored-style API without forcing one return shape onto every host.  |
| Bonus API lane        | Keep `tw(...)` separate                                | It is useful for utility-class comparisons, but answers a different performance question. |
| CSS build path        | Actual `pandwindCssVite(css)` from the pinned artifact | The benchmark must exercise the shipped compiler integration.                             |
| Fully static proof    | Inspect transformed modules and bundled assets         | Source-level literals alone do not prove runtime work was removed.                        |
| Class strategy        | Keep hash default; retain named atoms as opt-in        | Named atoms win the large-style slope but lose baseline and class-attribute bytes.        |
| Optimization order    | Fix representation, attribute bytes, then optimize     | Do not spend time chasing a rank produced by the wrong API lane or shared app code.       |

### Architecture

The primary browser path is authored CSS through the shipped Vite compiler;
the benchmark records its emitted JavaScript and sheet independently. The
utility path remains a distinct comparison and is excluded from the main
Pandwind row.

### Benchmark cadence

Run focused compiler and byte regressions after changes to the CSS compiler,
runtime, or bundler integration. During active optimization, run the local
matrix monthly; refresh the full Arena and Bench comparisons quarterly or
after a major library, compiler, or ecosystem change, not for every JJ
revision. Record the exact revisions and environment on every refreshed
report.

## What this allows

- A defensible rank for Pandwind's main static CSS API.
- A separate utility-class comparison that shows what `tw(...)` adds.
- Targeted compiler, stylesheet, and bundle improvements backed by parity and
  compressed-byte evidence.
- A clear account of what limits top-three Arena first load and top-five Bench
  payload if those targets remain out of reach.

## What this does not allow

- New public styling APIs or changes to the frozen `css()` / `tw()` contracts.
- Counting both Pandwind API lanes as two competing libraries in one ranking.
- Treating the current `tw(...)` payload rank as the result for `css(...)`.
- Changing hash classes to named atoms, weakening CSS semantics, or removing
  runtime code without full workload measurements and parity proof.
- Claiming compressed savings from uncompressed module attribution alone.

## Open questions

1. Does the actual `css(...)` plus `css.props(...)` call path produce a browser
   bundle with no per-call declaration compiler, or does the host-props
   projection leave a measurable runtime helper? Resolve from transformed
   output and the first corrected bundle.
2. Does the corrected Bench `css(...)` lane preserve the current #3 hydration
   result while improving the payload rank? Establish this from the new run;
   do not infer it from the `tw(...)` lane.

## Implementation steps

1. [x] Reproduce and archive the existing pinned Arena and Bench baselines, with
       each result labeled by the exact Pandwind API and plugin path.
2. [x] Keep Arena's `css.class(...)` projection for its className-oriented
       components. Add callable `css(...)` composition and `css.props(...)` only
       where a host naturally forwards maps; do not bulk-convert class-string
       callsites. Keep the six-page route matrix and screenshot/geometry proof.
3. [x] Add the Bench `pandwind-css` product-grid lane using `pandwindCssVite(css)`
       from the pinned artifact. Retain the old `pandwind-buildtime` result as the
       secondary `tw(...)` lane.
4. [x] Add focused compiler-output assertions for multi-argument static
       `css(...)`, `css.props(...)`, CSS sheet membership, and absence of runtime
       declaration compilation. Reuse compiler cases for runtime-versus-plugin
       output parity; cover the conservative path separately if any values remain
       dynamic.
5. [x] Run Arena and Bench parity, then regenerate the normalized snapshots,
       detailed `PERF.md`, short top-five summary, and reference benchmark page.
       Identify primary-lane ranks separately from the `tw(...)` bonus row.
6. [x] Use emitted CSS, compressed assets, and current module attribution to
       isolate first-load and CSS-slope costs. The refreshed evidence did not
       justify a safe output deletion: Arena's residual Pandwind JavaScript is in
       the runtime `cx`/preset path, and the cross-module `cx` experiment changed
       no route modules. Keep that compiler work as a ranked follow-up instead of
       making an unproven rewrite.
7. [x] Re-run the focused regressions and both pinned external suites after the
       optimization. Describe benchmark setup, compiler change, and report refresh
       in separate JJ revisions.

## Acceptance criteria

- [x] The scored Pandwind lanes use the `createCss(preset)` API family
      idiomatically: `css.class(...)` for class-string hosts and at least one
      real multi-object `css(...)` plus `css.props(...)` map boundary across
      the suite. `css.group(...)` and `css.vars(...)` appear only where their
      workload use case is real; coverage never changes semantics.
- [x] Both primary lanes run the shipped `pandwindCssVite(css)` compiler from
      a pinned Pandwind artifact, with no benchmark-only reimplementation.
- [x] Static authored declarations produce the exact expected class maps and
      stylesheet, and the browser bundle contains no per-call CSS declaration
      compilation. Any retained host-props adapter is independently measured.
- [x] Arena geometry/screenshots and Bench DOM/pixel checks pass at the same
      workload coverage before any ranking is reported.
- [x] The `css(...)` main score and `tw(...)` bonus score have distinct labels;
      the bonus lane does not change the main competitor count or rank.
- [x] The report keeps JS, CSS, SSR HTML, and timing categories separate,
      including compression type, revisions, environment, and parity status.
- [x] Arena's top-three first-load threshold and 800-style CSS slope are
      measured. Named atoms reach 1.8 B/declaration, while default hash stays
      at 5.8 B against the 2.0 B peers; the first-load/default-hash gaps are
      source-attributed and have ranked follow-ups in the completion record.
- [x] Bench reports the corrected `css(...)` payload rank and component sizes;
      top five remains the optimization target, while the refreshed #16/16
      `tw(...)` result is explicitly secondary.
- [x] Hash remains default unless a parity-gated real workload shows named
      atoms reduce total transfer cost after first load, CSS, and markup are
      counted together.
- [x] The compact summary shows top-five results for the primary API, and
      `PERF.md` retains the detailed comparison evidence.

## Completion record — 2026-09-25

The primary API score now measures `createCss(preset)` through the shipped
`pandwindCssVite(css)` plugin. Arena uses `css.class(...)` where React expects a
class string; the Bench product-grid additionally exercises static multi-map
`css(...)` composition forwarded through `css.props(...)`. Only the rating
percentage remains a runtime style value in the Bench lane. Its static
compiler-output tests compare generated props and classes against the real
runtime API and assert that calls are removed from the transformed module and
styles are emitted once in the virtual sheet.

| Comparison                             | Pinned sources and parity                                                                                                                                                                                       | Primary `createCss` result                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS-in-JS Arena, six routes            | Arena `2f4ed369a107a186b8108184871bba0777f23fe4`; Pandwind `bc1b904c5d6795d43396b9f364a127fd68c2f436`; Apple M4, Node 24.20.0, Vite 8.2.1; 18/18 geometry and 72/72 screenshots passed                          | CSS raw #1/4 at 31,732 B; CSS Brotli #3/4 at 8,724 B; JS Brotli #4/4 at 111,644 B; full first load #4/4 at 125,838 B; cold/warm builds #1/4 at 2,465/1,997 ms; shared edit paint #1/4 at 199.9 ms                                                                         |
| CSS-in-JS Bench, 400-tile product grid | Bench `9ed62df69397`; Pandwind `bc1b904c5d6795d43396b9f364a127fd68c2f436`; Apple M4, Node 24.20.0, WPD 0.15.1, Chrome 154.0.8037.57, Firefox stable 156.0.1; all 21 lanes passed DOM/pixel parity over 13 cases | Payload #7/16 at 10,539 B gzip (0 B JS + 1,492 B CSS + 9,047 B HTML); SSR throughput #1/16 at 269,852 tiles/s; mount #7/16 at 34.7 ms; hydration #3/16 at 22.1 ms; cold build #15/17 at 375 ms; INP unranked at 33.2 ms because medians cluster within frame-timing noise |

The Bench CSS lane is one real product-grid workload; the 13-case result
coverage and competitor ranks belong to the harness as a whole. Its `tw(...)`
bonus lane remains separate: payload #16/16 at 43,346 B, SSR throughput #5/16,
mount #6/16, hydration #10/16, and cold build #17/17. It does not alter the
primary score denominator.

Arena's top-three full-load threshold is 117,786 B, leaving an 8,052 B gap;
the top-three JavaScript threshold is 102,731 B, leaving an 8,913 B gap. The
current module attribution places Pandwind's `cx`, preset, and CSS runtime
modules in a shared 14,437 B Brotli chunk with 4,967 B of app source. These are
source/module owners, not independent compressed savings. The attempted
cross-module `cx` fold changed none of the six route modules, so the plan did
not claim a code-size win without output evidence. The 800-style Arena sweep
still measures 5.8 Brotli B per declaration for hash classes versus 2.0 B for
Bamboo and Panda. Named atoms reach 1.8 B per declaration but increase the
Bench page payload from 10,539 B to 18,352 B and add 89,501 raw class-attribute
bytes in Arena; hash remains the default.

### Ranked follow-ups

1. **Arena JavaScript and first load.** Close the measured 8,913 B JS gap by
   profiling runtime `cx` calls and preset data that survive static CSS
   extraction. Start with imported class constants in conditional `cx` calls;
   only fold cases whose branch and conflict behavior can be proven against
   the runtime. Require emitted-bundle size and the existing 18 geometry / 72
   screenshot parity gate for any change.
2. **Bench product-grid payload.** Close the 2,352 B gap to the current top-five
   cutoff of 8,187 B. HTML is 9,047 B of the 10,539 B total, so inspect SSR
   class-attribute output and repeated host props before spending effort on the
   already small 1,492 B CSS file. Keep DOM/pixel parity as the constraint.
3. **Large style-set CSS growth.** Reduce the default hash strategy's measured
   5.8 B/declaration Brotli slope toward the 2.0 B peers without increasing
   full transfer size on ordinary pages. Named atoms already demonstrate the
   scale trade-off, but their current real-workload payload is larger, so they
   remain diagnostic rather than default.

The refreshed short report is [PERF-SUMMARY.md](../PERF-SUMMARY.md), detailed
Pandwind comparison is [PERF.md](../PERF.md), and normalized Arena/Bench inputs
are in `benchmarks/css-in-js-arena/snapshot.json` and
`benchmarks/css-in-js-bench/snapshot.json`. Both external repositories now
record the same source revisions and current payload figures in their READMEs.

## Decisions log

| Date       | Decision                                                                      | Rationale                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-24 | Score the `createCss(preset)` API family as primary; label `tw(...)` as bonus | The main benchmark should use each CSS projection where its host use case calls for it; Bench's existing headline result measures only the utility lane. |
| 2026-09-24 | Use `pandwindCssVite(css)` from the pinned package in both primary lanes      | The comparison should exercise the actual shipped static compiler integration.                                                                           |
| 2026-09-24 | Keep hash classes as default pending total-workload evidence                  | Named atoms improve large-style CSS slope but currently add first-load and class-attribute cost.                                                         |
| 2026-09-24 | Optimize only after the corrected lane is parity-gated and attributed         | Existing results show strong categories, and prior module attribution did not prove a safe general runtime deletion.                                     |
