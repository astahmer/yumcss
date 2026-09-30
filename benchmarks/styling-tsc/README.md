# Styling TypeScript benchmark

This is a version-pinned comparison of the typecheck cost of realistic styling
code. It measures Pandwind against a broad set of type-dependent CSS-in-JS and
static-CSS authoring APIs using each library's native API.

The compact cross-library ranking and generated-facade result are kept in
[`PERF.md`](../../PERF.md). Detailed machine-readable and full-table records
remain under `snapshots/`.

Run the checked-in regression gate with:

```sh
pnpm run bench:tsc:styling
```

Establish or intentionally refresh the descriptive comparison snapshot with:

```sh
pnpm run bench:tsc:styling -- --update
```

The runner accepts <code>--samples N</code>, <code>--library NAME</code>, and
<code>--scenario natural|stress</code>. Run it with <code>--help</code> for the
complete library list. The benchmark package and its runner can be typechecked
independently:

```sh
pnpm --filter pandwind-styling-tsc-benchmark run typecheck
```

## Workloads

The fixture generator is the source of truth. It creates two equivalent
workload sizes for every library:

- <code>natural</code>: 12 repeated component-style uses and a 16-entry token
  catalog.
- <code>stress</code>: 180 repeated component-style uses and a 128-entry token
  catalog.

Pandwind's inferred and generated fixtures exercise <code>css()</code>, <code>css.class()</code>,
<code>css.props()</code>, <code>css.vars()</code>, <code>css.group()</code>,
<code>css.input()</code>, <code>createCx()</code>, tokens, semantic tokens,
color palettes, conditions, and strict property typing. The comparison lanes
cover:

- Panda CSS, StyleX, and Vanilla Extract Sprinkles as generated design-system
  APIs;
- Emotion, styled-components, Goober, Griffel, Linaria, Compiled, and next-yak as
  object, template, styled-component, or compile-time CSS-in-JS APIs;
- Vanilla Extract core and Treat as typed static style declarations;
- Stitches as a typed theme/variant API;
- JSS, React-JSS, Fela, Aphrodite, Style9, and TypeStyle as established
  object-style APIs;
- React Strict DOM as a typed StyleX-compatible API.

Stitches is retained as a historical type-surface reference because its
official site says it is no longer maintained. Aphrodite, Treat, and some
legacy declaration packages are similarly reference lanes, not package
recommendations. Component libraries such as MUI or Chakra are intentionally
not included: their styling APIs are coupled to much larger component and
theme contracts rather than being comparable standalone styling primitives.

Each workload is checked in a fresh TypeScript process with extended
diagnostics. The recorded median includes:

- files in the compiler program;
- symbols;
- types;
- type instantiations;
- peak TypeScript memory in KiB;
- check time;
- total process time.

## Reproducibility and interpretation

Panda's generated <code>styled-system</code> is recreated with its pinned code
generator before every run. All other sources are recreated by
<code>runner/generate-fixtures.mts</code>. Generated sources are ignored and
the committed JSON/Markdown files under <code>snapshots/</code> are the
reviewable evidence.

The Pandwind natural and stress rows are regression gates. They allow 10%
growth in instantiations and memory and 50% growth in check and total time;
the wider time bound accounts for sub-10ms process noise.
TypeScript, Node, platform, or architecture changes require reviewing and
refreshing the baseline; memory and time comparisons are skipped when the
machine environment differs. Competitor rows are descriptive rather than CI
gates because their generated declaration graphs and dependency sets are
owned by their pinned releases.

The `pandwind-generated` row runs the same natural/stress workload after
`pandwind-codemod css generate` materializes a concrete facade from the same
preset. It is regression-checked alongside inferred Pandwind; the other
libraries remain descriptive comparison rows.

These numbers compare typecheck workloads, not universal library quality or
runtime/browser performance. The source shapes express the same broad intent,
but generated declarations, compiler plugins, and build-time transforms are
part of each library's normal consumer experience and therefore remain in the
measurement.

## Generated CSS type facade benchmark

The generated-types benchmark compares the normal preset-inferred Pandwind
surface with the opt-in concrete facade emitted by
`pandwind-codemod css generate`. Both lanes exercise the same `css()`,
`css.class()`, `css.vars()`, `css.props()`, `css.raw()`, `css.group()`,
`css.input()`, `cx()`, and `cx.vars()` workload. The generated lane replaces
repeated preset/type-level evaluation with concrete property and token unions
while retaining the public `CssFn` surface; it does not add a second styling
runtime or browser JavaScript.

It measures these paired catalog/app sizes and stores the evidence in
`snapshots/generated-types-poc.json` and `snapshots/generated-types-poc.md`:

- `minimal`: 8 component styles and 16 generated catalog entries;
- `medium`: 32 component styles and 64 generated catalog entries;
- `large`: 128 component styles and 256 generated catalog entries;
- `huge`: 512 component styles and 1024 generated catalog entries.

```sh
pnpm --filter pandwind run build
pnpm run bench:tsc:generated -- --update
pnpm run bench:tsc:generated
```

The benchmark intentionally isolates the consumer boundary where generated
types are shipped alongside the runtime implementation; preset authoring and
generation cost is not part of the consumer typecheck measurement. The
generated facade is an opt-in production API, while this benchmark keeps its
declaration fixture self-contained so it can measure type cost without making
codegen setup noise part of every run. Time regressions also need to exceed a
50ms absolute noise floor, keeping sub-50ms process jitter from making the
gate flaky.

The runner synthesizes consumer projects from per-library TypeScript source.
Its manifest dependencies are installed for those generated fixtures, so the
Knip configuration records them as dynamic benchmark inputs.
