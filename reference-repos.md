| Name          | URL                                        | Path                        | Why                                                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| state-machine | https://github.com/dunky-dev/state-machine | ~/.references/state-machine | Core-once / thin-per-substrate-targets architecture (react/solid/native/opentui) — the architectural model for plan 021 style backends. Its `native` target shows RN style-prop shape (array-mergeable); `opentui` target shows OpenTUI style shape (plain object, spread-merged) — the concrete TUI consumer for plan 021. |

## CSS-in-JS migration corpus

These are shallow, blob-filtered read-only clones under
`/Users/astahmer/.references/<id>`. The report generator verifies each pinned
HEAD and reads the selected file with `git show` before running the adapter.

| adapter           | repository                                             | pinned HEAD                                | exercised source                                                                 |
| ----------------- | ------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| panda             | https://github.com/chakra-ui/panda                     | `8a71bff3dc805e247be70d120cf485c8f14f104b` | `website/app/page.tsx`                                                           |
| emotion           | https://github.com/emotion-js/emotion                  | `b882bcba85132554992e4bd49e94c95939bbf810` | `packages/babel-plugin/__tests__/__fixtures__/core-with-css-import.js`           |
| styled-components | https://github.com/styled-components/styled-components | `5f2a27ad31d4b17315a099c7f4ac8300c15f2cc2` | `packages/benchmarks/src/implementations/styled-components-object/View.js`       |
| vanilla-extract   | https://github.com/vanilla-extract-css/vanilla-extract | `881c256a867f55386f96a7fe95068300bac720e6` | `examples/next/components/HelloWorld.css.ts`                                     |
| stitches          | https://github.com/stitchesjs/stitches                 | `50fd8a1adc6360340fe348a8b3ebc8b06d38e230` | `packages/core/tests/basic.js`                                                   |
| linaria           | https://github.com/callstack/linaria                   | `41d201d45aa7c64aa0f2bd3148ec919c8e1f54eb` | `examples/astro-solid/pages/csr.tsx`                                             |
| jss               | https://github.com/cssinjs/jss                         | `901882a894c7e802450696ebe2ea633ae63c5977` | `examples/inline/app.js`                                                         |
| fela              | https://github.com/rofrischmann/fela                   | `6883525fa44c2c47d0d93768eb26f072fee3c439` | `packages/fela-dom/src/dom/__tests__/render-test.js`                             |
| goober            | https://github.com/cristianbote/goober                 | `e7e6d33e210ed1f886fb4f372fc25ffd22d358d0` | `src/__tests__/css.test.js`                                                      |
| aphrodite         | https://github.com/Khan/aphrodite                      | `225f43c5802259a9e042b384a1f4f2e5b48094ea` | `tests/index_test.js`                                                            |
| style9            | https://github.com/johanholmerin/style9                | `b0657ddb3cd24434a6a59db9c2e22cbedf5e6f42` | `examples/nextjs/shared/styles.js`                                               |
| treat             | https://github.com/seek-oss/treat                      | `1cc001170ee6b66b1d960ac4097fb84597163d1c` | `examples/gatsby-plugin-treat-example/src/components/Button.treat.js`            |
| compiled          | https://github.com/atlassian-labs/compiled             | `0f5d2b606471b9fb92c2402d5367c3c23efd1a29` | `fixtures/parcel-optimizer-test-app/src/index.jsx`                               |
| solid-styled      | https://github.com/solidjs/solid-styled-components     | `b798a6d91a02450f3649365a3cdb27a282f4b37d` | `test/test.spec.tsx`                                                             |
| vue-styled        | https://github.com/vue-styled-components/core          | `5874630ed4d54aa955052fc864140eeae30fad2c` | `packages/playground/src/App.vue`                                                |
| stylex            | https://github.com/facebook/stylex                     | `5f7acaa4b332e2cf8352e95e5bc83efd70904fd4` | `packages/@stylexjs/babel-plugin/__tests__/legacy/stylex-transform-call-test.js` |
