---
title: Limits & trade-offs
description: What needs planning when adopting YumCSS, and what a migration codemod can and cannot prove.
---

For a new web component, the main path is small: a typed preset, `css()`, and a
build plugin. Most of the long compatibility matrix concerns **migration tools**,
not restrictions on writing a component with YumCSS. The core still has real
boundaries worth understanding.

## Everyday authoring

| Boundary                                                                                                                  | What to do                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The extractor needs statically discoverable declarations. It cannot generate arbitrary runtime CSS from an unknown value. | Use `css.vars()` or parameterized groups for changing values. Spread `css.props()` so inline variables reach the element.                             |
| `createCss()` returns classes; it does not inject CSS.                                                                    | Import the extracted stylesheet. Use the explicit runtime-sheet integration when your host genuinely needs runtime rule registration.                 |
| Typed values depend on the preset. A property can still be deliberately open or escape through `$raw`.                    | Keep token bindings strict. Review and lint explicit escapes instead of treating TypeScript as a complete design review.                              |
| Compiled-map composition and class-string merging have different contracts.                                               | Use `css.props()` for maps and carriers; use `cx()` only for recognized class-string conflicts. Unknown classes retain ordinary CSS cascade behavior. |
| Complex global CSS is not all expressible as component style objects.                                                     | Keep authored CSS for document rules, font definitions, layers, and selectors outside the preset/extractor's supported syntax.                        |

Static calls can be inlined completely. Runtime choices can retain selection or
merge code; changing values need an inline-variable carrier. "Zero runtime for
static styles" is a statement about the extracted path, not every expression in
an application. See [extraction](/css/extraction/) and
[dynamic styles](/css/dynamic-styles/).

## Integrating with an existing project

- **Compatible output still needs an engine.** Tailwind and Panda strategies rely
  on those engines and matching project metadata. StyleX naming still uses the
  YumCSS stylesheet. Choosing a class-name strategy does not reproduce every
  host library's component, theme, or runtime behavior.
- **Generated files need freshness checks.** The Tailwind lane derives types,
  utility metadata, and optional bridge/conflict data from your configuration.
  Add `yumcss-codemod tw verify` to CI. Tailwind's official design-system loader
  currently uses an unstable upstream API, so version changes need validation.
- **Package and framework boundaries need setup.** Published component libraries
  need a library artifact or their own CSS delivery. SSR, hydration, framework
  plugins, and non-web hosts have their own integration contracts.
- **Non-web backends are experimental.** React Native and OpenTUI have bounded
  host evidence, not a promise that every CSS selector or web behavior translates.

These are library and integration trade-offs, even if you never run a codemod.

## Codemods are a starting point, not a one-shot guarantee

A listed source adapter means the tool understands a route. It does not mean
that every application using that library converts automatically.

**Usually straightforward:** statically known declarations, supported token
references, conditions, and documented carriers with available configuration.

**Often needs review:** recipes, component defaults and slots, theme callbacks,
plugin transforms, runtime interpolation, framework behavior, and cross-file
composition. The adapter preserves unsupported or ambiguous source and reports
an explicit **residual** instead of guessing.

Use a dry run, migrate one feature, then check types, build output, browser
states, and SSR/hydration where applicable. Passing a fixture or playground
example proves that bounded input; it does not prove your entire project.
The [migration guide](/migrate/overview/) gives the workflow.

## Reading the deeper evidence

The tooling labels routes and their proof dimensions separately. Source-level
conversion, an installed build, and a browser comparison answer different
questions. Experimental routes can have strong evidence for particular cases
while retaining gaps elsewhere.

- [API matrix](/contributing/api-matrix/): what converts and what remains native.
- [Implementation status](/contributing/implementation-status/): shipped surfaces
  and their evidence boundaries.
- [Adapter contract](/contributing/adapter-contract/): capabilities, residuals, and
  validation contracts.

## Recorded proof scope

The checked-in real-repository report contains 35 reports, with 25 passed proof dimensions,
246 pending dimensions, and 10 pipeline-unpaired references. The adapter
reference proof has 31 small probes, 105 converted sites, 42 residuals, and
15 fully valid migrations. The package surface exposes 107 exported paths across five packages.

These counts describe the recorded inputs and proof dimensions; they do not
claim that every source application or adapter route is fully supported.
