---
title: Bundle & stylesheet sizes — measured, not guessed
description: Runtime size contract for css() / tw() / cx() plus real example-app CSS output.
sidebar:
  order: 2
---

Last measured: 2026-08-27, local macOS (arm64), Node v24.19.0, esbuild
0.28.2. All numbers come from real builds (esbuild `bundle + minify`, gzip
level 6). Re-run `packages/pandwind/tests/runtime-size.test.ts` and
`apps/example` to refresh after dependency or engine changes.

## The short version

| what                                       |      min |     gzip |
| ------------------------------------------ | -------: | -------: |
| `css()` runtime                            |  3.42 KB |  1.61 KB |
| `tw()` runtime                             |  2.09 KB |  0.99 KB |
| `cx()` runtime                             |  8.84 KB |  3.79 KB |
| all three together                         | 10.89 KB |  4.53 KB |
| stylesheet generator (**build-time only**) | 83.27 KB | 20.78 KB |

The generator is deliberately not exported from any runtime barrel — there is
a test asserting the shipped runtime stays under a third of its gzipped size.
It never reaches the browser unless an app explicitly imports it.

## Pay-per-API: separate imports, tree-shaken barrel

Each engine is its own subpath export (`pandwind/css`, `pandwind/tw`,
`pandwind/cx`) and the root barrel is marked `"sideEffects": false`, so
bundlers drop whichever engines you do not import:

| import                      |      min |    gzip |
| --------------------------- | -------: | ------: |
| `pandwind/css` — css() only |  3.42 KB | 1.61 KB |
| `pandwind/tw` — tw() only   |  2.09 KB | 0.99 KB |
| `pandwind/cx` — cx() only   |  8.84 KB | 3.78 KB |
| `pandwind` root — tw + cx   | 10.89 KB | 4.53 KB |

- **The root lane is curated.** `pandwind` (root) exports ONLY `tw` + `cx`;
  `css()` lives on `pandwind/css` and presets on `pandwind/preset`. Importing
  from the root costs nothing over the direct subpath — the size gate still
  tree-shakes each single-API bundle down to its engine.
- **`cx()` is inherently the biggest single import** because it depends on
  the css engine's atom registry. `tw()` and `css()` are fully independent.

## Browser JS runtimes vs the alternatives

| runtime                                    |      min |    gzip | what ships                              |
| ------------------------------------------ | -------: | ------: | --------------------------------------- |
| pandwind `css()` + `tw()` + `cx()`         | 10.51 KB | 4.38 KB | everything                              |
| `@stylexjs/stylex` 0.19.0                  |  4.06 KB | 1.74 KB | runtime only (compile happens in babel) |
| `@pandacss/core` 1.12.0 generated `css()`  |  13.4 KB | 5.31 KB | panda's runtime engine + tokens         |
| `@emotion/css` 11.13.5                     |  15.3 KB | 6.25 KB | emotion core (chakra's engine)          |
| `@chakra-ui/react` 3.36.1 (react external) |  30.1 KB | 12.5 KB | chakra + emotion it pulls in            |
| `tailwind-merge` 3.6.0                     |  27.0 KB | 8.47 KB | the merge function alone                |
| `tokenami`                                 |        0 |      ~0 | compile-time only, nothing ships        |

## No silent regressions: the runtime size gate

The numbers above are a _contract_, enforced on every `pnpm test` run by
`tests/runtime-size.test.ts`. Three layers:

1. **Hard budgets** (`tests/runtime-budget.json`) — ceilings checked first,
   always applied even during snapshot updates.
2. **Regression guard** — current sizes compared against the committed
   snapshot with a small tolerance (1%, floored at 16 min / 8 gz bytes).
3. **Exact snapshot** — record of truth, updated only via
   `pnpm test:size -u`, reserved for deliberate growth.

## Real CSS output (example app)

Vite build output: `index.css` 71.25 KB raw / 12.67 KB gzip (~60 KB utilities
layer, ~3.7 KB preflight, ~2 KB theme variables); `index.js` 254.42 KB raw /
76.58 KB gzip. The point of the [tailwind adapter](/interop/tailwind-adapter/)
is that this stays _one_ set of rules: mixing `css()` and `tw()` cannot grow
the stylesheet — tested against real Tailwind output in
`tests/tw-adapter.test.ts`.
