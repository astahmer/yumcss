# Fixture-only adapter proof plan

This is the executable backlog behind
[`real-browser-ssr-proof-matrix.json`](./real-browser-ssr-proof-matrix.json).
It replaces the phrase “add installed proof” with one pinned source, one host
shape, one runner, and one acceptance record per adapter. A row is complete
only when its runner writes `plans/evidence/<id>-installed-proof.json` and the
report contains the required dimensions below.

## Shared acceptance contract

Every web row uses the same two-copy runner shape:

1. Materialize the exact commit from `real-repository-migrations-v2.json` into
   a disposable source checkout.
2. Install the reference project's declared dependencies and run its official
   typecheck/build command.
3. Copy the host into a target checkout, run the normal `pandwind-codemod
migrate` route, and install the target dependency from the local built
   package.
4. Run target typecheck/build, start source and target servers, and compare the
   declared route/state matrix in Playwright.
5. Render both copies through the host SSR entry and record hydration errors.
6. Measure emitted CSS after build. The proof fails when target CSS is larger
   without an explicit adapter-specific explanation.

Each JSON report must contain:

```text
route, fixture.files, dependencies.installed, dependencies.targetNodeModule,
migration.converted/skipped/residuals/canonical, checks, ssr, browser, css
```

The codemod route remains conservative: a residual is a failed proof until the
fixture proves that the residual is intentional and the route policy records
that exception. No snapshot refresh can make an unproved route pass.

## Rows to promote

