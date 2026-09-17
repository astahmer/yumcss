---
title: CSS-in-JS capability scorecard
description: The supported, runtime, partial, and unsupported parts of pandwind's CSS-in-JS contract.
sidebar:
  order: 5
---

pandwind's CSS-in-JS promise is intentionally precise. A capability is not
considered supported merely because a similar-looking object can be passed to
the engine: it must have defined static/runtime behavior, deterministic CSS
ordering, and a testable integration contract.

## Status vocabulary

| Status        | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `static`      | The compiler can determine and emit the result during the build.    |
| `runtime`     | The value or decision is intentionally resolved while the app runs. |
| `partial`     | A useful subset exists, but the complete contract is not proven.    |
| `unsupported` | The construct must remain in an escape hatch or be rejected.        |

## Current scorecard

| Capability                            | Status              | Current contract                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed general CSS                     | Static              | `createCss(preset)` is preset-bound and typed for ordinary CSS; `createDesignCss()` remains the constrained design lane.                                                                                                                                                                                               |
| Atomic CSS                            | Static              | Literal declarations become deterministic, deduplicated atomic rules.                                                                                                                                                                                                                                                  |
| Static extraction                     | Static              | `pandwindCssVite()` and the unplugin adapters extract literal calls.                                                                                                                                                                                                                                                   |
| Dynamic values                        | Runtime             | `css.vars()` and `css.input()` carry values through inline custom properties; build extraction emits stable structural rules, while `createRuntimeCss()` can register them when no build entry exists.                                                                                                                 |
| Theme scopes                          | Static              | Theme and component token scopes are emitted as deterministic CSS blocks.                                                                                                                                                                                                                                              |
| Global rules                          | Runtime             | `RuntimeSemanticRule` registers ordered global selectors and preserves them through extraction and hydration.                                                                                                                                                                                                          |
| Component-local keyframes             | Static plus runtime | `css.keyframes({ ... })` folds a literal step body to a deterministic name at build time, emits one `@keyframes` rule into the Pandwind stylesheet, and drops the body from the browser bundle; a body the extractor cannot prove literal stays on the runtime call and is reported as an unsupported construct.       |
| Font-face, layers, supports, property | Runtime             | `@font-face`, layer, supports, and property rule nodes serialize through the runtime sheet.                                                                                                                                                                                                                            |
| SSR and hydration                     | Runtime             | Runtime snapshots are serializable, hydrate without duplicate rules, and are covered by a concrete mounted-sheet fixture.                                                                                                                                                                                              |
| Bundlers/frameworks                   | Partial             | Vite/unplugin plus renderer-neutral React, Preact, Solid, Vue, Svelte, and Astro host compiler seams are covered; React-family and native-markup stack folding have fixtures, while full framework AST ownership stays host-owned.                                                                                     |
| Source provenance                     | Static              | Extracted rules and residuals carry source ranges/module metadata, emitted rule identities, and inspector editor links.                                                                                                                                                                                                |
| External adapters                     | Static/host         | Versioned v3 adapters cover pandwind, Chakra UI, MUI, Mantine, Emotion, styled-components, vanilla-extract, Stitches, Linaria, JSS, Fela, Goober, Aphrodite, Style9, Treat, Compiled, StyleX, React Strict DOM, Solid/Vue styled systems, Bamboo, and Next-yak with safe routing, host rewrites, and residual reports. |
| Recipes and host syntax               | Static              | Recipe/slot resolution, six host contracts, and versioned framework-native compiler hooks are covered.                                                                                                                                                                                                                 |
| Authored CSS imports                  | Partial             | Explicit web CSS imports remain a supported escape hatch and are visible to analyzer/extractor diagnostics; first-class TypeScript primitives use the semantic runtime path.                                                                                                                                           |

The scorecard is a product contract, not a promise that every style should be
forced through pandwind. Unsupported constructs remain explicit CSS or use a
documented escape hatch until an equivalent behavior is proven.

## Measurement gates

Every capability promotion must preserve:

- runtime-size budgets and regression snapshots;
- deterministic class names, rule ordering, and deduplication;
- browser-visible output for representative conditions;
- type-level positive and negative cases;
- actionable diagnostics for skipped or unsupported constructs.

The pivot completion wave is implemented. Publishing is gated by
`pnpm run release:check` and `pnpm run release:smoke`; actual registry publication
remains an operator action requiring credentials and a release changeset.
