---
title: cx() — merge everything, last-wins
description: Combine Pandwind output, ordinary class strings, and conditional styles at component boundaries.
sidebar:
  order: 4
---

Pandwind has two equal CSS projections for known style objects: `css(...)`
returns a mergeable declaration map, while `css.class(...)` returns a class
string. Choose the shape the host needs. Use `css.props(base, override)` when a
component is composing already-compiled style maps, such as an `xcss` prop.
Reach for `cx(...)` when the inputs are genuinely mixed or unknown — raw class
strings, compiled maps, variable carriers, falsey conditionals, or output from
more than one styling system.

Do not pass `css.class(...)` to `css.props(...)` to combine authored styles.
The class string no longer carries declaration information, so `css.props()`
can only concatenate it. Keep authored styles mergeable with `css(...)`, then
pass their maps through `css.props(base, override)`; use `css.class(...)` when
the host already wants one final class string.

This is the same kind of host boundary that makes StyleX's
[`stylex.props(...)`](https://stylexjs.com/docs/api/javascript/props/) useful:
the host projection receives compiled style values. Pandwind lets the caller
choose either the declaration-map `css(...)` path or the direct class-string
`css.class(...)` path before using `css.props(...)` where host props are useful.

`createCx({ css })` is the ordinary composition path: it merges carriers and
keeps opaque class strings without shipping a Tailwind conflict catalog. For
the uncommon case where arbitrary runtime Tailwind strings need exact
last-wins merging, pass the generated conflict metadata explicitly:

```ts
import { __pandwindConflictConfig } from "./tw.conflicts";

const conflictAwareCx = createCx({ css, ...__pandwindConflictConfig });
```

`createCx({ css, variants, conflicts, compose })` merges raw class strings,
`tw()` output and css atoms into one className with the same conflict
semantics as a single `tw()` call:

```ts
import { createCss } from "pandwind/css";
import { createCx } from "pandwind/cx";

import { examplePreset } from "@pandwind/example-preset";
import { tw } from "./tw";
import { __pandwindConflictConfig } from "./tw.conflicts";

const css = createCss(examplePreset);
const cx = createCx({ css, ...__pandwindConflictConfig });

const knownStyles = css({ color: "blue", padding: 4 }, { color: "navy" });
const knownProps = css.props(knownStyles);
const directClass = css.class({ color: "navy", padding: 4 });

cx(tw({ bg: "red-500" }), "px-4", knownStyles, directClass, "bg-blue-500");
// "px-4 bg-blue-500 <color atom>" — bg-red-500 lost to bg-blue-500
```

`tw.conflicts.ts` is the optional generated conflict catalog. The generated
`tw.ts` entry does not import it, and plain `createCx({ css })` does not import
it either. `tw.runtime.ts` contains the separate optional dynamic `tw()`
metadata, while `tw.build.ts` is tooling-only and is never a runtime import.
When `pandwindVite()` folds all calls to literals, all generated metadata is
removed from the browser bundle. Only the explicit conflict-aware form above
pays for the catalog needed to preserve arbitrary runtime conflict semantics.

For a smaller known-vocabulary catalog, pass a scope during generation:

```sh
pnpm exec pandwind-codemod tw generate src/tailwind.css src --conflicts bg,p,text
```

This keeps only those conflict prefixes. Use it only when arbitrary runtime
classes outside that list do not need last-wins merging; unsupported prefixes
stay opaque and are preserved.

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
same className. If the value is known to be a compiled CSS map, `css.props()`
keeps the declaration-map path. If the host only needs one class string, use
`css.class()`. `cx()` is for the cases where class strings and other carriers
really are mixed, so it must inspect class and atom metadata.

## Compile-time `cx()` — tree-shakeable for static apps

When a file imports both tw and cx, `pandwindVite` folds statically-evaluable
`cx(...)` calls into their final class string at build time — by running the
merge through a real `createCx(config)` built from the same generated
metadata, so build output is byte-identical to the runtime by construction.
The CSS inliner likewise folds literal `css(...)` calls to compiled maps and
literal `css.class(...)` calls to class strings:

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
