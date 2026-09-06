# Codemod conversion audit

Status: complete
Started: 2026-09-06
Closed: 2026-09-06
Scope: every generated directional scenario in `packages/codemod/tests/routes` and every generated round-trip scenario in `packages/codemod/tests/roundtrips`.

This is a review ledger, not a snapshot approval list. A scenario is checked
only when its source uses a documented API, its configured and unconfigured
inputs are meaningful for that adapter, its result is classified correctly, and
the test has ordinary assertions for conversion, residuals, emitted API shape,
and configuration evidence where those concepts apply. A passing snapshot by
itself does not close an item.

## Inventory and coverage

The matrix contains 31 registered adapters, 930 directional files, and 930
round-trip files. Every directional file has five scenarios and every
round-trip file has four scenarios:

1. documented primary API without project configuration;
2. a documented secondary API family;
3. blue and amber configured project variants;
4. a configured token-value variant;
5. malformed source preservation.

The generated route tests use the shared in-memory project harness. It supplies
real virtual files and injectable official loader shims for adapters that have
an official project loader. The blue/amber variants prove that a target does not
invent a token when the configured value does not match. Adapters without an
official project loader deliberately keep literal source values; they are not
presented as successfully resolved configuration. Their documented config,
provider, runtime, or theme APIs are covered by the official family catalog and
typed context/runtime assertions.

| Source adapter | Directional routes | Round trips | Primary API | Family APIs | Status |
| --- | ---: | ---: | --- | --- | --- |
| pandwind | 30 | 30 | checked | checked | complete |
| panda | 30 | 30 | checked | checked | complete |
| stylex | 30 | 30 | checked | checked | complete |
| emotion | 30 | 30 | checked | checked | complete |
| styled-components | 30 | 30 | checked | checked | complete |
| vanilla-extract | 30 | 30 | checked | checked | complete |
| stitches | 30 | 30 | checked | checked | complete |
| linaria | 30 | 30 | checked | checked | complete |
| jss | 30 | 30 | checked | checked | complete |
| fela | 30 | 30 | checked | checked | complete |
| goober | 30 | 30 | checked | checked | complete |
| aphrodite | 30 | 30 | checked | checked | complete |
| treat | 30 | 30 | checked | checked | complete |
| compiled | 30 | 30 | checked | checked | complete |
| chakra-ui | 30 | 30 | checked | checked | complete |
| mui | 30 | 30 | checked | checked | complete |
| mantine | 30 | 30 | checked | checked | complete |
| next-yak | 30 | 30 | checked | checked | complete |
| bamboo | 30 | 30 | checked | checked | complete |
| style9 | 30 | 30 | checked | checked | complete |
| solid-styled | 30 | 30 | checked | checked | complete |
| vue-styled | 30 | 30 | checked | checked | complete |
| react-native | 30 | 30 | checked | checked | complete |
| tailwind | 30 | 30 | checked | checked | complete |
| tokenami | 30 | 30 | checked | checked | complete |
| unocss | 30 | 30 | checked | checked | complete |
| tamagui | 30 | 30 | checked | checked | complete |
| css-modules | 30 | 30 | checked | checked | complete |
| sass | 30 | 30 | checked | checked | complete |
| less | 30 | 30 | checked | checked | complete |
| authored-css | 30 | 30 | checked | checked | complete |

The source API catalog is in
`packages/codemod/src/swap/official-api-cases.ts`. The primary and family
conformance tests cover every registered adapter and assert the documented
expectation (`converted`, `runtime`, `residual`, `identity`, or `context`). The
route generator consumes that catalog; it does not maintain a second synthetic
API switch.

The API review covered these concrete forms and secondary families:

- Pandwind: `css.class`, `css.vars`, and named `css.group` maps.
- Panda: generated `css`, `cva`, `sva`, `styled`, global styles, token helpers,
  and recipe configuration.
