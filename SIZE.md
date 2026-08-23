# Bundle & stylesheet sizes — measured, not guessed

Last measured: 2026-08-23, local macOS (arm64), Node v24.19.0, esbuild 0.28.2.
All numbers below come from real builds on this machine (esbuild `bundle +
minify`, gzip level 6 for the raw bytes; vite reports its own gzip for the
example app). This is local-build evidence — re-run the commands in
`packages/pandwind/tests/runtime-size.test.ts` and `apps/example` to refresh
it after dependency or engine changes.

## The short version

The "20 KB" you saw in the previous status update is **JavaScript**, and it is
the **build-time stylesheet generator**, not the browser runtime:

| what                                       |      min |     gzip |
| ------------------------------------------ | -------: | -------: |
| `css()` runtime                            |  2.35 KB |  1.13 KB |
| `tw()` runtime                             |  2.00 KB |  0.96 KB |
| `cx()` runtime                             |  7.51 KB |  3.29 KB |
| all three together                         |  9.51 KB |  4.02 KB |
| stylesheet generator (**build-time only**) | 82.25 KB | 20.41 KB |

The generator is deliberately not exported from any runtime barrel — there is
a test asserting the shipped runtime stays under a third of its gzipped size.
It never reaches the browser unless an app explicitly imports it. The actual
CSS an app ships is what Tailwind compiles: for the example app that is
**71.25 KB raw / 12.67 KB gzip**, of which ~60 KB is the utilities layer
(every used utility plus the 41 safelist classes), ~3.7 KB preflight and
~2 KB theme variables.

## Pay-per-API: separate imports, tree-shaken barrel

Each engine is its own subpath export — `pandwind/css`, `pandwind/tw`,
`pandwind/cx` — and the root `pandwind` barrel is marked `"sideEffects":
false`, so bundlers drop whichever engines you do not import. Measured with
esbuild (the size gate in `packages/pandwind/tests/runtime-size.test.ts`) and
proven again with a real vite production build in
`packages/pandwind/tests/vite-integration.test.ts`:

| import                      |     min |    gzip | vs all three |
| --------------------------- | ------: | ------: | -----------: |
| `pandwind/css` — css() only | 2.35 KB | 1.13 KB |         −73% |
| `pandwind/tw` — tw() only   | 2.00 KB | 0.96 KB |         −77% |
| `pandwind/cx` — cx() only   | 7.51 KB | 3.29 KB |         −21% |
| `pandwind` — css + tw + cx  | 9.51 KB | 4.02 KB |            — |

Two things to know:

- **The barrel costs nothing.** `import { createCss } from "pandwind"` is
  byte-identical after bundling to `import { createCss } from "pandwind/css"`
  — the size gate asserts the root-barrel build equals the direct subpath
  build for each of the three engines.
- **`cx()` is inherently the biggest single import** because it depends on
  the css engine's atom registry to resolve hashed atoms — it cannot be
  smaller than `css()`. `tw()` and `css()` are fully independent: importing
  one never pulls the other.

## Browser JS runtimes vs the alternatives

Measured by bundling each package's real entry point (minified, browser
target, ESM), with React externalized where it is a peer dependency:

