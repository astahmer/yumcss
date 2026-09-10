---
title: cx() — merge everything, last-wins
description: Combine Pandwind output, ordinary class strings, and conditional styles at component boundaries.
sidebar:
  order: 4
---

When a component gets a base style, a user override, and a conditional state,
compose them at the edge of the component. cx() keeps the last matching
declaration and preserves class strings it cannot understand.

`createCx({ css, variants, conflicts, compose })` merges raw class strings,
`tw()` output and css atoms into one className with the same conflict
semantics as a single `tw()` call:

```ts
import { createCss } from "pandwind/css";
import { createCx } from "pandwind/cx";

import { examplePreset } from "@pandwind/example-preset";
import { __pandwindConfig, tw } from "./tw";

const css = createCss(examplePreset);
const cx = createCx({ css, ...__pandwindConfig });

cx(tw({ bg: "red-500" }), "px-4", css.class({ color: "blue" }), "bg-blue-500");
// "px-4 bg-blue-500 <color atom>" — bg-red-500 lost to bg-blue-500
```

Tailwind classes are parsed against the generated conflict map (variant
scoped, compose-aware, last-wins per canonical CSS property — never a
hand-maintained twMerge config). css atoms resolve through the engine's atom
registry, so `tw({ text: "gray-900" })` and `css.class({ color: "red" })`
fight over the same `color` property and only one survives. Anything
unresolvable is kept verbatim, deduplicated by exact string only — when in
doubt, nothing is dropped.

Note: with the [tailwind adapter](/interop/tailwind-adapter/),
`css({ color: "$blue-500" })` and `tw({ text: "blue-500" })` produce the
_identical_ class string (`text-blue-500`), so Tailwind compiles the CSS
exactly once no matter how much of the app is written with each API. `cx()`
remains the merge layer for raw strings, tw utilities and css atoms in the
same className.

## Compile-time `cx()` — tree-shakeable for static apps

When a file imports both tw and cx, `pandwindVite` folds statically-evaluable
`cx(...)` calls into their final class string at build time — by running the
merge through a real `createCx(config)` built from the same generated
metadata, so build output is byte-identical to the runtime by construction:

```ts
// input
cx(tw({ px: "4", p: "6" }), cond && "hidden", "text-sm");
// output (cond === false literal)
("p-6 text-sm");
```

Supported arguments: string literals, expression-free templates, `false` /
`null` / `undefined`, nested arrays, and `&&` / `||` / `??` / ternaries over
statically-known operands. Anything referencing an identifier or interpolation
keeps the whole call at runtime. Apps whose calls are all-static can
tree-shake the cx runtime away entirely.
