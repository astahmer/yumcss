# Codemod canonicality audit

Date: 2026-09-27  
Scope: all source/target pairs exposed by the current built-in migration registry.

## Result

- 32 built-in adapters expose 1,024 registry pairs (32 × 32).
- 992 cross-adapter generated route fixtures cover five scenarios each (4,960 tests). The pre-change baseline passed; those tests validate Pandwind conversion/residual contracts, not every target compiler.
- The other 32 pairs are identity no-ops.
- Current route maturity is 22 experimental and 1,002 research. This audit promotes no route.

| Canonicality verdict | Pairs |
| --- | ---: |
| Canonical | 32 |
| Valid but noncanonical | 0 |
| Incorrect or lossy | 53 |
| Safe residual | 119 |
| Unverified | 820 |

The full per-route record is in [codemod-canonicality-route-ledger.json](./codemod-canonicality-route-ledger.json). Each entry has `routeKey`, exact primary input and output, artifacts, residuals, validation result, exact target package/version, authoritative API link, generated fixture path, route-proof maturity, verdict, and reason.

## Method and evidence limits

- Enumerated the live adapter registry and `migrationRouteProofCatalog`; it returns every built-in pair, including self-pairs.
- Captured every primary route with the same `runAdapterMigration` harness, source fixture, file extension, safe mode, and source semantic used by generated route tests. Linked test paths in the ledger contain each route’s secondary API, configured theme/token, and malformed-input snapshots.
- Resolved exact installed versions from workspace/benchmark package trees. Missing targets are explicitly marked not installed.
- Compared output with registered official API guidance. Most official pages are rolling docs, not version-pinned pages; where docs do not identify a version, the installed package lock is the version evidence and exact-version target compilation remains unproven.
- Kept source/IR validation separate from target CSS syntax, target API shape, build, installed-project, SSR, and browser proof. A snapshot’s `valid: true` does not prove target output correctness.

Chromium CSS grammar checks confirmed `CSS.supports("color", "red.300") === false`. Mantine’s 9.6 style-prop docs say `mx="auto"` maps to CSS `auto`, numeric dimensions convert from px into `rem` scaled by `--mantine-scale`, and palette colors are exposed through `--mantine-color-<name>-<shade>` variables.

## Target package and guidance inventory

Package/version and official target guidance for each target. The same values appear on every route ledger entry.

