---
title: Multi-bundler support (unplugin)
description: The same build-time folding under rollup, webpack, rspack, esbuild, rolldown and more.
sidebar:
  order: 3
---

The vite plugins are also published as
[unplugin](https://github.com/unjs/unplugin) adapters, so the same build-time
folding works under rollup, webpack, rspack, esbuild, rolldown and more:

```ts
// rollup.config.mjs
import { pandwindRollup, pandwindRollupCss } from "pandwind/unplugin";

export default {
	plugins: [pandwindRollup(), pandwindRollupCss(examplePreset)],
};
```

- `pandwindUnplugin` / `pandwindUnpluginCss` are the generic factories (with
  `.vite`, `.rollup`, `.webpack`, … slices).
- `pandwindRollup(Css)` and `pandwindWebpack(Css)` are ready-made aliases.
- Under vite prefer `pandwindVite` / `pandwindCssVite` — identical behavior,
  plus native module-graph config resolution.
- Generic adapters resolve the generated tw module from relative imports on
  the filesystem; bare/aliased tw imports are a vite-only capability.
- Cache invalidation uses unplugin's `watchChange` (cross-bundler) with vite
  `handleHotUpdate` for immediate dev re-requests.
