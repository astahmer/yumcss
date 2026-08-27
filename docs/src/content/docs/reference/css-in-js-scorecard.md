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

| Capability              | Status      | Current contract                                                                                                  |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Typed general CSS       | Static      | `createCss(preset)` is preset-bound and typed for ordinary CSS; `createDesignCss()` remains the constrained design lane. |
| Atomic CSS              | Static      | Literal declarations become deterministic, deduplicated atomic rules.                                             |
| Static extraction       | Static      | `pandwindCssVite()` and the unplugin adapters extract literal calls.                                              |
| Dynamic values          | Runtime     | `css.vars()` carries values through inline custom properties; it does not inject one rule per value.              |
| Theme scopes            | Static      | Theme and component token scopes are emitted as deterministic CSS blocks.                                         |
| Global rules            | Unsupported | No first-class authored global-rule primitive yet.                                                                |
| Keyframes and font-face | Unsupported | No first-class authored animation/font primitive yet.                                                             |
| SSR and hydration       | Partial     | `css.vars()` is serializable and server-safe; the runtime sheet can extract/hydrate, while framework host adapters remain host-owned. |
| Bundlers/frameworks     | Partial     | Vite and generic unplugin adapters exist; framework-specific proof is still being added.                          |
| Source provenance       | Partial     | Extracted rules and residuals carry source ranges/module metadata; end-to-end runtime and inspector links remain. |

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

The scorecard will be updated as each foundation revision lands. Recipes,
composition APIs, publishing, and release automation are deliberately outside
this wave.
