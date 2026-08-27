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

The repository runs a real Rollup + Chromium fixture covering the shared
contract: extracted static atoms, `css.vars()` values and conditional rules,
and an explicitly imported authored stylesheet containing a global selector and
keyframes. The host bundler owns the authored stylesheet; the Pandwind CSS
plugin emits only the generated atomic stylesheet. See
`examples/css-example/test/rollup-e2e.ts` for the executable proof.

The Webpack adapter also has a real production-build smoke test in
`packages/pandwind/tests/unplugin-webpack.test.ts`. It verifies that the
generic transform folds a literal `tw()` call and removes the runtime call from
the emitted bundle. This is adapter proof, not a claim that every Webpack
framework integration is turnkey; framework loaders and CSS asset ownership
remain host configuration.
