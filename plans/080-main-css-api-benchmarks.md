# Main CSS API benchmark and optimization plan

## Context

- The 2026-09-24 CSS-in-JS Arena run used Pandwind revision
  `65a1cfdca44da3c33899c2f138523309a9cf6834`. The six-page implementation
  builds with `pandwindCssVite(css)` and passes its geometry and screenshot
  gates. Its authored declarations mostly use `css.class(...)`, so it measures
  the real static CSS compiler and its class-string projection, but not the
  callable `css(...styles)` API that should represent Pandwind's primary lane.
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
  `css.class(...)` calls. The missing evidence is whether the primary callable
  form, including its host-props boundary, reaches the intended fully static
  client output in both external benchmark harnesses.
- The previous output work is recorded in
  [plan 078](078-benchmark-output-regressions.md). This plan corrects API
  representation first, then optimizes only costs that the corrected results
  attribute to Pandwind.

## Goal

Make the callable `css(...styles)` API the primary, parity-gated Pandwind
benchmark lane, retain `tw(...)` as a separately labeled bonus lane, and use
the corrected results to improve first-load size and compressed CSS scaling.

## What

- Author the primary lane with `createCss(preset)`, multi-argument
  `css(base, responsive, state)` composition, and `css.props(...)` at host
  boundaries. Use `css.class(...)` only where the host genuinely needs a class
  string.
- Build that lane through the pinned package's actual `pandwindCssVite(css)`
  plugin and its matching preset. Keep the declarations static; represent
  state changes with selections among statically authored styles. Any truly
  dynamic style-value case belongs in a separate, explicitly dynamic result.
- Add the primary lane to both the six-page Arena workload and CSS-in-JS Bench
  product-grid workload. Keep the current `tw(...)` lane as a separately
  reported secondary comparison using `pandwindVite()`.
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
path, while the product's central authored-style API is `css(...)`. Measuring
that API through its real Vite compiler gives a fair basis for deciding
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
2. Port the Arena Pandwind implementation to the callable `css(...)` form and
   `css.props(...)` host boundary without changing routes, interactions,
   markup meaning, tokens, or visual output. Keep direct class projection only
   for components whose actual boundary requires a string.
3. Add a Bench `pandwind-css` lane for the existing product-grid scenario.
   Use the same `createCss` preset and `pandwindCssVite(css)` integration as a
   consuming Vite application; do not copy or reconstruct the plugin's
   compiler behavior in a benchmark-only adapter.
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

| Choice | Decision | Rationale |
| --- | --- | --- |
| Primary benchmark API | Callable `css(...styles)` with `css.props(...)` | This is the main authored-style API the report should represent. |
| Bonus API lane | Keep `tw(...)` separate | It is useful for utility-class comparisons, but answers a different performance question. |
| CSS build path | Actual `pandwindCssVite(css)` from the pinned artifact | The benchmark must exercise the shipped compiler integration. |
| Fully static proof | Inspect transformed modules and bundled assets | Source-level literals alone do not prove runtime work was removed. |
| Class strategy | Keep hash default; retain named atoms as opt-in | Named atoms win the large-style slope but lose baseline and class-attribute bytes. |
| Optimization order | Fix representation, attribute bytes, then optimize | Do not spend time chasing a rank produced by the wrong API lane or shared app code. |

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

1. Reproduce and archive the existing pinned Arena and Bench baselines, with
   each result labeled by the exact Pandwind API and plugin path.
2. Convert the Arena lane to callable `css(...)` composition and host props;
   keep the six-page route matrix and existing screenshot/geometry proof.
3. Add the Bench `pandwind-css` product-grid lane using `pandwindCssVite(css)`
   from the pinned artifact. Retain the old `pandwind-buildtime` result as the
   secondary `tw(...)` lane.
4. Add focused compiler-output assertions for multi-argument static
   `css(...)`, `css.props(...)`, CSS sheet membership, and absence of runtime
   declaration compilation. Reuse compiler cases for runtime-versus-plugin
   output parity; cover the conservative path separately if any values remain
   dynamic.
5. Run Arena and Bench parity, then regenerate the normalized snapshots,
   detailed `PERF.md`, short top-five summary, and reference benchmark page.
   Identify primary-lane ranks separately from the `tw(...)` bonus row.
6. Use source maps, emitted CSS, and compressed asset experiments to isolate
   attributable first-load and CSS-slope costs. Implement only the smallest
   compiler or output change supported by that evidence, with focused
   regression coverage.
7. Re-run the focused regressions and both pinned external suites after the
   optimization. Describe benchmark setup, compiler change, and report refresh
   in separate JJ revisions.

## Acceptance criteria

- [ ] The scored Pandwind Arena and Bench lanes use callable `css(...)` with
      real multi-object composition; `css.class(...)` appears only where a
      class string is the natural host boundary.
- [ ] Both primary lanes run the shipped `pandwindCssVite(css)` compiler from
      a pinned Pandwind artifact, with no benchmark-only reimplementation.
- [ ] Static authored declarations produce the exact expected class maps and
      stylesheet, and the browser bundle contains no per-call CSS declaration
      compilation. Any retained host-props adapter is independently measured.
- [ ] Arena geometry/screenshots and Bench DOM/pixel checks pass at the same
      workload coverage before any ranking is reported.
- [ ] The `css(...)` main score and `tw(...)` bonus score have distinct labels;
      the bonus lane does not change the main competitor count or rank.
- [ ] The report keeps JS, CSS, SSR HTML, and timing categories separate,
      including compression type, revisions, environment, and parity status.
- [ ] Arena first load targets the pinned top-three threshold of 117,786 B;
      the 800-style compressed CSS slope moves toward the 2.0 B/declaration
      peers without regressing the current strong categories. Any remaining
      gap has source-attributed evidence and a ranked next action.
- [ ] Bench reports the corrected `css(...)` payload rank and component sizes;
      top five is the optimization target, while the old #18 `tw(...)` result
      remains explicitly secondary.
- [ ] Hash remains default unless a parity-gated real workload shows named
      atoms reduce total transfer cost after first load, CSS, and markup are
      counted together.
- [ ] The compact summary shows top-five results for the primary API, and
      `PERF.md` retains the detailed comparison evidence.

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-24 | Score callable `css(...)` as the primary Pandwind lane; label `tw(...)` as bonus | Current Bench payload ranking measures the utility lane, while the user-facing main API is callable CSS composition. |
| 2026-09-24 | Use `pandwindCssVite(css)` from the pinned package in both primary lanes | The comparison should exercise the actual shipped static compiler integration. |
| 2026-09-24 | Keep hash classes as default pending total-workload evidence | Named atoms improve large-style CSS slope but currently add first-load and class-attribute cost. |
| 2026-09-24 | Optimize only after the corrected lane is parity-gated and attributed | Existing results show strong categories, and prior module attribution did not prove a safe general runtime deletion. |