| runtime                                    |     min |    gzip | what ships                              |
| ------------------------------------------ | ------: | ------: | --------------------------------------- |
| pandwind `css()` + `tw()` + `cx()`         | 9.51 KB | 4.02 KB | everything                              |
| `@stylexjs/stylex` 0.19.0                  | 4.06 KB | 1.74 KB | runtime only (compile happens in babel) |
| `@pandacss/core` 1.12.0 generated `css()`  | 13.4 KB | 5.31 KB | panda's runtime engine + tokens         |
| `@emotion/css` 11.13.5                     | 15.3 KB | 6.25 KB | emotion core (chakra's engine)          |
| `@chakra-ui/react` 3.36.1 (react external) | 30.1 KB | 12.5 KB | chakra + emotion it pulls in            |
| `tailwind-merge` 3.6.0                     | 27.0 KB | 8.47 KB | the merge function alone                |
| `tokenami`                                 |       0 |      ~0 | compile-time only, nothing ships        |

pandwind's whole runtime is a fraction of panda's, under a third of chakra's,
and about a third of tailwind-merge (which only does string merging, not
style compilation — see [BENCH.md](./BENCH.md)). It is larger than stylex's
shipped runtime, whose compile happens in babel — the honest comparison is
[BENCH.md](./BENCH.md) runtime throughput, where pandwind wins.

## No silent regressions: the runtime size gate

The numbers above are a _contract_, enforced on every `pnpm test` run by
`packages/pandwind/tests/runtime-size.test.ts` (standalone: `pnpm test:size`
from `packages/pandwind`). It has three layers, so a size change is either
caught or explicitly intentional:

1. **Hard budgets** (`packages/pandwind/tests/runtime-budget.json`) — the
   "not too much" ceiling for every entry. They are checked first and always
   apply, even when updating snapshots with `-u`. Bump one only when the
   growth is deliberate and reviewed. Headroom as of the cold-path cx pass
   (measured / budget): css 2406/2900 min & 1157/1400 gz (~17% free),
   tw 2043/2100 min (~3% free) & 985/1100 gz, cx 7512/7900 min (~5% free) &
   3287/3400 gz, all three 9511/9900 min & 4015/4200 gz. The budget file is
   comment-free JSON (loaded with `JSON.parse`), so this paragraph is the
   canonical headroom record.
2. **Regression guard** — current sizes are compared against the committed
   baseline snapshot (`packages/pandwind/tests/snapshots/runtime-size.json.snap`)
   with a small tolerance (1%, floored at 16 min / 8 gz bytes). Deterministic
   builds are byte-stable, so the tolerance only absorbs cross-machine gzip
   noise; real growth between revisions fails with a message naming the entry
   and the allowed ceiling.
3. **Exact snapshot** — the record of truth, updated only by
   `pnpm test:size -u`. That is the _intentional-change_ path: it skips the
   regression guard (budgets still apply) and rewrites the baseline, so the
   next revision's guard compares against the new sizes.

`pnpm test:size -u` is therefore reserved for a deliberate growth: runtime
work that cannot be shaken out, a new engine, or a consciously accepted
increase. Everything else — dependency bumps, refactors, typegen changes —
must keep the numbers where they are.

## Real CSS output (example app)

`apps/example` builds three pages (`tw()` only, `css()` atomic only,
`css()` design-vocabulary only) plus Tailwind v4's preflight and a safelist.
Vite build output, 2026-08-15:

| artifact                                   |       raw |     gzip |
| ------------------------------------------ | --------: | -------: |
| `index.css`                                |  71.25 KB | 12.67 KB |
| `index.js` (react app + pandwind runtimes) | 254.42 KB | 76.58 KB |

CSS layer breakdown of that build:

| layer                           |  bytes |
| ------------------------------- | -----: |
| `@layer utilities`              | 60,580 |
| `@layer base` (preflight)       |  3,689 |
| `@layer theme` (tokens)         |  2,047 |
| `@layer properties` + keyframes |  4,937 |

The utilities dominate because Tailwind v4 emits each used utility with its
`@property` custom-property machinery and every media-variant wrapper. The
point of the tailwind adapter is that this stays _one_ set of rules: a
`css({ color: "$blue-500" })` call and a `tw({ text: "blue-500" })` call emit
the **identical** class (`text-blue-500`), so mixing APIs cannot grow the
stylesheet. That claim is tested in
`packages/pandwind/tests/tw-adapter.test.ts` ("mixing css() and tw() cannot
grow the stylesheet") against real Tailwind output.

## What is not in these numbers

- The stylesheet generator (~20 KB gz) is build-time. The runtime-size test
  (`packages/pandwind/tests/runtime-size.test.ts`) fails the build if it
  ever leaks into the runtime barrel.
- postcss / @tailwindcss/node / oxc are dev/build-time only; none of them are
  importable from the runtime entries.
- No runtime CSS injection: `tw()`/`css()`/`cx()` only ever return strings.
