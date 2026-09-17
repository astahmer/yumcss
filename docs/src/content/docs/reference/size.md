---
title: Bundle & stylesheet sizes — measured, not guessed
description: Runtime size contract for css() / tw() / cx() plus real example-app CSS output.
sidebar:
  order: 2
---

Last measured: **2026-09-17** for the Pandwind runtime byte record. The
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
| `createCss(defaultPreset)` runtime         | 27.13 KB |  9.65 KB |
| `createCss(csstypePreset)` runtime         | 17.57 KB |  6.49 KB |
| `createCss(minimal preset)` runtime        | 13.08 KB |  5.18 KB |
| `createUnsafeCss()` fallback runtime       | 10.60 KB |  4.27 KB |
| `createCssRuntime()` core (**internal**)   |  5.82 KB |  2.52 KB |
| `createRuntimeCss()` + runtime sheet       | 33.73 KB | 12.50 KB |
| `tw()` runtime                             |  2.80 KB |  1.31 KB |
| `cx()` plain strings                       |  7.03 KB |  3.01 KB |
| `cx()` + CSS atom registry                 | 17.54 KB |  6.84 KB |
| all direct runtime entries                 | 20.23 KB |  7.80 KB |
| stylesheet generator (**build-time only**) | 21.09 KB |  8.18 KB |

The combined direct runtime is measured at 20.23 KB min / 7.80 KB gzip in this
record for `createUnsafeCss()` + `tw()` + `cx()`. The preset-bound
`createCss(preset)` lanes are measured separately because they also carry the
preset-aware resolver, and the preset they are handed decides how much token
and condition data rides along. The internal `createCssRuntime()` row has no
public method attachments and is included only to show the shared engine's base
cost; applications should use `createCss()` or `createUnsafeCss()` instead.
Fully extracted static calls remain below 100 bytes.

The three `css()` rows run the same engine with a different preset, and the
preset is what moves the number: the minimal preset (open property catalog, no
tokens) is the engine plus resolver floor, `csstypePreset` swaps in the
structural CSS property vocabulary, and `defaultPreset` adds Pandwind's own
stock token catalog on top of that. A runtime lane ships its preset object
whole (esbuild cannot drop token entries an application never reads), so the
catalog, not the engine, is the heavy part of a `css()` bundle that imports a
large preset. The runtime-sheet row uses the minimal preset fixture, so an
application whose preset carries a large token catalog should read the
`createCss(defaultPreset)` row as the closer analogue.

## Pay-per-API and compiler pruning

Each engine has its own subpath export, and the root barrel is side-effect
free. `css()` is subpath-only — the root barrel carries `tw()` + `cx()` — so the
same size gate checks these tree-shaken entry points:

| fixture / import                           |      min |    gzip |
| ------------------------------------------ | -------: | ------: |
| `pandwind/css` — createCss(defaultPreset)  | 27.13 KB | 9.65 KB |
| `pandwind/css` — createCss(csstypePreset)  | 17.57 KB | 6.49 KB |
| `pandwind/css` — createCss(minimal preset) | 13.08 KB | 5.18 KB |
| `pandwind/unsafe/css` — createUnsafeCss    | 10.60 KB | 4.27 KB |
| `pandwind/tw` — tw() only                  |  2.80 KB | 1.31 KB |
| `pandwind/cx` — cx() plain strings         |  7.03 KB | 3.01 KB |
| `pandwind/cx` — cx() with atom registry    | 17.54 KB | 6.84 KB |
| root barrel, tw only                       |  2.80 KB | 1.31 KB |
| root barrel, cx + CSS                      | 17.53 KB | 6.86 KB |

Compiler-pruned and static fixtures are smaller still:

| fixture                            |     min |    gzip |
| ---------------------------------- | ------: | ------: |
| all static `css()` calls           |    81 B |    98 B |
| compiler-pruned `css()` call       | 5.82 KB | 2.50 KB |
| compiler-pruned `css.class()` call | 5.88 KB | 2.52 KB |
| compiler-pruned `css.vars()` call  | 8.24 KB | 3.38 KB |

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

Literal calls are erased by the Vite compiler; these fallback numbers are
the cost paid by dynamic or unsupported calls.

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
`pandwind/cx`. The `pandwind/unsafe/css` variants save roughly 2.5 KB min /
0.9 KB gzip by dropping the preset resolver and are listed in the per-import
table above.

The `css()` lane appears once per preset because the preset, not the engine, is
what moves it: 13.08 KB min with the minimal preset, 17.57 KB once the
structural `csstypePreset` supplies the CSS property vocabulary, and 27.13 KB
once `defaultPreset` adds Pandwind's stock token catalog. A runtime lane ships
that catalog as authored data, which makes the catalog about as expensive as
adding both `tw()` and `cx()` to the unsafe runtime (9.56 KB min / 3.16 KB gzip
against 9.63 KB / 3.53 KB). An application that needs the smallest `css()`
runtime supplies its own preset and its own tokens, or extracts its calls
statically. The combination rows below use `defaultPreset`.

| runtime                                    |      min |     gzip | what ships                                |
| ------------------------------------------ | -------: | -------: | ----------------------------------------- |
| pandwind `css()` (defaultPreset)           | 27.13 KB |  9.65 KB | stock tokens + resolver + atom engine     |
| pandwind `css()` (csstypePreset)           | 17.57 KB |  6.49 KB | property vocabulary + resolver + engine   |
| pandwind `css()` (minimal preset)          | 13.08 KB |  5.18 KB | resolver + atom engine only               |
| pandwind `tw()`                            |  2.80 KB |  1.31 KB | variant join syntax alone                 |
| pandwind `css()` + `tw()`                  | 29.82 KB | 10.65 KB | the common two-lane app                   |
| pandwind `css()` + `cx()`                  | 34.08 KB | 12.28 KB | atom registry + cross-engine merge        |
| pandwind `css()` + `tw()` + `cx()`         | 36.76 KB | 13.26 KB | combined runtime                          |
| pandwind compiler-pruned `css.class()`     |  5.88 KB |  2.52 KB | literals + shared engine, post-extraction |
| pandwind fully extracted `css()`           |     81 B |     98 B | emitted literals only                     |
| `@stylexjs/stylex` 0.19.0                  |  4.06 KB |  1.74 KB | runtime only (compile happens in babel)   |
| `@pandacss/core` 1.12.0 generated `css()`  |  13.4 KB |  5.31 KB | panda runtime engine + tokens             |
| `@emotion/css` 11.13.5                     |  15.3 KB |  6.25 KB | emotion core (chakra's engine)            |
| `@chakra-ui/react` 3.36.1 (react external) |  30.1 KB |  12.5 KB | chakra + emotion it pulls in              |
| `tailwind-merge` 3.6.0                     |  27.0 KB |  8.47 KB | merge function alone                      |
| `tokenami`                                 |        0 |       ~0 | compile-time only, nothing ships          |

The compiler-pruned row is what a production app pays once the Vite compiler
has erased every literal call: the same shared engine with only the emitted
literals and the attachments that inlined calls still need.

Alternative-library values are the supplied reference run, not a release
budget. Re-run that external rig before making a new ecosystem comparison;
the Pandwind rows above are the repo-owned snapshot.

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