- StyleX: `stylex.create`, `keyframes`, `defineVars`, `props`, and theme APIs.
- Emotion: object and tagged `css`, `keyframes`, `injectGlobal`, styled
  components, the `css` prop, and `Global`.
- styled-components: object and tagged `styled`, `keyframes`,
  `createGlobalStyle`, styled subjects, polymorphic `as`, `ThemeProvider`, and
  theme callbacks.
- Vanilla Extract: `style`, `globalStyle`, `keyframes`, `fontFace`,
  `styleVariants`, recipes, theme contracts, vars, and themes.
- Stitches: `css`, `globalCss`, `keyframes`, `styled`, variants, and
  `createTheme` context.
- Linaria: `css` templates, styled templates, and the `css` prop.
- JSS: `createUseStyles`, `createStyleSheet`, `createRule`, and imperative
  `applyTo`.
- Fela: `renderer.renderRule`, `createComponent`, and renderer plugin context.
- Goober: object/tagged `css`, styled templates, and `setup` context.
- Aphrodite: `StyleSheet.create`, font-face values, and array composition.
- Treat: `style` and `createTheme` context.
- Compiled: `css`, `cssMap`, `keyframes`, styled components, `ClassNames`, and
  the CSS prop.
- Chakra UI: `Box` style props, recipes, global system config, and token/system
  helpers.
- MUI: `Box` `sx`, styled components, theme callbacks, and `ThemeProvider`.
- Mantine: style props, `styles`, `classNames`, and `MantineProvider`.
- next-yak: `css`/styled templates and the CSS prop.
- Bamboo: the documented styled-system `css` object, patterns, and `cva`.
- Style9: `style9.create` maps and `style9` composition calls.
- Solid styled: styled templates and prop callbacks.
- Vue styled: styled templates and Vue theme callbacks.
- React Native: `StyleSheet.create`, inline style arrays, and `Platform.select`.
- Tokenami: `css`, `css.compose`, aliases, custom property selectors, and
  config context.
- UnoCSS: utility classes, variants, unknown shortcuts, and preset config.
- Tailwind CSS: arbitrary utilities, custom variants, unknown utilities, and
  CSS at-rule configuration.
- Tamagui: `styled`, `createTamagui`/`createTokens`, and theme callbacks.
- CSS Modules: local rules, named maps, `composes`, and global/descendant
  selectors.
- Sass: rules, variables/nesting, mixins, and `@use`.
- Less: rules, variables/nesting, mixins, and plain multi-rule stylesheets.
- Authored CSS: ordinary rules, at-rules/keyframes, non-class selectors, and
  multi-rule stylesheets.

## Findings and fixes

- **AUDIT-001 — generated routes used a synthetic source catalog instead of the
  official API catalog.** Fixed. `scripts/generate-adapter-route-specs.ts` now
  consumes `officialApiCases()` and `officialApiFamilyCases()`, so the route
  fixtures use the same documented forms as the focused conformance suites.
- **AUDIT-002 — configured and unconfigured scenarios were not distinct in a
  useful way.** Fixed with an explicit boundary. Configured routes now use
  blue/amber virtual projects, asynchronous official loaders, source token
  spellings where the adapter exposes them, target token assertions, and loader
  call evidence. Adapters without an official project loader keep literal
  values rather than pretending that a guessed config was resolved. Inline
  provider/theme/config APIs remain covered as context or runtime family cases.
- **AUDIT-003 — route assertions were outcome-shaped but not
  semantics-shaped.** Fixed. The shared assertions now check actionability,
  lowering plans, outcomes, validations, generated-file integrity, residual
  markers, source preservation, target class projections, and configured token
  spellings. Snapshots remain inspection evidence only.
- **AUDIT-004 — round trips could pass after carrying a residual marker without
  exercising the target adapter.** Fixed. `expectActionableRoundTrip` rejects a
  reverse no-op after a fully target-native conversion. The only accepted
  unchanged paths are explicit source-preserving residuals or a verified
  portable Pandwind artifact.
