# Styling bundle-size benchmark

This is a pinned, app-delta comparison of static and runtime JavaScript styling
systems. Every lane builds a small DOM application twice: once with the styling
implementation and once without it. The snapshot records the styled build,
unstyled baseline, and signed delta for minified and gzip-compressed JavaScript
and extracted CSS.

The compact rankings are generated into [`PERF.md`](../../PERF.md). The
reviewable source records are:

- [`bundle-size.json`](snapshots/bundle-size.json), the machine-readable record;
- [`bundle-size.md`](snapshots/bundle-size.md), the full tables and versions.

Run the regression gate with:

```sh
pnpm run bench:size:ecosystem
```

Refresh the pinned comparison intentionally with:

```sh
pnpm run bench:size:ecosystem -- --update
```

The runner also accepts `--library NAME` and `--category static|runtime`. Run
it with `--help` for the complete lane list.

## What is measured

Static lanes use the library's normal build integration and report extracted
CSS as shipped assets. Runtime lanes use an actually dynamic value and report
the JavaScript required to create the styles; injected CSS is created in the
browser and therefore is not a shipped CSS asset. The runtime table labels
`injected` versus Pandwind's `none` fallback delivery explicitly so a zero
CSS-asset delta is not mistaken for zero runtime styling work.

The static comparison includes Pandwind, Tailwind CSS, Panda CSS, StyleX,
Vanilla Extract, Sprinkles, UnoCSS, and Linaria. The runtime comparison includes
Pandwind's preset-bound, runtime-sheet, and unsafe paths plus Emotion,
styled-components, and Goober. Component-library overhead, React DOM, and
framework rendering are intentionally outside the fixture.

The application intent is equivalent rather than syntactically identical: a
repeated button/card workload with colors, spacing, radii, hover state, a
responsive state, and a runtime color in the dynamic lanes. The build mode and
package versions are stored beside every snapshot.

Competitor rows are descriptive. Only Pandwind rows are regression-gated,
because competitor releases and compiler output can change independently.
