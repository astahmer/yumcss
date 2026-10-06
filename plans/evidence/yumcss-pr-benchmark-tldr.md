# YumCSS PR-style benchmark TL;DR

This is a local comparison report using YumCSS lanes added to working copies
of the two reference benchmark repositories. The upstream repositories were
not modified, committed, or pushed. The lanes use YumCSS's real APIs and the
benchmark harnesses' own measurement tools.

Measured context:

- YumCSS: current working tree, macOS arm64, Node `v24.19.0`.
- [css-in-js-bench](https://github.com/jantimon/css-in-js-bench): pinned
  reference `3dee1bc32e651ace01c5e4d9306c541337d0c1ce`.
- [css-in-js-arena](https://github.com/gajus/css-in-js-arena): pinned
  reference `a8f4d041251b8a1f00e351bb67299258a58640fb`.

## The short answer

YumCSS's strongest measured result is not its raw runtime call speed. It is
the static-first path:

```text
literal tw() / css() / dss()
        -> compiler extraction
        -> ordinary class strings + one generated stylesheet
        -> zero YumCSS style work at render time
```

That puts the extracted `tw()` path in the same performance category as
StyleX, Bamboo, Panda's extracted paths, and next-yak's folded paths. The
external workloads do not contain a useful design-vocabulary equivalent, so
there is no honest dedicated `dss()` rank yet. `css.class()` is measured in
the arena's migrated app and in the mixed API cases in the build-time lane.

The dynamic fallback is still useful, but it is a different product shape:

| API     | Current direct-call evidence | Static literal behavior                                 | Honest conclusion                                                          |
| ------- | ---------------------------: | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `tw()`  |     **1.12M ops/sec** median | Extractable; dynamic calls retain runtime compilation   | Fastest YumCSS style-object API in this sample                             |
| `dss()` |     **534K ops/sec** median* | Extractable after design-vocabulary resolution          | More work than `tw()` because it resolves `$frame`/`$text` semantics first |
| `css()` |      **422K ops/sec** median | Extractable; compiler-pruned calls pay no style runtime | General CSS fallback is slower but remains small and fully expressive      |

\* `dss()` is an exploratory current-process measurement using the example
preset, not yet a committed benchmark snapshot or an external-harness lane.

## YumCSS-only ranking

For the current direct-call sample, higher throughput ranks as follows:

| Rank | API     |        Median |
| ---: | ------- | ------------: |
|    1 | `tw()`  | 1.12M ops/sec |
|    2 | `dss()` |  534K ops/sec |
|    3 | `css()` |  422K ops/sec |

This ranking describes repeated dynamic-ish calls in one process. It does not
describe production performance for literal calls, because the compiler
removes those calls before they reach the browser.

## Directional comparison with the existing runtime table

The repository's existing competitor table reports different call shapes and
was measured under a different run. It is useful for orientation, not a
formal league table:

| Implementation                  | Median ops/sec | Interpretation                                    |
| ------------------------------- | -------------: | ------------------------------------------------- |
| StyleX `props()`                |          7.83M | Precompiled object iteration                      |
| YumCSS `cx()` current snapshot  |          6.17M | Warm class-string merge; included for context     |
| `tailwind-merge()`              |          2.62M | Precomputed class-string merge                    |
| YumCSS `tw()` current snapshot  |          1.12M | Style-object compilation fallback                 |
| YumCSS `dss()` exploratory      |           534K | Design vocabulary resolution plus CSS compilation |
| Emotion `css()`                 |           472K | Runtime hashing/cache path                        |
| YumCSS `css()` current snapshot |           422K | General CSS-object compilation fallback           |
| Panda generated `css()`         |           429K | Runtime system walk                               |

The comparison is intentionally not presented as “YumCSS beats every
library”: StyleX and `tailwind-merge` do less work in their respective rows,
and the measurements are not the same harness or machine. The meaningful
production comparison is the compiler path, where YumCSS avoids these
per-call costs for static source.

## `css-in-js-bench` comparison

This reference benchmark measures the same React cases across lanes:

- SSR render throughput;
- gzipped page payload (`JS + CSS + HTML`);
- cold mount, hydration, and interaction-to-next-paint;
- browser style/layout/paint work;
- scaling as the number of instances grows;
- CSS and markup actually emitted by each lane.

### Measured YumCSS lanes

The local run used the harness's full current microbench and payload
measurement command. It generated 196 cells (`19` lanes × `13` cases). The
command exits non-zero only because the pinned WPD manifest still expects 165
cells; the microbench and payload result files were written and are the data
reported here. WPD/browser rank is therefore intentionally not claimed for
this repository.

| Lane               | Real API exercised                                              | Measured result                                                                     |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `yumcss`           | `createCx()` runtime merge                                      | 230,048 renders/sec mean of case medians; mean rank 14.2 across the 10 shared cases |
| `yumcss-buildtime` | Vite-folded literal `tw()`/`cx()`; `css.class()` in mixed cases | 756,723 renders/sec mean of medians across the 10 shared cases; mean rank 6.3       |

The build-time lane's strongest shared-case results were `compose-6` at rank
1/18 (2,206,897 renders/sec), `compose-3` at rank 3/18 (1,213,654),
`btn-variant` at rank 4/19 (860,709), and `dyn-fair` at rank 4/18
(1,133,412). The deliberately high-cardinality `dyn-translate` case ranked
11/18 (382,476), which is the expected cost of the runtime fallback retained
for a value unavailable at build time.

This is an actual external microbench rank, not an architectural estimate.
It also shows why the two lanes must not be collapsed into one number: the
runtime `cx()` lane prices dynamic merge work, while the build-time lane prices
the residual render path after static extraction. `dss()` remains unranked in
this harness because its design-token vocabulary has no corresponding shared
case.

## `css-in-js-arena` comparison

The pinned arena compares Bamboo, StyleX, Panda, and a locally added YumCSS
lane on the same six-page React Router application. YumCSS starts from the
arena's StyleX workload, is migrated through the real StyleX→YumCSS codemod,
and is built with YumCSS's extraction plugins. Its recorded route matrix and
bytes tool now include all four engines.

| Rank in original arena tally | Engine | Rows won |
| ---------------------------: | ------ | -------: |
|                            1 | Bamboo |  23 / 30 |
|                            2 | Panda  |  13 / 30 |
|                            3 | StyleX |  10 / 30 |

The original tally is retained because the arena's scoring tool is still
three-engine-specific. The four-engine measurements below are the comparable
YumCSS result; they are not silently folded into the old 30-row score.

The arena's measured headline values include:

| Axis                  |    Bamboo |    StyleX |     Panda |    YumCSS |
| --------------------- | --------: | --------: | --------: | --------: |
| Full first load       | 105,091 B | 106,122 B | 112,835 B | 107,641 B |
| CSS brotli            |   6,845 B |   7,008 B |   9,518 B |   6,527 B |
| Cold production build |  3,725 ms |  3,507 ms |  2,964 ms |  1,086 ms |
| Warm production build |  2,032 ms |  3,303 ms |  2,085 ms |  1,021 ms |
| Mean SSR HTML gzip    |   5,534 B |   5,531 B |   5,539 B |   5,462 B |
| CSS rules             |       525 |       467 |       532 |       457 |
| Class-attribute bytes |    93,036 |    70,843 |    92,738 |    64,550 |

YumCSS ranks first for CSS Brotli, CSS rule count, class-attribute bytes,
mean SSR HTML gzip, and both build-time columns in this local four-engine
run. Bamboo remains first for full first-load bytes because YumCSS's client
JavaScript is 3.3% larger gzip than Bamboo in this workload. YumCSS's full
first load is 2.4% larger than Bamboo despite 4.6% smaller CSS Brotli.

Browser comparison covered 24 YumCSS route/viewport/theme states. 20/24
were below the arena's 0.05% pixel-diff threshold; the other four were small
differences on projects-tablet-light (0.0532%), lab-tablet-light (0.0552%),
lab-mobile-light (0.0897%), and projects-desktop-dark (0.1026%). The
projects and lab layout checks found no geometry differences above 1 px. This
is strong parity evidence, but it is not a claim of pixel-perfect identity.

The arena lane measures `createCss()`/`css.class()`/`css.group()` extraction.
It does not separately rank `tw()` or `dss()`; those API surfaces require a
workload authored in their respective semantic vocabulary rather than a
misleading textual substitution.

## Current YumCSS size evidence

The committed runtime snapshot currently records:

| Entry                            | Minified |    Gzip |
| -------------------------------- | -------: | ------: |
| `css()` runtime                  |  6,495 B | 2,924 B |
| `tw()` runtime                   |  2,396 B | 1,141 B |
| `cx()` runtime                   | 12,277 B | 5,174 B |
| all three                        | 14,627 B | 6,025 B |
| compiler-pruned static CSS calls |     81 B |    98 B |

The last row is the important static-first result: after extraction, the
style runtime is effectively absent from the tested bundle. `dss()` does not
have a separate size row because it wraps the CSS engine and shares its
runtime/extraction machinery.

There is also a current gate issue that must be fixed before treating the
size record as a clean release result: `pnpm --filter yumcss run test:size`
currently measures `tw()` at **2,678 minified bytes**, above its **2,400-byte
budget**. This report does not refresh the snapshot or alter runtime code.

## Final verdict

| Question                                                               | Answer                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is YumCSS's static strategy competitive with compile-time libraries?   | **Architecturally yes; externally unranked until it is a real benchmark lane.**                                                                                               |
| Is `tw()` the fastest YumCSS style-object fallback?                    | **Yes in the current local sample.**                                                                                                                                          |
| Is `dss()` slower than `tw()`?                                         | **Yes in the exploratory sample, due to design-token/vocabulary resolution.**                                                                                                 |
| Is `css()` the most flexible fallback?                                 | **Yes; its lower throughput buys general CSS expressiveness.**                                                                                                                |
| Can we claim YumCSS wins `css-in-js-bench` or `css-in-js-arena` today? | **We can claim measured wins on specific axes, not a universal win.** The build-time lane ranks strongly; the runtime `cx()` lane is slower than specialized merge libraries. |
| What remains unmeasured here?                                          | A dedicated `dss()` workload and a clean WPD/browser rank in `css-in-js-bench`; the arena already has bytes, SSR, build, layout, and screenshot evidence.                     |

The defensible TL;DR is: **YumCSS now has measured local lanes in both
external harnesses. Its static build-time lane is competitive—rank 1 on some
shared cases and mean rank 6.3 across the common set—and its extracted arena
CSS is the smallest of the four engines. The runtime fallback is slower but
explicitly prices genuinely dynamic work. The remaining evidence gap is a
dedicated `dss()` workload and a refreshed WPD manifest, not an absent
YumCSS measurement.**