| Target | Package and exact installed version | Guidance |
| --- | --- | --- |
| `aphrodite` | `aphrodite` — 2.4.0 (benchmarks/styling-tsc) | [official API guidance](https://github.com/Khan/aphrodite#usage) |
| `authored-css` | `CSS standard; PostCSS parser` — 8.5.28 (packages/codemod) | [official API guidance](https://developer.mozilla.org/en-US/docs/Web/CSS) |
| `bamboo` | `@bamboocss/dev + @bamboocss/vite` — not installed (not installed in audited workspaces) | [official API guidance](https://styled-system.com/) |
| `chakra-ui` | `@chakra-ui/react` — 3.37.0 (packages/codemod) | [official API guidance](https://chakra-ui.com/docs/styling/overview) |
| `compiled` | `@compiled/react` — 2.0.0 (benchmarks/styling-tsc) | [official API guidance](https://compiledcssinjs.com/docs/api-css-prop) |
| `css-modules` | `CSS Modules / postcss-modules` — not installed (postcss-modules not installed) | [official API guidance](https://github.com/css-modules/css-modules) |
| `emotion` | `@emotion/css` — 11.13.5 (benchmarks/styling-tsc) | [official API guidance](https://emotion.sh/docs/%40emotion/css) |
| `fela` | `fela` — 12.2.1 (benchmarks/styling-tsc) | [official API guidance](https://fela.js.org/docs/) |
| `goober` | `goober` — 2.1.19 (benchmarks/styling-tsc) | [official API guidance](https://goober.js.org/api/css/) |
| `jss` | `jss` — 10.10.0 (benchmarks/styling-tsc) | [official API guidance](https://cssinjs.org/react-jss) |
| `less` | `less` — 4.9.1 (packages/codemod) | [official API guidance](https://lesscss.org/features/) |
| `linaria` | `@linaria/core` — 8.2.0 (benchmarks/styling-tsc) | [official API guidance](https://linaria.dev/) |
| `mantine` | `@mantine/core` — 9.6.0 (packages/codemod) | [official API guidance](https://mantine.dev/styles/style-props/) |
| `mui` | `@mui/material + @mui/system` — not installed (not installed in audited workspaces) | [official API guidance](https://mui.com/system/getting-started/the-sx-prop/) |
| `next-yak` | `next-yak` — 9.10.0 (benchmarks/styling-tsc) | [official API guidance](https://yak.js.org/docs/features) |
| `panda` | `@pandacss/dev` — 1.12.1 (benchmarks/styling-tsc) | [official API guidance](https://panda-css.com/docs/concepts/writing-styles) |
| `pandwind` | `pandwind` — 0.1.0 (workspace package) | [Pandwind css() docs](../../docs/src/content/docs/api/css.md) |
| `react-native` | `react-native` — not installed (not installed as a target dependency) | [official API guidance](https://reactnative.dev/docs/stylesheet) |
| `react-strict-dom` | `react-strict-dom` — 0.0.55 (benchmarks/styling-tsc) | [official API guidance](https://github.com/react/react-strict-dom/blob/main/packages/react-strict-dom/README.md) |
| `sass` | `sass` — 1.104.0 (packages/codemod) | [official API guidance](https://sass-lang.com/documentation/) |
| `solid-styled` | `solid-styled-components` — not installed (not installed in audited workspaces) | [official API guidance](https://github.com/solidjs/solid-styled-components) |
| `stitches` | `@stitches/react` — 1.2.8 (benchmarks/styling-tsc) | [official API guidance](https://stitches.dev/docs/styling) |
| `style9` | `style9` — 0.18.2 (benchmarks/styling-tsc) | [official API guidance](https://github.com/jaredpalmer/style9#readme) |
| `styled-components` | `styled-components` — 6.5.3 (benchmarks/styling-tsc) | [official API guidance](https://styled-components.com/docs/api) |
| `stylex` | `@stylexjs/stylex` — 0.19.1 (benchmarks/styling-tsc) | [official API guidance](https://stylexjs.com/docs/learn/) |
| `tailwind` | `tailwindcss` — 4.3.3 (benchmarks/styling-size) | [official API guidance](https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values) |
| `tamagui` | `@tamagui/core` — not installed (not installed in audited workspaces) | [official API guidance](https://tamagui.dev/docs/core/styled) |
| `tokenami` | `@tokenami/css` — not installed (not installed in audited workspaces) | [official API guidance](https://tokenami.dev/) |
| `treat` | `treat` — 2.0.4 (benchmarks/styling-tsc) | [official API guidance](https://seek-oss.github.io/treat/how-it-works/) |
| `unocss` | `unocss` — 66.10.0 (benchmarks/styling-size) | [official API guidance](https://unocss.dev/) |
| `vanilla-extract` | `@vanilla-extract/css` — 1.21.2 (benchmarks/styling-tsc) | [official API guidance](https://vanilla-extract.style/documentation/api/style/) |
| `vue-styled` | `vue-styled-components` — not installed (not installed in audited workspaces) | [official API guidance](https://github.com/styled-components/vue-styled-components) |

## All 1,024 route verdicts

Each cell is a `target=verdict` pair; `routeKey` in the machine-readable ledger retrieves the exact input, output, residuals, docs and fixture. Verdict codes: C canonical identity, V valid but noncanonical, I incorrect/lossy, S safe residual, U unverified.

| Source | All registered destinations and verdicts |
| --- | --- |
| `aphrodite` | `aphrodite=C`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=S`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `authored-css` | `aphrodite=U`, `authored-css=C`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=S`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `bamboo` | `aphrodite=U`, `authored-css=U`, `bamboo=C`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `chakra-ui` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=C`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=U`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `compiled` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=C`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `css-modules` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=C`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=S`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `emotion` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=C`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `fela` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=C`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `goober` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=C`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `jss` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=C`, `less=S`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=S`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `less` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=C`, `linaria=U`, `mantine=S`, `mui=S`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `linaria` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=C`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `mantine` | `aphrodite=I`, `authored-css=S`, `bamboo=U`, `chakra-ui=I`, `compiled=I`, `css-modules=S`, `emotion=I`, `fela=I`, `goober=I`, `jss=I`, `less=S`, `linaria=I`, `mantine=C`, `mui=I`, `next-yak=I`, `panda=I`, `pandwind=I`, `react-native=I`, `react-strict-dom=S`, `sass=S`, `solid-styled=I`, `stitches=I`, `style9=I`, `styled-components=I`, `stylex=I`, `tailwind=I`, `tamagui=I`, `tokenami=I`, `treat=I`, `unocss=I`, `vanilla-extract=I`, `vue-styled=I` |
| `mui` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=U`, `mui=C`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `next-yak` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=C`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `panda` | `aphrodite=I`, `authored-css=I`, `bamboo=U`, `chakra-ui=U`, `compiled=I`, `css-modules=I`, `emotion=I`, `fela=I`, `goober=I`, `jss=I`, `less=I`, `linaria=I`, `mantine=S`, `mui=I`, `next-yak=I`, `panda=C`, `pandwind=I`, `react-native=I`, `react-strict-dom=I`, `sass=I`, `solid-styled=I`, `stitches=I`, `style9=I`, `styled-components=I`, `stylex=I`, `tailwind=I`, `tamagui=I`, `tokenami=I`, `treat=I`, `unocss=I`, `vanilla-extract=I`, `vue-styled=I` |
| `pandwind` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=C`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `react-native` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=C`, `react-strict-dom=S`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=S`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `react-strict-dom` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=C`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=S`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `sass` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=S`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=C`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `solid-styled` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=S`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=S`, `mantine=U`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=S`, `solid-styled=C`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `stitches` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=C`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `style9` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=C`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=S`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `styled-components` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=S`, `mantine=U`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=C`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `stylex` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=C`, `tailwind=U`, `tamagui=S`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `tailwind` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=U`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=C`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `tamagui` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=U`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=S`, `react-strict-dom=S`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=C`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `tokenami` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=C`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `treat` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=C`, `unocss=U`, `vanilla-extract=U`, `vue-styled=U` |
| `unocss` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=U`, `mantine=U`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=U`, `sass=S`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=C`, `vanilla-extract=U`, `vue-styled=U` |
| `vanilla-extract` | `aphrodite=U`, `authored-css=U`, `bamboo=U`, `chakra-ui=U`, `compiled=U`, `css-modules=U`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=U`, `linaria=U`, `mantine=S`, `mui=U`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=U`, `react-strict-dom=S`, `sass=U`, `solid-styled=U`, `stitches=U`, `style9=U`, `styled-components=U`, `stylex=U`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=C`, `vue-styled=U` |
| `vue-styled` | `aphrodite=U`, `authored-css=S`, `bamboo=U`, `chakra-ui=S`, `compiled=U`, `css-modules=S`, `emotion=U`, `fela=U`, `goober=U`, `jss=U`, `less=S`, `linaria=S`, `mantine=U`, `mui=S`, `next-yak=U`, `panda=U`, `pandwind=U`, `react-native=S`, `react-strict-dom=S`, `sass=S`, `solid-styled=S`, `stitches=S`, `style9=U`, `styled-components=U`, `stylex=S`, `tailwind=U`, `tamagui=U`, `tokenami=U`, `treat=U`, `unocss=U`, `vanilla-extract=U`, `vue-styled=C` |

## Reviewed findings

### A1 — unresolved Panda token references

The primary Panda fixture uses `red.300` and `blue.300`. Without Panda project configuration, `pandaSourceValue` leaves these references as literals. 28 routes emit them as if they were ordinary target values, report no residual, and label conversion lossless. Plain CSS does not accept `red.300` as a color; token-aware targets also need a verified value match, not matching spelling. Panda → Mantine is a typed residual; Panda → Chakra and Panda → Bamboo remain unverified.

Evidence: [Panda → Linaria](../../packages/codemod/tests/routes/panda-to-linaria.test.ts), [Panda → Tailwind](../../packages/codemod/tests/routes/panda-to-tailwind.test.ts), [Panda → UnoCSS](../../packages/codemod/tests/routes/panda-to-unocss.test.ts), [Panda token usage](https://panda-css.com/docs/theming/usage), and [CSS color grammar](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value).

### A2 — Mantine style props lose source semantics

The primary fixture `<Box c="blue.6" mx="auto" maw={400} />` currently emits `blue.6`, `var(--mantine-spacing-auto)`, and unitless `400` in converted output. Mantine documents `blue.6` as a theme color reference, `auto` as the CSS keyword, and numeric dimensions as px values converted to scaled rem. 25 converted routes emit these incorrect semantics with no residual; five routes preserve the original host with typed residuals; Mantine → Bamboo stays unverified.

Evidence: [Mantine → Linaria](../../packages/codemod/tests/routes/mantine-to-linaria.test.ts), Mantine [style props](https://mantine.dev/styles/style-props/), [color references](https://mantine.dev/theming/colors/), and [px/rem conversion](https://mantine.dev/styles/rem/). Installed target Linaria is 8.2.0; its `css` tag contains CSS declarations ([Linaria basics](https://github.com/callstack/linaria/blob/master/docs/BASICS.md)).

### A3 — target token names override mismatched source values

The shared target token policy currently looks up a target token by the source token's reference before checking the source token's resolved value. If the target project reuses that spelling for a different value, the policy silently assigns the target token and changes meaning. The route census does not exercise this adversarial configured-theme case. Target recovery must require an exact resolved-value match for the property; if there is no unique match, preserve the resolved source value.

Evidence: `TokenCatalog.preserveProgram` in `packages/codemod/src/swap/tokens.ts` and `official-token-catalog.test.ts` currently cover matching values but not a same-reference/different-value target catalog.

### A4 — Mantine JSX hosts are not preserved through every target carrier

The same Mantine `<Box>` input is projected inconsistently by several target adapters. Mantine → Emotion returns `css(...)` from `App` instead of rendering it on a host element; Mantine → Chakra emits Chakra's `css` prop while keeping `Box` imported from Mantine. The MUI output likewise keeps Mantine's `Box` while adding `sx`; MUI is not installed in the audited workspaces, so that route remains package-unverified. These outputs do not reliably preserve the source component's rendered host or apply styles through the target's documented carrier.

Evidence: the corresponding exact outputs in the route ledger; [Emotion CSS usage](https://emotion.sh/docs/%40emotion/css), [Chakra Box and `css`](https://chakra-ui.com/docs/components/box), and [MUI Box API](https://mui.com/material-ui/api/box/). Exact installed packages: Emotion 11.13.5 and Chakra 3.37.0; MUI unavailable.

### Review outcome

Reviewed 2026-09-27 before any adapter or expected-output edit. Findings A1, A2, A3, and A4 are approved for focused source-specific fixes. Each fix starts with ordinary assertions and an exact inline expected-output snapshot in its own described JJ revision. Snapshot refresh alone is not correctness evidence.

## Product roles to apply

| Surface | Role |
| --- | --- |
| `css()` + short Vite setup | Primary new-authoring path. |
| `tw()`, `cx()`, class/token strategies | Existing-stack integration. |
| Codemod CLI and Migration Preview | Migration preview with target output, residuals, and proof tier. |
| Playground, Analyzer, Inspector, Studio, DevTools, MCP | Supporting tools for learning, inspection, and verification. |
| Long-tail adapters and non-web backends | Research/experimental until exact target proof exists. |

No tool or adapter is removed, no public API is added, and no route is promoted on fixture success alone.

## Limits

The ledger captures one primary input per pair; linked generated route tests contain the additional scenarios. It does not compile every route as an independent target project. Routes without exact target package/project proof remain unverified unless the emitted syntax itself establishes the defect. Existing installed-project route evidence remains governed by the proof catalog.

## Evidence files

- [Exhaustive route ledger](./codemod-canonicality-route-ledger.json)
- [Registered official API cases](../../packages/codemod/src/swap/official-api-cases.ts)
- [Route proof catalog](../../packages/codemod/src/swap/route-proof-catalog.ts)
- [Product focus and codemod audit plan](../085-product-focus-and-codemod-audit.md)
