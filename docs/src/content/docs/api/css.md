---
title: css() — atomic CSS-in-JS
description: The panda+stylex engine — hashed atomic classes, tokens, property-priority merging, variant conditions.
sidebar:
  order: 2
---

> **Lane 2 of 3 — when to use this:** you want runtime-compiled atomic CSS
> with design tokens and priority merging, without going through Tailwind.
> Pick [tw()](/api/tw/) instead for typed Tailwind classes; pick
> [design css()](/api/design-css/) if you want the ~30-prop Figma vocabulary
> on top of this same engine. This page is the engine underneath both.

`createCss(preset)` returns a typed `css()` that flattens a style object into
hashed atomic classes, with design tokens, property-priority merging, variant
conditions and a `$input` escape hatch for dynamic values. `createCss()` remains
available as an intentionally loose convenience form.

```ts
import { createCss } from "pandwind/css";
import { definePreset, defineTokens } from "pandwind/preset";

const css = createCss(
	definePreset(
		{ config: {} as StandardProperties, tokens: defineTokens({}) },
		{ strict: true, conditions: { base: "" }, properties: { $all: true } },
	),
);
```

It is the "better stylex + panda" half of the repo: no runtime style
resolution, merged at object-build time via property priorities. See
`packages/pandwind/tests/css-*.test.ts` for the behavior contract.

## The surface at a glance — return shapes

All seven methods take the same style object and compile the same atoms;
they differ only in what they hand back:

| call                          | returns                                                                             | use when                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `css({ ... })`                | `{ color: "color__red" }` — one atom class **per declaration**, keyed by style prop | you need to address individual declarations afterwards (conditional composition, tooling, tests)                                                     |
| `css.class({ ... })`          | `"color__red"` — declarations fused into one class string                           | styling an element directly (the default choice; ~all app code)                                                                                      |
| `css.vars({ ... })`           | `{ class, style }` — classes plus inline custom properties                          | **runtime-dynamic values**: the value never enters a generated stylesheet (see below)                                                                |
| `css.raw({ ... })`            | `{ color: "red" }` — plain style object, untouched                                  | escape hatch _out_ of the atomic pipeline: inline-`style` targets (React Native, opentui), or forcing a call to stay invisible to the vite extractor |
| `css.props(...)`              | `{ className, style }` — spread onto an element                                     | combining compiled maps with `vars()` outputs in one shot                                                                                            |
| `css.group({ btn: { ... } })` | named map of compiled outputs                                                       | pre-compiling a set of related styles behind one name                                                                                                |
| `css.input(name)`             | `"input>$name"` marker                                                              | referencing a `$input` value inside a dynamic group                                                                                                  |

Notes that hold for all of them:

- Same compilation pipeline, same hashed classes, same stylesheet output —
  zero behavioral difference between `css()` and `css.class()` beyond the
  return shape. Both also accept multiple style objects and merge them
  last-wins (`css(a, b)`).
- `createDesignCss(preset)` mirrors this exact surface: it resolves the
  `$frame` / `$layout` / `$text` vocabulary first, then delegates to the same
  engine methods. Everything in the table applies unchanged.

### css() vs css.class() by example

```ts
// css.class — the 90% case: "I just want a className"
<h1 className={css.class({ $text: { size: "3xl", weight: "bold" } })} />

// mixing class sources through cx() — cx resolves css atoms via the
// registry, so conflicts merge properly instead of fighting in the DOM:
cx(tw({ bg: "red-500" }), "px-4", css.class({ color: "blue" }))
// -> "px-4 bg-blue-500 color__blue"  (bg-red-500 lost, last-wins)

// css — the per-declaration map, for when you need individual pieces later
const base = css({ color: "$gray-900", pad: [4, 8] });
className={cx(base.color, isActive && base.pad)} // drop just the padding part
```

With `css.class()` the declarations are fused into one string — you cannot
drop a single declaration out of it afterwards. That fusion is exactly what
you want for elements, and exactly what you don't want for composition.

### Dynamic values (`css.vars`) and the escape hatches

Literal values are extracted at build time; values only known at runtime go
through `css.vars()`. The value is delivered as an inline custom property
and never enters any generated stylesheet — no safelisting needed:

```tsx
const { class: widthClass, style } = css.vars({ w: value }); // value = runtime number/string
<div class={widthClass} style={style} />;
```

`cx()` understands `vars()` outputs natively (they carry their atoms via an
internal symbol), so they merge with everything else last-wins.

`css.vars()` is SSR-safe data, not a DOM side effect: both `class` and `style`
are ordinary serializable values that can be rendered on the server and
hydrated unchanged on the client. String values and finite numbers become
custom properties; booleans, empty strings, non-finite numbers, and other
unsupported runtime values are omitted. The generated toggle rule always falls
back from the most
specific condition to the base custom property, so transitions and other
browser CSS can consume the same property normally.

The general lane does not author global rules, keyframes, `@font-face`, cascade
layers, `@supports`, or `@property` definitions. Keep those browser-global
primitives in an explicit CSS entry imported by the app or package. See
[Authored CSS on the web](/reference/authored-css/) for the pattern and the
token-variable bridge. `analyze` and the inspector record those explicit CSS
imports, but do not scan arbitrary CSS and infer a Pandwind API from it.

Pandwind does not provide a recipe API. If you need variant selection, use an
external CVA-style package with the class strings returned by `css()` and
`cx()`; keep the variant map statically authored for extraction. See the
[authored CSS guide](/reference/authored-css/#external-variant-composition).

`css.raw()` is the opposite trade: it skips atom compilation entirely and
returns the style object as-is. Use it for targets whose components take
inline `style` objects instead of classes (React Native, opentui), or when
you explicitly want a call to stay invisible to `pandwindCssVite`. You lose
dedup/extraction but keep preset token resolution and typing.

## Static extraction (`pandwindCssVite`)

The css() classes are hashed deterministically; the stylesheet is generated
from the _same_ literal calls at build time, so nothing is accumulated at
runtime:

```ts
// vite.config.ts
import { pandwindCssVite } from "pandwind/vite";
import { examplePreset } from "./src/preset";

plugins: [pandwindCssVite(examplePreset)];
```

```ts
// main.tsx — the generated CSS is served as a virtual module
import "pandwind:css";
```

The plugin scans source files (like Tailwind's own scanner) for literal
`css(...)` calls, resolves them through the design layer and serves the
deduped CSS — tokens plus atomic rules. Dynamic calls keep working at runtime
but are not extracted (same constraint as dynamic class names in plain
Tailwind).

## Design css() — the Figma-inspector vocabulary

`dcss = createDesignCss(preset)` (the `dcss` name keeps design-lane instances
distinct from engine `css()` instances) returns the same `css()` surface, but
the style object uses the vocabulary designers already think in — borrowed from
the inspector panels of Figma, Framer and Sketch: ~30 props instead of ~500 CSS
properties, behind one function. See [Design css()](/api/design-css/).