| Adapter           | Pinned source and entry                                                                                                               | Host and exact runner                                                                                                                                 | Required proof state                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vanilla-extract` | `vanilla-extract-example` at `881c256a867f55386f96a7fe95068300bac720e6`; `examples/next/components/HelloWorld.css.ts`                 | Next host copied from `examples/next`; add `scripts/promote-vanilla-extract.ts` and run `pnpm run pivot:proof:installed:vanilla-extract`              | `tsc`, `next build`, `/`, `/about` browser states, SSR/hydration, extracted CSS bytes; fail on the current 2 configuration residuals until config loading is proven |
| `stitches`        | `stitches-react-test` at `50fd8a1adc6360340fe348a8b3ebc8b06d38e230`; `packages/core/tests/basic.js`                                   | Create a disposable React/Vite host around the pinned `@stitches/react` test API; `scripts/promote-stitches.ts`                                       | `tsc`, Vite build, one SSR render, base/hover browser states, extracted source CSS vs target CSS; preserve media/pseudo residuals                                   |
| `linaria`         | `linaria-solid-example` at `41d201d45aa7c64aa0f2bd3148ec919c8e1f54eb`; `examples/astro-solid/pages/csr.tsx`                           | Use the existing Astro/Solid example and add `scripts/promote-linaria-solid.ts`                                                                       | Astro build, browser `/`, SSR HTML where Astro exposes it, hydration error check, generated CSS byte comparison                                                     |
| `mantine`         | `mantine-style-props` at `8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8`; `apps/help.mantine.dev/src/components/MdxLayout/MdxLayout.tsx`   | Promote the existing help app as a Next host; `scripts/promote-mantine.ts`                                                                            | installed `@mantine/core`/emotion dependencies, typecheck/build, one docs route plus a style-prop route, SSR/hydration, CSS size                                    |
| `mui`             | `mui-box-sx` at `fc3a3a0a8b7c8f20274eca4758ea07a33e25c1b4`; `docs/data/material/components/box/BoxSx.tsx`                             | Extract the docs example into a disposable React/Vite host while retaining installed `@mui/material` and Emotion; `scripts/promote-mui.ts`            | typecheck/build, SSR `renderToString`, browser base/hover/media states, Emotion source CSS vs Pandwind CSS size                                                     |
| `next-yak`        | `next-yak-benchmark-realistic-button` at `3dee1bc32e651ace01c5e4d9306c541337d0c1ce`; `techs/next-yak/case/realistic-button/index.tsx` | Use the benchmark's Next host; `scripts/promote-next-yak.ts`                                                                                          | Next typecheck/build, `/` SSR/RSC response, hydration, browser button states, emitted CSS size                                                                      |
| `jss`             | `jss-nested-benchmark` at `901882a894c7e802450696ebe2ea633ae63c5977`; `examples/inline/app.js`                                        | Add a minimal React/Vite shell that imports the pinned JSS renderer; `scripts/promote-jss.ts`                                                         | installed JSS typecheck/build, SSR style-tag capture, browser nested/hover states, source style-tag bytes vs target CSS                                             |
| `fela`            | `fela-render-test` at `6883525fa44c2c47d0d93768eb26f072fee3c439`; `packages/fela-dom/src/dom/__tests__/render-test.js`                | Wrap the pinned Fela DOM renderer in a React/Vite host; `scripts/promote-fela.ts`                                                                     | typecheck/build, SSR renderer output, browser pseudo/hover state, hydration errors, CSS size                                                                        |
| `aphrodite`       | `aphrodite-api-test` at `225f43c5802259a9e042b384a1f4f2e5b48094ea`; `tests/index_test.js`                                             | Use a React/Vite host with installed Aphrodite injection; `scripts/promote-aphrodite.ts`                                                              | typecheck/build, SSR extracted style tags, browser base/hover state, hydration, CSS size                                                                            |
| `style9`          | `style9-next-styles` at `b0657ddb3cd24434a6a59db9c2e22cbedf5e6f42`; `examples/nextjs/shared/styles.js`                                | Use the pinned Next example; `scripts/promote-style9.ts`                                                                                              | Next typecheck/build, `/` SSR/RSC, browser responsive states, CSS size; keep the existing linked-CSS semantics                                                      |
| `treat`           | `treat-button` at `1cc001170ee6b66b1d960ac4097fb84597163d1c`; `examples/gatsby-plugin-treat-example/src/components/Button.treat.js`   | Promote the Gatsby example with its official plugin; `scripts/promote-treat.ts`                                                                       | Gatsby build, browser route, SSR HTML/style extraction, hydration if the host hydrates, CSS size                                                                    |
| `compiled`        | `compiled-vite-example` at `0f5d2b606471b9fb92c2402d5367c3c23efd1a29`; `fixtures/parcel-optimizer-test-app/src/index.jsx`             | Use the fixture's Vite/Parcel host; `scripts/promote-compiled.ts`                                                                                     | official transform/build, browser state, SSR only if the host has a server entry, CSS size plus inline-style accounting                                             |
| `solid-styled`    | `solid-styled-runtime` at `b798a6d91a02450f3649365a3cdb27a282f4b37d`; `test/test.spec.tsx`                                            | Use the pinned Solid test host with a browser build; `scripts/promote-solid-styled.ts`                                                                | Solid typecheck/build, browser base/hover states, SSR if the package's Solid server renderer is present, generated CSS size                                         |
| `vue-styled`      | `vue-styled-css-test` at `5874630ed4d54aa955052fc864140eeae30fad2c`; `packages/playground/src/App.vue`                                | Use the pinned Vue playground/Vite host; `scripts/promote-vue-styled.ts`                                                                              | Vue typecheck/build, browser route and hydration, SSR only when the host has `@vue/server-renderer`, CSS size                                                       |
| `tokenami`        | `tokenami-nextjs-button` at `29cf3b97ef14b22421734113f37b7b29e73f35e0`; `examples/nextjs/src/components/button.tsx`                   | Use the pinned Next example; `scripts/promote-tokenami.ts`                                                                                            | Next typecheck/build, `/` SSR/RSC, hydration, browser token/variant states, target CSS not larger                                                                   |
| `unocss`          | `unocss-nextjs-page` at `75103d5e12ec9876069daf6b97a7db1d73428829`; `examples/next/app/page.tsx`                                      | Extend `scripts/promote-unocss-fixture.ts` into `scripts/promote-unocss-next.ts`; use the official UnoCSS config/generator and the existing Next host | Next typecheck/build, `/` SSR/RSC, hydration, browser base/hover/responsive states, generated CSS size                                                              |

## React Native is a separate proof shape

React Native cannot satisfy web CSS-size or DOM-SSR checks. It should not be
silently counted as passing those dimensions. Add a pinned local fixture under
`examples/migrations/react-native-installed-proof/` with `react-native-web`,
the installed source adapter, and the Pandwind React Native backend. Its report
must use:

```text
typecheck, Metro/bundle build, react-native-web browser render,
react-test-renderer or React Native server render when supported,
hydration = not-applicable, css-size = not-applicable,
js-bundle-size = required
```

The route policy should name those two dimensions explicitly as `not-applicable`
with a reason, rather than treating missing CSS as a green result. The browser
assertions are concrete: base, pressed/hover web state, disabled, and dynamic
style prop output must render the same computed declarations in source and
target backends.

## Work order and completion commands

The promotion order minimizes new runner code:

1. Promote `unocss`, `tokenami`, `mantine`, and `mui` through the existing Next
   host proof because their reference entries already expose application code.
2. Extract the shared React/Vite SSR/browser/CSS harness used by `jss`, `fela`,
   `aphrodite`, `stitches`, and `compiled`; each adapter runner supplies only
   its source entry and official build command.
3. Promote `vanilla-extract`, `style9`, `next-yak`, and the Solid/Vue rows with
   their native host build plugins.
4. Add the explicit React Native web/Metro report shape.
5. Update `fixtureOnlyAdapters` only after `pnpm run proof:docs:check` sees the
   corresponding JSON evidence and the route catalog evaluates every required
   dimension as passed or explicitly not-applicable.

Each row has one bounded command, one pinned input, and one report path. This is
enough to implement and review the work without treating a broad “run more
proofs” statement as completion.

## Already covered

These are deliberately absent from the fixture-only list:

- Panda now has the installed website proof in
  `plans/evidence/panda-website-installed-proof.json`, including `/`,
  `/showcase`, all 200 HTTP routes, 98 RSC streams, 98 settled browser routes,
  typecheck/build, and CSS-size evidence.
- StyleX already has the checked-in `stylex-docs` claim and the three-lane
  `astryx-docsite` proof in `real-browser-ssr-proof-matrix.json`. Its remaining
  work is broader route coverage only; it does not need another fixture-only
  promotion row.
