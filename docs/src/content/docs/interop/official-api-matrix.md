---
title: Official CSS-in-JS API matrix
description: The documented authoring forms covered by YumCSS's adapter proofs.
sidebar:
  order: 3
---

# Official CSS-in-JS API matrix

YumCSS treats an ecosystem's public authoring forms as evidence, not as a
guessable list of package exports. This page is the compact reference for the
forms used by the adapter contract tests.

“Every API” means every documented _syntax family_ that the adapter claims to
recognize. It does not mean every possible property value or every arbitrary
plugin. Values, themes, conditions, computed expressions, configuration, and
host/framework behavior are separate semantic cases in the test suite.

## Evidence and outcomes

Each row links to the ecosystem's official documentation or maintained project
repository. The corresponding snapshot case uses the real syntax from that
source. A form is one of:

- **static** — converted into YumCSS's static semantic carrier;
- **native** — preserved through a target-owned component, map, or rule API;
- **residual** — recognized but intentionally source-preserved because
  flattening it would change semantics;
- **context** — a theme/config/helper API that supplies meaning but is not a
  style carrier by itself.

The executable contract is
`packages/codemod/tests/official-adapter-api-matrix.test.ts`. Chakra's deeper
API-specific assertions remain in
`packages/codemod/tests/chakra-official-api.test.ts`. The secondary syntax
families for every adapter are exercised by
`packages/codemod/tests/official-adapter-api-families.test.ts`; those cases use
the actual package syntax and classify static carriers, runtime/context APIs,
and source-preserving residuals separately.

## Core and popular web systems