- **AUDIT-005 — there was no durable per-scenario review ledger.** Fixed by this
  file. The inventory, coverage boundary, accepted residual classes, fixes, and
  verification commands are recorded here so later iterations can resume from
  evidence rather than repeating the audit.
- **AUDIT-006 — route generation could erase inline snapshots before review.**
  Fixed. Snapshot preservation is two-phase and now refuses to run when the
  number of previous snapshots does not equal the generated placeholders. The
  legitimate matrix refresh updated 2,058 snapshots, followed by eight focused
  global-API snapshot updates. No snapshot was bulk-reset to an empty
  placeholder.
- **AUDIT-007 — the official UnoCSS context could reject target-generated
  arbitrary utilities.** Fixed. The official generated CSS resolver is composed
  with the narrow arbitrary-property resolver, so configured arbitrary
  candidates remain valid without replacing official evidence.
- **AUDIT-008 — portable target artifacts needed an explicit round-trip policy.**
  Fixed. A valid unchanged Pandwind portable artifact is accepted; an unchanged
  result after a target-native conversion is still rejected.
- **AUDIT-009 — configured UnoCSS could emit duplicate declarations.** Fixed.
  The CSS resolver now deduplicates exact property/value/condition triples when
  the same declaration is present in both the theme stylesheet and generated
  utility CSS.
- **AUDIT-010 — residual passes could add duplicate migration markers.** Fixed.
  The migration engine filters an insertion when an adjacent source-preserving
  marker already exists, preserving one actionable marker per residual site.
- **AUDIT-011 — global template APIs were parsed as ordinary nested styles.**
  Fixed. Global template programs now carry `Global` rule kind and normalized
  selectors, allowing Emotion `injectGlobal`, styled-components
  `createGlobalStyle`, and equivalent global routes to validate correctly.
- **AUDIT-012 — the Less mixin family fixture called an undefined mixin.** Fixed.
  The fixture now defines `.shadow()` before using it. It remains a deliberate
  residual because the migration cannot safely lower Less mixin semantics from
  the stylesheet alone.
- **AUDIT-013 — optional generated assertions left trailing whitespace.** Fixed
  at the generator boundary. Adapters without literal source-token assertions
  no longer leave a tab-only line in generated route files; `git diff --check`
  is clean.

## Accepted residual and context cases

The matrix intentionally does not claim that every API family can be lowered
from a single source file. These cases remain successful when they preserve the
source and expose a typed explanation:

- runtime callbacks and theme callbacks retain host-runtime semantics;
- providers, global config, token helpers, recipes, and theme declarations are
  context boundaries unless a verified project artifact supplies enough data;
- unknown Tailwind/UnoCSS utilities, CSS Modules composition, Sass/Less
  variables or mixins, unsupported selectors, and framework-specific component
  semantics remain typed residuals;
- portable Pandwind artifacts are accepted only under the explicit artifact
  round-trip policy.

These are not snapshot exceptions. The generated tests assert the residual kind,
hint, preservation marker, and unchanged source shape where preservation is the
contract.

## Verification checkpoints

- `nub scripts/generate-adapter-route-specs.ts`: generated 930 directional and
  930 round-trip specs.
- Structural inventory: 930 route files × 5 scenarios and 930 round-trip files
  × 4 scenarios; no missing headers, wrong counts, empty snapshots, missing
  evidence assertions, or missing async project harnesses.
- Full route matrix after final generation: **1,860 suites, 8,370 tests
  passed, 0 failed, 0 skipped, 0 snapshot failures**.
- Official primary/family, adapter evidence, and external-adapter suites:
  **4 files, 121 tests passed**.
- Codemod TypeScript check: `tsc --noEmit` passed.
- `git diff --check` passed.

The focused fixes are represented in the JJ history as the adapter validation
revision followed by this ledger closure revision. The route matrix remains
fully generated so future adapter changes can be checked with the same commands
without losing the individual source-specific fixtures.
