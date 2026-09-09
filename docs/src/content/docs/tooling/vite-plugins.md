---
title: Vite plugins
description: pandwindVite() folds tw()/cx() at build time; pandwindCssVite() extracts css() atoms into a generated stylesheet.
sidebar:
  order: 2
---

Two vite plugins do the build-time work. They run _before_ Tailwind's scanner
so folded output is found naturally.

## `pandwindVite()` — tw/cx folding

Statically inlines literal `tw({ ... })` calls with literal arguments into
plain class strings before Tailwind's scanner sees them:

- the runtime cost becomes zero for static calls;
- the runtime, conflict map and variant metadata tree-shake out of the bundle
  (the generated `tw.ts` is marked `@__PURE__`);
- an optional generated `bridge.ts` is not pulled into the bundle unless the
  project explicitly imports its `twAdapter` as a Tailwind class strategy;
- dynamic calls keep working through the runtime;
- conflict merging happens at compile time too, so bundled class strings are
  already conflict-free;
- `cx(...)` calls over statically-known operands fold to their final string —
  byte-identical to the runtime merge by construction (proven differentially
  in `tests/vite-cx-inline.test.ts`).

```ts
import { pandwindVite } from "pandwind/vite";

plugins: [pandwindVite({ preset })];
```

## `pandwindCssVite()` — css() extraction

Scans source files for literal `css(...)` / `css.class(...)` calls, resolves
them through the design layer, rewrites the statically representable calls to
their final class carriers, and serves the deduped stylesheet as a virtual
module. This means the `createCss` runtime is not shipped when a module only
contains static calls. Dynamic values and unsupported helpers stay on the
runtime fallback path:

```ts
import { pandwindCssVite } from "pandwind/vite";

plugins: [pandwindCssVite(examplePreset)];
```

```ts
// main.tsx
import "pandwind:css";
```

Dynamic `css.class()` values can also be rewritten at the JSX host boundary,
but this is opt-in because it changes a `className` attribute into a
`className`/`style` props spread:

```ts
pandwindCssVite(examplePreset, { transformDynamicClassName: true });
```

With the option enabled in the default or a sheet-backed class-name mode, this
source:

```tsx
<button className={css.class({ color: props.color, padding: 8 })} />
```

becomes the equivalent host carrier:

```tsx
<button {...css.props(css.vars({ color: props.color }), "<static-class>")} />
```

The static declarations are compiled at build time; only dynamic declarations
use `css.vars()`. A direct `className` rewrite is limited to a simple host with
no existing `style` or JSX spread prop. Use a relaxed or untyped CSS binding if
the raw dynamic value is intentionally outside a strict preset's authored type.

The same static/dynamic partition also applies by default to mixed callable JSX
spreads:

```tsx
<div {...css({ color: "red", backgroundColor: shade, padding: 8 })} />
```

becomes:

```tsx
<div {...css.props(css.vars({ backgroundColor: shade }), "<static-class>")} />
```

Both rewrites only split flat scalar declarations. Nested conditions, spreads,
unsupported value expressions, and static/dynamic collisions keep the
conservative runtime carrier instead of being partially reordered or dropped.

## Per-route CSS splitting (opt-in)

```ts
pandwindCssVite(preset, {
	splitByRoute: [{ match: /\/routes\/admin\//, name: "admin" }],
});
```

Route-exclusive atoms are served from `pandwind:css?route=<name>` while shared
atoms and unmatched files stay in the global sheet; a virtual
`pandwind:css-manifest` module exports the route -> id map. Default remains
one global stylesheet.

## Critical-CSS inlining (opt-in)

Add `html` paths to your routes and `inlineCritical: true`: at build time each
entry's `<head>` gets the route's full stylesheet (common + exclusive chunks)
inlined as a marked `<style>` tag, so first paint needs zero stylesheet
requests. Capped per route (64 KB default) and skipped loudly on overflow; dev
mode untouched. Drop the matching `<link>` for fully-covered routes to avoid
duplicate delivery.
