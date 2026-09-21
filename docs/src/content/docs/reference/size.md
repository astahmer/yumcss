---
title: Bundle & stylesheet sizes — measured, not guessed
description: Runtime size contract for css() / tw() / cx() plus real example-app CSS output.
sidebar:
  order: 2
---

Last measured: **2026-09-21** for the Pandwind runtime byte record. The
competitor rows retain the supplied reference measurements for the named
versions. The environment was local macOS (arm64), Node v24.19.0, esbuild
0.28.2. Pandwind numbers come from real browser-targeted esbuild bundles
(bundle + minify, gzip level 6) and are rounded to two decimals here.

This is the canonical size page. The root `SIZE.md` is only a pointer; the
exact machine-readable record is
[`runtime-size.json.snap`](https://github.com/astahmer/pandwind/blob/main/packages/pandwind/tests/snapshots/runtime-size.json.snap),
with ceilings in
[`runtime-budget.json`](https://github.com/astahmer/pandwind/blob/main/packages/pandwind/tests/runtime-budget.json).
The compact snapshot-derived typecheck and size summary is in
[`PERF.md`](https://github.com/astahmer/pandwind/blob/main/PERF.md).

## The short version

| entry                                      |      min |     gzip |
| ------------------------------------------ | -------: | -------: |
| `createCss(defaultPreset)` runtime         | 26.01 KB |  9.35 KB |
| `createCss(tailwindPreset)` runtime        | 42.22 KB | 13.83 KB |
| `createCss(chakraPreset)` runtime          | 53.08 KB | 14.50 KB |
| `createCss(pandaPreset)` runtime           | 46.34 KB | 13.46 KB |
| `createCss(shadcnPreset)` runtime          | 87.21 KB | 16.68 KB |
| `createCss(csstypePreset)` runtime         | 19.50 KB |  7.16 KB |
| `createCss(minimal preset)` runtime        | 14.99 KB |  5.83 KB |
| `createUnsafeCss()` fallback runtime       | 11.72 KB |  4.66 KB |
| `createCssRuntime()` core (**internal**)   |  6.29 KB |  2.67 KB |
| `createRuntimeCss()` + runtime sheet       | 37.44 KB | 13.72 KB |
| `tw()` runtime                             |  2.80 KB |  1.31 KB |
| `cx()` plain strings                       |  7.03 KB |  3.01 KB |
| `cx()` + CSS atom registry                 | 18.66 KB |  7.24 KB |
| all direct runtime entries                 | 21.35 KB |  8.21 KB |
| stylesheet generator (**build-time only**) | 25.00 KB |  9.46 KB |

The combined direct runtime is measured at 21.35 KB min / 8.21 KB gzip in this
record for `createUnsafeCss()` + `tw()` + `cx()`. The preset-bound
`createCss(preset)` lanes are measured separately because they also carry the
preset-aware resolver, and the preset they are handed decides how much token
and condition data rides along. The internal `createCssRuntime()` row has no
public method attachments and is included only to show the shared engine's base
cost; applications should use `createCss()` or `createUnsafeCss()` instead.
Fully extracted static calls remain below 100 bytes.

The preset-bound `css()` rows run the same engine with a different preset, and
the preset is what moves the number: the minimal preset (open property catalog,
no tokens) is the engine plus resolver floor, `csstypePreset` swaps in the
structural CSS property vocabulary, and `defaultPreset` adds Pandwind's stock
scale groups (spacing, sizes, radii, shadows, typography) on top of that while
shipping no palette. A runtime lane ships its preset object whole (esbuild
cannot drop token entries an application never reads), so the catalog, not the
engine, is the heavy part of a `css()` bundle that imports a large preset. The
runtime-sheet row uses the minimal preset fixture, so an application whose
preset carries a large catalog should read the `createCss(defaultPreset)` row as
the closer analogue, a Tailwind v4 project should read the
`createCss(tailwindPreset)` row, a Chakra UI v3 project the
`createCss(chakraPreset)` row, and a Panda project the
`createCss(pandaPreset)` row. A shadcn/ui project reads the
`createCss(shadcnPreset)` row, which carries every base color's light and dark
roles and is therefore the widest catalog in this record.

## Pay-per-API and compiler pruning

Each engine has its own subpath export, and the root barrel is side-effect
free. `css()` is subpath-only — the root barrel carries `tw()` + `cx()` — so the
same size gate checks these tree-shaken entry points:

| fixture / import                           |      min |     gzip |
| ------------------------------------------ | -------: | -------: |
| `pandwind/css` — createCss(defaultPreset)  | 26.01 KB |  9.35 KB |
| `pandwind/css` — createCss(tailwindPreset) | 42.22 KB | 13.83 KB |
| `pandwind/css` — createCss(chakraPreset)   | 53.08 KB | 14.50 KB |
| `pandwind/css` — createCss(pandaPreset)    | 46.34 KB | 13.46 KB |
| `pandwind/css` — createCss(shadcnPreset)   | 87.21 KB | 16.68 KB |
| `pandwind/css` — createCss(csstypePreset)  | 19.50 KB |  7.16 KB |
| `pandwind/css` — createCss(minimal preset) | 14.99 KB |  5.83 KB |
| `pandwind/unsafe/css` — createUnsafeCss    | 11.72 KB |  4.66 KB |
| `pandwind/tw` — tw() only                  |  2.80 KB |  1.31 KB |
| `pandwind/cx` — cx() plain strings         |  7.03 KB |  3.01 KB |
| `pandwind/cx` — cx() with atom registry    | 18.66 KB |  7.24 KB |
| root barrel, tw only                       |  2.80 KB |  1.31 KB |
| root barrel, cx + CSS                      | 17.53 KB |  6.86 KB |

Compiler-pruned and static fixtures are smaller still. The Vite transform
erases fully literal calls; for a dynamic value with statically known style
keys it embeds only the matching preset properties, conditions, and token
groups. Unknown spreads, dynamic computed keys, escaped factories, and
non-serializable preset data keep the conservative fallback.

| fixture                                 |      min |    gzip |
| --------------------------------------- | -------: | ------: |
| all static unsafe `css()` calls         |     81 B |    98 B |
| all static preset `css()` calls         |     37 B |    57 B |
| compiler-pruned unsafe `css()` call     |  6.28 KB | 2.67 KB |
| compiler-pruned unsafe `css.class()`    |  6.34 KB | 2.69 KB |
| compiler-pruned unsafe `css.vars()`     |  8.70 KB | 3.54 KB |
| compiler-pruned preset `css.class()`    |  9.61 KB | 3.89 KB |
| compiler-pruned generated `keyframes()` | 10.18 KB | 4.11 KB |
| compiler-pruned design `css.class()`    | 17.70 KB | 6.45 KB |

The opt-in `pandwind-codemod runtime generate` path has the same callable
core, but can omit attachments that an application never uses:

| generated selection |      min |    gzip |
| ------------------- | -------: | ------: |
| callable core       |  5.76 KB | 2.46 KB |
| `class`             |  5.81 KB | 2.48 KB |
| `vars`              |  8.17 KB | 3.34 KB |
| `class,vars`        |  8.23 KB | 3.36 KB |
| all attachments     | 10.50 KB | 4.19 KB |

For the common `class,vars` selection, that is approximately **2.27 KB min /
827 B gzip** less than the generated all-method runtime (22% / 20%), with no
alternate runtime implementation or per-call dispatch layer. The generated
module is statically imported and retains only the selected typed methods;
`group` automatically adds its required `vars` attachment. These figures are
enforced by the generated rows in `packages/pandwind/tests/runtime-size.test.ts`.

Literal calls are erased by the Vite compiler. Dynamic preset-bound calls with
literal property keys use the projected-preset lane above; dynamic or
unsupported calls pay the corresponding full fallback runtime.

## Generated Tailwind conflict metadata

The ordinary generated `tw.ts` entry remains tiny because it contains only
variant join syntax. A generated `cx()` binding imports `tw.conflicts.ts` only
when it deliberately enables arbitrary runtime Tailwind-class merging. That
optional lane is measured separately from native `cx()` and does not import
the much larger `tw.runtime.ts` value-token catalog.

| generated lane                     |      min |     gzip |
| ---------------------------------- | -------: | -------: |
| generated `tw()` (dynamic)         |  4.45 KB |  1.74 KB |
| generated `tw()` + `cx()` (static) |  0.05 KB |  0.07 KB |
| generated conflict metadata (all)  | 22.37 KB |  7.23 KB |
| conflict-only `createCx()`         | 29.37 KB | 10.18 KB |
| example `dss+cx` (no conflicts)    | 31.75 KB | 11.74 KB |
| generated `dss+cx` with conflicts  | 54.07 KB | 18.88 KB |

The conflict-aware row is an opt-in cost for synchronous merging of unknown
Tailwind class strings. Applications that only compose Pandwind atoms can use
`createCx({ css })` without importing the generated conflict catalog. The
codegen-only `--conflicts bg,p,text` scope can reduce the conflict-only lane to
about **12.83 KB min / 4.80 KB gzip** in the current example, but it must cover
every arbitrary class that the application expects to merge.

## Browser runtimes versus alternatives

The comparison below is directional, not an identical API contract: StyleX
runs babel-compiled objects, and Panda's row is generated `css()`.

Real applications rarely ship all of Pandwind at once, so the Pandwind rows
are the individual lanes an application pays for; `css()` + `tw()` +
`cx()` is the combined shape and is the least common of them. Each lane is
a real import bundle: `createCss(preset)` from `pandwind/css`,
`createTw()` from `pandwind/tw`, and `createCx({ css })` from
`pandwind/cx`. The `pandwind/unsafe/css` variant drops the preset resolver;
the exact difference depends on the preset and is listed in the per-import
table above.

The direct `css()` lane appears once per preset because the preset, not the
engine, is what moves it: 14.99 KB min with the minimal preset, 19.50 KB once
the structural `csstypePreset` supplies the CSS property vocabulary, 26.01 KB
once `defaultPreset` adds Pandwind's stock scale groups and its property
bindings, 42.22 KB with `tailwindPreset`, 53.08 KB with `chakraPreset`, 46.34
KB with `pandaPreset`, and 87.21 KB with
`shadcnPreset`, the widest catalog Pandwind ships: shadcn's color roles for
every base color in both modes, its radius multipliers, and its font variables.
These standalone rows intentionally bundle the live preset without the Vite
transform, so every authored catalog entry remains available. Under Vite, the
projected-preset lane avoids shipping unused entries when dynamic calls expose
literal keys; fully static calls erase the preset entirely. An application that
needs the smallest uncompiled `css()` runtime supplies its own preset and its
own tokens. The combination rows below use `fixturePreset`, a test fixture
whose only difference from `defaultPreset` is that it still carries a named
color palette; they measure a palette-resolving preset, which is the shape an
application importing a named-color preset ships.

| runtime                                      |      min |     gzip | what ships                                |
| -------------------------------------------- | -------: | -------: | ----------------------------------------- |
| pandwind `css()` (defaultPreset)             | 26.01 KB |  9.35 KB | stock scales + resolver + atom engine     |
| pandwind `css()` (fixture preset)            | 29.32 KB | 10.40 KB | fixture palette + resolver + engine       |
| pandwind `css()` (tailwindPreset)            | 42.22 KB | 13.83 KB | Tailwind v4 catalog + resolver + engine   |
| pandwind `css()` (chakraPreset)              | 53.08 KB | 14.50 KB | Chakra v3 catalog + resolver + engine     |
| pandwind `css()` (pandaPreset)               | 46.34 KB | 13.46 KB | Panda CSS catalog + resolver + engine     |
| pandwind `css()` (shadcnPreset)              | 87.21 KB | 16.68 KB | shadcn registry roles + resolver + engine |
| pandwind `css()` (csstypePreset)             | 19.50 KB |  7.16 KB | property vocabulary + resolver + engine   |
| pandwind `css()` (minimal preset)            | 14.99 KB |  5.83 KB | resolver + atom engine only               |
| pandwind `tw()`                              |  2.80 KB |  1.31 KB | variant join syntax alone                 |
| pandwind `css()` (fixture) + `tw()`          | 32.01 KB | 11.38 KB | the common two-lane app                   |
| pandwind `css()` (fixture) + `cx()`          | 36.28 KB | 13.02 KB | atom registry + cross-engine merge        |
| pandwind `css()` (fixture) + `tw()` + `cx()` | 38.96 KB | 13.99 KB | combined runtime                          |
| pandwind compiler-pruned `css.class()`       |  9.61 KB |  3.89 KB | projected preset + shared engine          |
| pandwind fully extracted `css()`             |     37 B |     57 B | emitted literals only                     |
| `@stylexjs/stylex` 0.19.0                    |  4.06 KB |  1.74 KB | runtime only (compile happens in babel)   |
| `@pandacss/core` 1.12.0 generated `css()`    |  13.4 KB |  5.31 KB | panda runtime engine + tokens             |
| `@emotion/css` 11.13.5                       |  15.3 KB |  6.25 KB | emotion core (chakra's engine)            |
| `@chakra-ui/react` 3.36.1 (react external)   |  30.1 KB |  12.5 KB | chakra + emotion it pulls in              |
| `tailwind-merge` 3.6.0                       |  27.0 KB |  8.47 KB | merge function alone                      |
| `tokenami`                                   |        0 |       ~0 | compile-time only, nothing ships          |

The compiler-pruned row is what a production app pays for a dynamic
preset-bound call whose style keys are statically visible: the shared engine
plus only the projected preset metadata, token entries, and attachments that
call needs. A fully literal call pays only its emitted literals.

Alternative-library values are the supplied reference run, not a release
budget. Re-run that external rig before making a new ecosystem comparison;
the Pandwind rows above are the repo-owned snapshot.

## Stylesheet assets (CSS bytes, no JavaScript)

A reset or a prose stylesheet is a stylesheet, so importing one from a runtime
lane leaves every number above unchanged: it ships no JavaScript and no type.
Its cost is the stylesheet bytes a project serves, measured per file at gzip
level 6 like the rest of this page.

| asset                        |      raw |    gzip |
| ---------------------------- | -------: | ------: |
| `pandwind/reset/tailwindcss` | 10.99 KB | 4.11 KB |
| `pandwind/reset/panda`       |  6.31 KB | 2.79 KB |
| `pandwind/reset/pandwind`    |  3.38 KB | 1.75 KB |
| `pandwind/prose/tailwindcss` | 54.24 KB | 6.31 KB |

The raw figure includes each file's provenance header, the upstream permalink,
and the list of deliberate divergences; gzip reduces that prose to almost
nothing, which is why the raw and gzip ratios here differ from the JavaScript
rows. The resets also overlap: a project imports the one baseline that matches
the engine it came from, not all three. The prose asset is not a baseline and
does not overlap them: a project imports it only where rendered markdown needs
a typographic scale.

## No silent regressions

`packages/pandwind/tests/runtime-size.test.ts` enforces three layers:

1. **Hard budgets** in `tests/runtime-budget.json`, checked even with `-u`.
2. **A noise-tolerant regression guard** against the committed snapshot.
3. **The exact snapshot**, refreshed only after an intentional size change.

Run the record from the repository root with:

```sh
pnpm --filter pandwind run test:size
```

Use `pnpm --filter pandwind run test:size -u` only after reviewing a
deliberate bundle change.

## Real CSS output (example app)

The example app's separately measured Vite output remains **71.25 KB raw /
12.67 KB gzip** for `index.css` and **254.42 KB raw / 76.58 KB gzip** for
`index.js` (2026-08-15). Its utility layer, preflight, theme variables, and
keyframe output are application fixtures rather than part of the library
runtime size contract.
