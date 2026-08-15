# Bundle & stylesheet sizes — measured, not guessed

Last measured: 2026-08-15, local macOS (arm64), Node v24.18.1, esbuild 0.28.2.
All numbers below come from real builds on this machine (esbuild `bundle +
minify`, gzip level 6 for the raw bytes; vite reports its own gzip for the
example app). This is local-build evidence — re-run the commands in
`packages/pandwind/tests/runtime-size.test.ts` and `apps/example` to refresh
it after dependency or engine changes.

## The short version

The "20 KB" you saw in the previous status update is **JavaScript**, and it is
the **build-time stylesheet generator**, not the browser runtime:

| what                                       |     min |    gzip |
| ------------------------------------------ | ------: | ------: |
| `css()` runtime                            | 2.26 KB | 1.09 KB |
| `tw()` runtime                             | 1.64 KB | 0.83 KB |
| `cx()` runtime                             | 4.15 KB | 1.87 KB |
| all three together                         | 5.72 KB | 2.41 KB |
| stylesheet generator (**build-time only**) | 82.0 KB | 20.3 KB |

The generator is deliberately not exported from any runtime barrel — there is
a test asserting the shipped runtime stays under a third of its gzipped size.
It never reaches the browser unless an app explicitly imports it. The actual
CSS an app ships is what Tailwind compiles: for the example app that is
**71.25 KB raw / 12.67 KB gzip**, of which ~60 KB is the utilities layer
(every used utility plus the 41 safelist classes), ~3.7 KB preflight and
~2 KB theme variables.

## Browser JS runtimes vs the alternatives

Measured by bundling each package's real entry point (minified, browser
target, ESM), with React externalized where it is a peer dependency:

| runtime                                    |     min |    gzip | what ships                              |
| ------------------------------------------ | ------: | ------: | --------------------------------------- |
| pandwind `css()` + `tw()` + `cx()`         | 5.72 KB | 2.41 KB | everything                              |
| `@stylexjs/stylex` 0.19.0                  | 4.06 KB | 1.74 KB | runtime only (compile happens in babel) |
| `@pandacss/core` 1.12.0 generated `css()`  | 13.4 KB | 5.31 KB | panda's runtime engine + tokens         |
| `@emotion/css` 11.13.5                     | 15.3 KB | 6.25 KB | emotion core (chakra's engine)          |
| `@chakra-ui/react` 3.36.1 (react external) | 30.1 KB | 12.5 KB | chakra + emotion it pulls in            |
| `tailwind-merge` 3.6.0                     | 27.0 KB | 8.47 KB | the merge function alone                |
| `tokenami`                                 |       0 |      ~0 | compile-time only, nothing ships        |

pandwind's whole runtime is smaller than stylex's runtime and a fraction of
panda's; it is ~1/3 of chakra's and ~1/3.5 of tailwind-merge (which only does
string merging, not style compilation — see [BENCH.md](./BENCH.md)).

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
