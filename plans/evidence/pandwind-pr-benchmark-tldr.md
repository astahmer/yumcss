# Pandwind PR-style benchmark TL;DR

This is a local comparison report, written as if Pandwind had opened lanes in
the two reference benchmark repositories. It does **not** modify either
reference repository, does not add a fake benchmark lane, and does not claim
measurements that were not actually run in that harness.

Measured context:

- Pandwind: current working tree, macOS arm64, Node `v24.19.0`.
- [css-in-js-bench](https://github.com/jantimon/css-in-js-bench): pinned
  reference `3dee1bc32e651ace01c5e4d9306c541337d0c1ce`.
- [css-in-js-arena](https://github.com/gajus/css-in-js-arena): pinned
  reference `a8f4d041251b8a1f00e351bb67299258a58640fb`.

## The short answer

Pandwind's strongest result is not its raw runtime call speed. It is the
static-first path:

```text
literal tw() / css() / dcss()
        -> compiler extraction
        -> ordinary class strings + one generated stylesheet
        -> zero Pandwind style work at render time
```

That puts all three APIs in the same _kind_ of performance lane as StyleX,
Bamboo, Panda's extracted paths, and next-yak's folded paths. The current
reference repositories do not contain Pandwind lanes, so an exact external
rank for `tw`, `css`, or `dcss` is not measured yet.

The dynamic fallback is still useful, but it is a different product shape:

| API      | Current direct-call evidence | Static literal behavior                                 | Honest conclusion                                                          |
| -------- | ---------------------------: | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `tw()`   |     **1.12M ops/sec** median | Extractable; dynamic calls retain runtime compilation   | Fastest Pandwind style-object API in this sample                           |
| `dcss()` |     **534K ops/sec** median* | Extractable after design-vocabulary resolution          | More work than `tw()` because it resolves `$frame`/`$text` semantics first |
| `css()`  |      **422K ops/sec** median | Extractable; compiler-pruned calls pay no style runtime | General CSS fallback is slower but remains small and fully expressive      |

\* `dcss()` is an exploratory current-process measurement using the example
preset, not yet a committed benchmark snapshot or an external-harness lane.

## Pandwind-only ranking

For the current direct-call sample, higher throughput ranks as follows:

| Rank | API      |        Median |
| ---: | -------- | ------------: |
|    1 | `tw()`   | 1.12M ops/sec |
|    2 | `dcss()` |  534K ops/sec |
|    3 | `css()`  |  422K ops/sec |

This ranking describes repeated dynamic-ish calls in one process. It does not
describe production performance for literal calls, because the compiler
removes those calls before they reach the browser.

## Directional comparison with the existing runtime table

The repository's existing competitor table reports different call shapes and
was measured under a different run. It is useful for orientation, not a
formal league table:

| Implementation                    | Median ops/sec | Interpretation                                    |
| --------------------------------- | -------------: | ------------------------------------------------- |
| StyleX `props()`                  |          7.83M | Precompiled object iteration                      |
| Pandwind `cx()` current snapshot  |          6.17M | Warm class-string merge; included for context     |
| `tailwind-merge()`                |          2.62M | Precomputed class-string merge                    |
| Pandwind `tw()` current snapshot  |          1.12M | Style-object compilation fallback                 |
| Pandwind `dcss()` exploratory     |           534K | Design vocabulary resolution plus CSS compilation |
| Emotion `css()`                   |           472K | Runtime hashing/cache path                        |
| Pandwind `css()` current snapshot |           422K | General CSS-object compilation fallback           |
| Panda generated `css()`           |           429K | Runtime system walk                               |

The comparison is intentionally not presented as “Pandwind beats every
library”: StyleX and `tailwind-merge` do less work in their respective rows,
and the measurements are not the same harness or machine. The meaningful
production comparison is the compiler path, where Pandwind avoids these
per-call costs for static source.

## `css-in-js-bench` comparison

This reference benchmark measures the same React cases across lanes:

- SSR render throughput;
- gzipped page payload (`JS + CSS + HTML`);
- cold mount, hydration, and interaction-to-next-paint;
- browser style/layout/paint work;
- scaling as the number of instances grows;
- CSS and markup actually emitted by each lane.

### What is measured for Pandwind

No Pandwind lane exists in the pinned benchmark output. Therefore the status
is:

| Pandwind lane | External benchmark status        | Expected behavior when statically eligible                    |
| ------------- | -------------------------------- | ------------------------------------------------------------- |
| `tw()`        | **Not measured in this harness** | Build-time class emission; no Pandwind render-time style work |
| `css()`       | **Not measured in this harness** | Atomic CSS extraction; no Pandwind render-time style work     |
| `dcss()`      | **Not measured in this harness** | Design resolution folded into the same extracted CSS lane     |

The static expectation is supported by Pandwind's own Vite/browser fixtures,
but it is not a substitute for adding an isolated lane to the external
benchmark. Dynamic or unsupported calls would use the runtime fallback and
must be measured separately; they should not inherit the static claim.

### Reference ranking, not Pandwind ranking

The checked-in `css-in-js-bench` summary says:

- build-time lanes show approximately zero styling-library work in hydration;
- runtime libraries pay for style generation/injection during SSR and browser
  work;
- extracted/static lanes generally scale flatter for static styles;
- runtime-generated distinct values become substantially more expensive as
  cardinality grows.

Its headline table is therefore directly relevant to Pandwind's design choice,
but it does not rank Pandwind. A future real PR would need three isolated
`techs/pandwind-*` lanes and would need to rerun the same cases, including the
dynamic cases, before publishing a rank.

## `css-in-js-arena` comparison

The pinned arena compares Bamboo, StyleX, and Panda on the same six-page React
Router application. Its recorded tally is:

| Rank in arena | Engine | Rows won |
| ------------: | ------ | -------: |
|             1 | Bamboo |  23 / 30 |
|             2 | Panda  |  13 / 30 |
|             3 | StyleX |  10 / 30 |

The arena's measured headline values include:

| Axis                        |    Bamboo |    StyleX |     Panda |
| --------------------------- | --------: | --------: | --------: |
| Full first load             | 105,097 B | 106,117 B | 112,840 B |
| CSS brotli                  |   6,845 B |   7,008 B |   9,518 B |
| Cold production build       |  1,358 ms |  2,282 ms |  1,613 ms |
| Shared edit → correct paint |    210 ms |    199 ms |    170 ms |
| Delete a page → CSS change  |    −20.0% |     −8.4% |    −13.5% |

Pandwind has no arena score. Its existing example stylesheet and runtime-size
records are different workloads and must not be inserted into this table.
The useful architectural comparison is that Pandwind's static `tw`, `css`,
and `dcss` calls are designed to compete in this compile-time category, while
the runtime fallback is not a substitute for an extracted lane.

## Current Pandwind size evidence

The committed runtime snapshot currently records:

| Entry                            | Minified |    Gzip |
| -------------------------------- | -------: | ------: |
| `css()` runtime                  |  6,495 B | 2,924 B |
| `tw()` runtime                   |  2,396 B | 1,141 B |
| `cx()` runtime                   | 12,277 B | 5,174 B |
| all three                        | 14,627 B | 6,025 B |
| compiler-pruned static CSS calls |     81 B |    98 B |

The last row is the important static-first result: after extraction, the
style runtime is effectively absent from the tested bundle. `dcss()` does not
have a separate size row because it wraps the CSS engine and shares its
runtime/extraction machinery.

There is also a current gate issue that must be fixed before treating the
size record as a clean release result: `nub run --filter pandwind test:size`
currently measures `tw()` at **2,678 minified bytes**, above its **2,400-byte
budget**. This report does not refresh the snapshot or alter runtime code.

## Final verdict

| Question                                                                 | Answer                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is Pandwind's static strategy competitive with compile-time libraries?   | **Architecturally yes; externally unranked until it is a real benchmark lane.**                                                                                            |
| Is `tw()` the fastest Pandwind style-object fallback?                    | **Yes in the current local sample.**                                                                                                                                       |
| Is `dcss()` slower than `tw()`?                                          | **Yes in the exploratory sample, due to design-token/vocabulary resolution.**                                                                                              |
| Is `css()` the most flexible fallback?                                   | **Yes; its lower throughput buys general CSS expressiveness.**                                                                                                             |
| Can we claim Pandwind wins `css-in-js-bench` or `css-in-js-arena` today? | **No. Those repositories have not measured Pandwind.**                                                                                                                     |
| What must a real PR prove?                                               | Add isolated `tw`, `css`, and `dcss` lanes, rerun every shared case, and compare SSR, hydration, browser work, payload, CSS bytes, and scaling under identical conditions. |

The defensible TL;DR is: **Pandwind is designed to be a zero-style-runtime
competitor for statically representable code, with a compact and capable
fallback for genuinely dynamic code. The local fallback is healthy, but the
two external benchmark repositories still provide no measured Pandwind rank,
and the current `tw()` size budget needs repair.**
