# Installed-project adapter proof plan

This is the executable backlog behind
[`real-browser-ssr-proof-matrix.json`](./real-browser-ssr-proof-matrix.json).
It originally tracked fixture-only adapters; it now records the pinned source,
host shape, runner, and acceptance record for every promoted web lane. A row is complete
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

## Promoted rows

`vanilla-extract` is now covered by the pinned installed-project runner
`scripts/promote-vanilla-extract.ts` and
`plans/evidence/vanilla-extract-installed-proof.json`. The proof uses the
upstream `HelloWorld.css.ts` example at
`881c256a867f55386f96a7fe95068300bac720e6`, preserves typed custom
properties, fallback variables, and keyframes, and passes typecheck, build,
SSR, hydration, and base/hover browser parity. Its tiny CSS byte comparison
is intentionally diagnostic: fused source CSS and Pandwind atomic runtime CSS
are different representations, so the route does not claim non-growth from
that fixture.

Stitches is now covered by the pinned installed-project runner
scripts/promote-stitches.ts and
plans/evidence/stitches-installed-proof.json. The proof exercises the
upstream Stitches React API with theme tokens, a variant recipe, and a hover
pseudo-condition, then checks typecheck, build, SSR, hydration, browser parity,
and canonical CSS. Its source sheet is fused while the target is atomic, so the
CSS byte comparison is useful for this fixture but is not a universal size
claim.

MUI is now covered by the pinned installed-project runner
scripts/promote-mui.ts and plans/evidence/mui-installed-proof.json. The proof
uses the upstream Box sx example as its source reference, proves static system
values and a hover condition through the installed React/Vite host, and passes
typecheck, build, SSR, hydration, generated atomic CSS, and browser parity.
ThemeProvider-owned callbacks, responsive arrays, and component theme overrides
remain explicit residual territory.

Mantine is now covered by the pinned installed-project runner
scripts/promote-mantine.ts and plans/evidence/mantine-installed-proof.json. The
proof uses the upstream help-center style-prop surface as its source reference,
exercises an installed MantineProvider plus a real Box with static `c`, `bg`,
`p`, `bdrs`, and `fw` props, and passes typecheck, build, SSR, hydration,
atomic CSS generation, and base/hover browser parity. Provider-owned theme
callbacks, styles/classNames/vars maps, and responsive style-prop objects remain
explicit residual territory.

Tokenami is now covered by the pinned installed-project runner
`scripts/promote-tokenami.ts` and
`plans/evidence/tokenami-installed-proof.json`. The proof uses the upstream
`css.compose` button example at
`29cf3b97ef14b22421734113f37b7b29e73f35e0`, exercises encoded aliases, grid
values, verified theme-variable resolution, and hover conditions, and passes
typecheck, build, SSR, hydration, canonical CSS, atomic CSS generation, and
browser parity. The target is smaller for this fixture because it inlines only
the theme values actually used instead of retaining Tokenami's full generated
theme/reset sheet; runtime composition, theme-mode switching, and global rules
remain explicit residual territory.

UnoCSS now also has a real upstream Next proof in
`scripts/promote-unocss-next.ts` and
`plans/evidence/unocss-next-installed-proof.json`. It uses the pinned upstream
Next page at `75103d5e12ec9876069daf6b97a7db1d73428829`, loads the official
UnoCSS PostCSS generator during migration, then removes the UnoCSS config,
plugin bridge, and direct dependencies from the target. The target passes
typecheck, Next Webpack build, HTTP route checks, RSC streaming, browser text
parity, and canonical CSS equality; CSS falls from 5,462 to 2,647 bytes. The
proof uses Next 16's Webpack mode because the generated Pandwind integration is
a Webpack plugin in this host; the existing Vite proof remains the browser
pixel-parity check for UnoCSS hover and responsive states.

JSS is now covered by the shared installed CSS-in-JS runner
`scripts/promote-css-in-js.ts jss` and
`plans/evidence/jss-installed-proof.json`. It uses the pinned JSS inline example
at `901882a894c7e802450696ebe2ea633ae63c5977`, installs the official nested and
camel-case plugins, and proves static sheet creation, attachment, SSR, hydration,
and browser parity. Dynamic rule values, plugin-specific runtime behavior, and
non-static renderer inputs remain explicit residual territory; the source-sheet
versus atomic-CSS byte comparison is diagnostic rather than a universal budget.

Fela is now covered by `scripts/promote-css-in-js.ts fela` and
`plans/evidence/fela-installed-proof.json`. It uses the pinned Fela DOM render
test, proves a static `renderRule` with empty props, hover output, SSR,
hydration, and browser parity. Dynamic props, enhancers, plugins, and
renderer-owned component options remain explicit residual territory.

