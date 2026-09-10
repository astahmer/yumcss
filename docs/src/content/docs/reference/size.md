---
title: Bundle & stylesheet sizes — measured, not guessed
description: Runtime size contract for css() / tw() / cx() plus real example-app CSS output.
sidebar:
  order: 2
---

Last measured: **2026-09-10** for the Pandwind runtime byte record. The
competitor rows retain the supplied reference measurements for the named
versions. The environment was local macOS (arm64), Node v24.19.0, esbuild
0.28.2. Pandwind numbers come from real browser-targeted esbuild bundles
(bundle + minify, gzip level 6) and are rounded to two decimals here.

This is the canonical size page. The root `SIZE.md` is only a pointer; the
exact machine-readable record is
[`runtime-size.json.snap`](https://github.com/astahmer/pandwind/blob/main/packages/pandwind/tests/snapshots/runtime-size.json.snap),
with ceilings in
[`runtime-budget.json`](https://github.com/astahmer/pandwind/blob/main/packages/pandwind/tests/runtime-budget.json).

## The short version

| entry                                      |      min |     gzip |
| ------------------------------------------ | -------: | -------: |
| `createCss()` fallback runtime             |  6.78 KB |  2.97 KB |
| `createRuntimeCss()` + runtime sheet       | 28.76 KB | 10.87 KB |
| `tw()` runtime                             |  2.71 KB |  1.27 KB |
| `cx()` runtime                             | 12.71 KB |  5.31 KB |
| all three direct runtime entries           | 15.31 KB |  6.24 KB |
| stylesheet generator (**build-time only**) | 18.66 KB |  7.08 KB |

The combined runtime is effectively at the supplied Emotion reference
(15.3 KB min / 6.25 KB gzip): Pandwind is 7 minified bytes larger and 6
gzip bytes smaller in these measurements. The old 10.51 KB / 4.38 KB row
was an obsolete pre-feature snapshot and is intentionally no longer quoted.

The runtime-sheet row uses the minimal preset fixture. A real application
preset also contributes its own token and condition data; that data is
application-specific and is not mixed into the library baseline.

## Pay-per-API and compiler pruning

Each engine has its own subpath export, and the root barrel is side-effect
free. The same size gate checks these tree-shaken entry points:

| fixture / import                        |      min |    gzip |
| --------------------------------------- | -------: | ------: |
| `pandwind/css` — css() only             |  6.78 KB | 2.97 KB |
| `pandwind/tw` — tw() only               |  2.71 KB | 1.27 KB |
| `pandwind/cx` — cx() with atom registry | 12.71 KB | 5.31 KB |
| root barrel, css only                   |  6.78 KB | 2.97 KB |
| root barrel, tw only                    |  2.71 KB | 1.27 KB |
| root barrel, cx only                    | 12.71 KB | 5.31 KB |

Compiler-pruned and static fixtures are smaller still:

| fixture                            |     min |    gzip |
| ---------------------------------- | ------: | ------: |
| all static `css()` calls           |    81 B |    98 B |
| compiler-pruned `css()` call       | 3.95 KB | 1.80 KB |
| compiler-pruned `css.class()` call | 4.00 KB | 1.82 KB |
| compiler-pruned `css.vars()` call  | 5.55 KB | 2.47 KB |

Literal calls are erased by the Vite compiler; these fallback numbers are
the cost paid by dynamic or unsupported calls.

## Browser runtimes versus alternatives

The comparison below is directional, not an identical API contract: StyleX
runs babel-compiled objects, Panda's row is generated `css()`, and the
Pandwind row includes `css()` + `tw()` + cross-engine `cx()`.

| runtime                                    |      min |    gzip | what ships                              |
| ------------------------------------------ | -------: | ------: | --------------------------------------- |
| pandwind `css()` + `tw()` + `cx()`         | 15.31 KB | 6.24 KB | current combined runtime                |
| `@stylexjs/stylex` 0.19.0                  |  4.06 KB | 1.74 KB | runtime only (compile happens in babel) |
| `@pandacss/core` 1.12.0 generated `css()`  |  13.4 KB | 5.31 KB | panda runtime engine + tokens           |
| `@emotion/css` 11.13.5                     |  15.3 KB | 6.25 KB | emotion core (chakra's engine)          |
| `@chakra-ui/react` 3.36.1 (react external) |  30.1 KB | 12.5 KB | chakra + emotion it pulls in            |
| `tailwind-merge` 3.6.0                     |  27.0 KB | 8.47 KB | merge function alone                    |
| `tokenami`                                 |        0 |      ~0 | compile-time only, nothing ships        |

Alternative-library values are the supplied reference run, not a release
budget. Re-run that external rig before making a new ecosystem comparison;
the Pandwind row above is the repo-owned snapshot.

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