| Adapter                                                                   | Official authoring families                                                                                                        | Proof interpretation                                                                                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Panda CSS](https://panda-css.com/docs/concepts/writing-styles)           | generated `css({...})`; `cva`/`sva` recipes; generated `styled`/pattern components; `globalCss` config; token helpers              | `css` is static. Recipes, generated components, global config, and token helpers are composition/context forms and must retain their own semantics.                   |
| [StyleX](https://stylexjs.com/docs/learn/)                                | `stylex.create`; `stylex.props`; `stylex.keyframes`; `stylex.defineVars`; theme/variable composition                               | `create`, keyframes, and variables are parsed. `props` is validated as a host projection, not as a style factory.                                                     |
| [React Strict DOM](https://github.com/react/react-strict-dom)             | `css.create`; `html.*`; `style`; `css.keyframes`; `css.defineVars`; `compat.native`                                                | Static style maps and intrinsic hosts are converted. `compat.native`, `css.createTheme`, and compiler/provider boundaries remain typed residuals.                     |
| [Emotion](https://emotion.sh/docs/introduction)                           | `@emotion/css` object/template `css`; `@emotion/react` `css` prop; `styled`; `keyframes`; `injectGlobal`/`global`                  | Object and static template forms are extracted. callbacks and nested runtime interpolations use dynamic/host contracts.                                               |
| [styled-components](https://styled-components.com/docs/api)               | `styled.tag`/`styled(Component)` object and template forms; `keyframes`; `createGlobalStyle`; theme callbacks and polymorphic `as` | Static subjects, keyframes, and globals are represented. theme callbacks and subject use-sites require the component/runtime projection.                              |
| [Vanilla Extract](https://vanilla-extract.style/documentation/api/style/) | `style`; `styleVariants`; `recipe`; `globalStyle`; `keyframes`; `fontFace`; `createVar`/`createTheme`                              | `style`, globals, keyframes, and font faces are rule forms. variants, recipes, vars, and themes carry composition/config context.                                     |
| [Stitches](https://stitches.dev/docs/styling)                             | `css`; `styled`; `globalCss`; `keyframes`; variants, compound variants, `createTheme`                                              | ordinary rules, globals, and keyframes are parsed; variants/themes remain composition or context metadata.                                                            |
| [Linaria](https://linaria.dev/)                                           | `css` tagged templates; `styled` tagged templates; `css` prop; atomic extraction/config                                            | static templates are extracted. interpolations and component subjects use the dynamic/host contract.                                                                  |
| [JSS / React-JSS](https://github.com/cssinjs/jss)                         | `createUseStyles`; `createStyleSheet`; `createRule`; named rule maps; imperative `attach`/`applyTo`                                | named maps and static rules are preserved. imperative application is a separate host operation and must be rewritten or reported.                                     |
| [Compiled](https://compiledcssinjs.com/docs/pkg-react)                    | `css`; `cssMap`; `keyframes`; `styled`; `ClassNames`; CSS prop                                                                     | `css` is extracted. `cssMap`, keyframes, and component/class helpers are tested as distinct carriers; deprecated or runtime-only forms do not get silently flattened. |

## Runtime and component-oriented systems

| Adapter                                                    | Official authoring families                                                                                                 | Proof interpretation                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Fela](https://fela.js.org/docs/)                          | `renderer.renderRule`; renderer/monolithic rules; `createComponent`; plugins                                                | static rule objects are extracted. renderer plugins and component factories require their own runtime/host contract.                                                                       |
| [Goober](https://goober.js.org/api/styled/)                | `css` object/template; `styled`; `setup`/runtime configuration                                                              | object rules are extracted. styled subjects and setup context are tested as component/config semantics.                                                                                    |
| [Aphrodite](https://github.com/Khan/aphrodite#usage)       | `StyleSheet.create`; named style maps; array composition; `fontFace` arrays                                                 | named maps and composition are not confused with one style object; font-face arrays are rule-level cases.                                                                                  |
| [Treat](https://seek-oss.github.io/treat/how-it-works/)    | `.treat` `style`; `createTheme`; theme references; compile-time files                                                       | static `.treat` rules are extracted. theme creation/references are context and must be loaded from the project.                                                                            |
| [Next-Yak](https://yak.js.org/docs/features)               | `css` tagged templates; `styled` templates; CSS prop; extracted plugin output                                               | static templates are extracted; dynamic templates and Next/framework behavior remain target-owned.                                                                                         |
| [Chakra UI](https://chakra-ui.com/docs/styling/overview)   | style props; `css` prop; `chakra` factory; public `system.css`/`defaultSystem.css`; recipes and slot recipes; token helpers | style objects lower to a style carrier. `system.css` returns a style object; it is never invented as a `className` API. recipes and slot recipes retain composition semantics.             |
| [MUI](https://mui.com/system/getting-started/the-sx-prop/) | `sx`; `styled`; theme callbacks; `Box`/system components; theme provider                                                    | `sx` and `styled` are host-aware carriers. There is no generic standalone `sx()` factory to synthesize.                                                                                    |
| [Mantine](https://mantine.dev/styles/style-props/)         | style props; `style`; `styles`; `classNames`; `vars`; theme/provider                                                        | style props are extracted. `styles`, `classNames`, vars, and theme/provider behavior are component/context forms. Current Mantine APIs are not confused with the older `createStyles` API. |

## Utility, token, and framework-native systems

| Adapter                                                                             | Official authoring families                                                          | Proof interpretation                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [React Native](https://reactnative.dev/docs/stylesheet)                             | `StyleSheet.create`; inline `style`; arrays; platform selectors                      | `StyleSheet` is a named style map and requires a native host projection; DOM class semantics are not assumed to be equivalent.                                                                                                                                        |
| [Tokenami](https://github.com/tokenami/tokenami)                                    | `css`; `css.compose`; aliases; custom-property selectors; responsive/config context  | CSS keys and aliases are normalized into the semantic IR; composition and project config remain explicit.                                                                                                                                                             |
| [UnoCSS](https://unocss.dev/)                                                       | utility classes; variants; shortcuts; presets; generated CSS/config                  | static source candidates are sent to the official config/generator. Presets, rules, shortcuts, theme variables, and nested generated CSS are preserved when the generator exposes them; extractor/transformer-only runtime behavior remains an explicit residual.     |
| [Tailwind CSS](https://tailwindcss.com/docs/styling-with-utility-classes)           | utility classes; variants; arbitrary values; `@theme`; `@utility`; `@plugin`; config | the adapter discovers the project CSS graph, loads it through `@tailwindcss/node`, and parses generated candidate CSS structurally. Candidate utilities and variants can be lowered; global/plugin side effects that are not candidate CSS remain explicit residuals. |
| [Bamboo](https://github.com/bamboocss/bamboo)                                       | project-local `styled-system/css` object dialect; project config                     | Bamboo is treated as a project dialect over the styled-system object contract, not as a guessed universal upstream API.                                                                                                                                               |
| [Style9](https://github.com/jaredpalmer/style9#readme)                              | `style9.create`; `style9(...)`; variants/composition                                 | named style maps use the target map contract; composition and variant semantics are separate cases.                                                                                                                                                                   |
| [Solid Styled Components](https://github.com/solidjs/solid-styled-components)       | `styled` intrinsic/component templates; prop callbacks; Solid host bindings          | static templates can be projected; Solid signals, directives, and reactive callbacks require a Solid host contract.                                                                                                                                                   |
| [Vue Styled Components](https://github.com/styled-components/vue-styled-components) | `styled` intrinsic/component templates; Vue prop/theme callbacks                     | static templates can be projected; Vue bindings and reactive theme behavior require the Vue host contract.                                                                                                                                                            |

## Static stylesheet and component source systems

These source families use the same adapter contract but are not treated as
CSS-in-JS. Their natural target may be authored CSS, a generated stylesheet,
or a YumCSS class map depending on the source semantics.

| Adapter                                                          | Official authoring families                                                          | Proof interpretation                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Tamagui](https://tamagui.dev/docs/intro/styles)                 | `styled`; View/Text style props; tokens; themes; variants; media props; `render`     | Static `styled` objects can become target-owned component/class carriers. Theme callbacks, function-valued variants, compiler-only configuration, and unresolved style-prop catalogs remain explicit residuals.                                                      |
| [CSS Modules](https://github.com/css-modules/css-modules)        | local classes; `composes`; `:global`; `:local`; imported class maps                  | Simple local classes become a target-owned class map and consumer imports are rewritten atomically. Global scope, composition, and public hash contracts are preserved or reported rather than flattened.                                                            |
| [Sass / SCSS](https://sass-lang.com/documentation/)              | variables; nesting; mixins; functions; interpolation; imports; `@use`/`@forward`     | The official Sass compiler and source-map output are used when available. Provably static rules can be lowered; preprocessing that affects selector/value generation stays authored CSS with compiler evidence.                                                      |
| [Less](https://lesscss.org/)                                     | variables; mixins; functions; guards; imports; nesting; interpolation                | The official Less compiler is a separate port from Sass. Static output can be emitted as authored CSS; Less-specific generation is never interpreted as Sass semantics.                                                                                              |
| [Authored CSS](https://developer.mozilla.org/en-US/docs/Web/CSS) | classes; selectors; nesting; globals; keyframes; fonts; layers; supports; properties | Rule-level CSS is parsed into `StyleProgram`. Local rules may be lowered; the narrow `preset.web` lane covers preset-owned flat globals, named keyframes, and font faces, while nesting, cascade-sensitive constructs, and unsupported at-rules remain authored CSS. |

## Migration route canonicality

The route registry and this API syntax matrix answer different questions. The
current 1,024-pair canonicality audit records 32 canonical identity pairs, 177
safe residual pairs, and 815 unverified pairs. No non-identity route is
classified as canonical. `Safe residual` means the primary input stays visible
with typed residual evidence; it is not a completed migration.

Route maturity remains separate: 22 routes are experimental and 1,002 are
research. Passing a fixture does not promote a route or prove an arbitrary
project build, SSR, hydration, or browser behavior. Read the
[full audit](https://github.com/astahmer/yumcss/blob/main/plans/evidence/codemod-canonicality-audit.md)
and [route ledger](https://github.com/astahmer/yumcss/blob/main/plans/evidence/codemod-canonicality-route-ledger.json)
before treating a route as supported.

## What the snapshots guarantee

For each registered adapter, the primary and secondary matrix tests use
source-specific examples rather than a generic route label. Every converted case asserts a conversion count,
zero skips, zero residuals, and the emitted code. Every residual case asserts
that the source is preserved, the residual has a typed kind and hint, and the
result contains the migration marker. The inline snapshots expose the exact
route evidence for fast review; ordinary `expect` assertions prevent a
snapshot update from turning a failed conversion into a green test.

The snapshots prove only their concrete conversion and residual contracts;
they do not establish canonical target usage for every route. The audit keeps
those results separate from installed-project proof. Project-aware runs must
load the official package/configuration context. If that context cannot be
evaluated, the adapter reports a configuration residual instead of silently
falling back to a default theme or utility catalog.