Aphrodite is now covered by `scripts/promote-css-in-js.ts aphrodite` and
`plans/evidence/aphrodite-installed-proof.json`. It uses the pinned Aphrodite
API test, proves `StyleSheet.create` plus `css`, server CSS collection, SSR,
hydration, and base/hover browser parity. Dynamic style arrays, keyframes,
font-face, and runtime-specific injection options remain explicit residual
territory.

Compiled is now covered by `scripts/promote-css-in-js.ts compiled` and
`plans/evidence/compiled-installed-proof.json`. It uses the pinned Atlassian
Compiled Vite fixture, proves the official Vite plugin, `styled`, `cssMapScoped`,
SSR, hydration, browser parity, and inline-style-aware CSS accounting. The
fixture is typechecked with the published package's intentional `cssMapScoped`
root-type gap preserved as a narrow proof shim; plugin-specific transforms,
dynamic style expressions, and broader CSS-map runtime semantics remain explicit
residual territory.

Style9 and Next-yak are now covered by the shared installed runner through
`scripts/promote-css-in-js.ts style9` and `scripts/promote-css-in-js.ts
next-yak`, with reports in `plans/evidence/style9-installed-proof.json` and
`plans/evidence/next-yak-installed-proof.json`. The proofs use pinned upstream
examples, pass typecheck, build, SSR, hydration, and browser parity, and record
their static versus runtime CSS accounting. Style9's dynamic style-map
expressions and Next-yak's nested dynamic template composition remain explicit
residual territory.

Linaria, Treat, Solid Styled, and Vue Styled now have installed-project proofs
as well. `scripts/promote-framework-css-in-js.ts` covers the pinned Astro/Solid,
Solid test-host, and Vue SFC examples; `scripts/promote-treat.ts` uses Treat's
official Webpack compiler for the source copy and Pandwind's Vite integration
for the target. Their reports are `linaria-installed-proof.json`,
`solid-styled-installed-proof.json`, `vue-styled-installed-proof.json`, and
`treat-installed-proof.json`. Each passes canonical migration, dependency
installation, typecheck, build, SSR, hydration, and base/hover browser parity.
Linaria and Treat record diagnostic CSS-size comparisons where the runtime
carrier is larger than the source compiler's extracted stylesheet; this is
visible evidence, not a waived failure. Dynamic theme APIs, nested templates,
framework macros, and other unsupported host semantics remain residual work.

## Web rows now promoted

The six previously queued web rows are now registered as experimental
installed-project routes in `packages/codemod/src/swap/route-proof-catalog.ts`.
Run `pnpm run pivot:proof:installed:routes` for the read-only gate, or
`pnpm run pivot:proof:installed:routes:run` to rebuild every route report.

The only remaining shape in this plan is React Native, because its Metro and
`react-native-web` proof cannot honestly share the web CSS/DOM acceptance
contract below.

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

1. Keep the shared installed runners deterministic and rerun them when adapter
   or host semantics change; the 19 web routes now share the route gate and
   record adapter-specific CSS accounting.
2. Add the explicit React Native web/Metro report shape.
3. Update the documentation matrix only when a route has a real project claim;
   installed-project evidence and broad documentation migrations remain separate
   proof tiers.

Each row has one bounded command, one pinned input, and one report path. This is
enough to implement and review the work without treating a broad “run more
proofs” statement as completion.

## Verified prerequisites

The source commits and paths in the table are already registered in
`packages/codemod/src/swap/real-repository-corpus.ts`. Prepare them with the
existing reference workflow before implementing a runner:

```text
pnpm run references:prepare -- <catalog-id>
pnpm run references:deps
```

Use these exact catalog ids when preparing the rows:

- `vanilla-extract`, `stitches`, `linaria`, `mantine`, `mui`, `jss`, `fela`,
  `aphrodite`, `style9`, `treat`, `compiled`, `solid-styled`, `vue-styled`,
  `tokenami`, and `unocss` resolve to the checkout names used in the table.
- `next-yak-benchmark-realistic-button` resolves to the existing
  `css-in-js-bench` checkout at commit
  `3dee1bc32e651ace01c5e4d9306c541337d0c1ce`; there is no separate
  `next-yak` repository checkout to prepare.
- React Native has no suitable upstream application in the corpus. Its proof
  is intentionally a checked-in local fixture with `react-native-web` and
  Metro, so it must not be blocked on an external repository.

UnoCSS has both the bounded installed fixture at
`plans/evidence/unocss-installed-proof.json` and the pinned upstream Next proof
at `plans/evidence/unocss-next-installed-proof.json`. StyleX is already
represented by the `stylex-docs` and `astryx-docsite` claims below; its open
item is route breadth, not a missing typecheck/build/browser proof.

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
