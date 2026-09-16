# Styling TypeScript benchmark

This is a version-pinned comparison of the typecheck cost of realistic styling
code. It measures Pandwind against a broad set of type-dependent CSS-in-JS and
static-CSS authoring APIs using each library's native API.

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

Pandwind's fixture exercises <code>css()</code>, <code>css.class()</code>,
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

These numbers compare typecheck workloads, not universal library quality or
runtime/browser performance. The source shapes express the same broad intent,
but generated declarations, compiler plugins, and build-time transforms are
part of each library's normal consumer experience and therefore remain in the
measurement.
