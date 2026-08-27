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

The same fixture verifies the CSS virtual module through Webpack with a
minimal host CSS loader. Webpack users still choose the loader/injection or
extraction policy; Pandwind supplies the generated stylesheet content.

The Vite example also has a browser-level HMR fixture in
`examples/css-example/test/hmr-e2e.mjs`. It edits a source declaration while a
Chromium page is open, observes the extracted CSS update, and asserts that the
page does not reload. This proves the client-visible virtual-module update in
addition to the lower-level module-graph tests.

There is also a packed-package consumer fixture in
`packages/pandwind/tests/packed-consumer.test.ts`. It builds a temporary Vite
consumer against `pnpm pack` output and resolves `pandwind/vite` and
`pandwind/preset` through the tarball's export map, catching missing shipped
files and package-resolution mistakes that workspace-source tests cannot.

## HMR and watch invalidation coverage

The repository tests the invalidation contract at each adapter boundary:

- Vite has dev-server/module-graph coverage for changed, added, deleted, and
  unchanged-mtime sources, plus cross-module constant invalidation.
- Rollup tests both the CSS extractor's `watchChange` scan invalidation and the
  inline transform's invalidation of changed cross-module constants.
- Webpack runs a real `compiler.watch()` rebuild after a source mutation and
  verifies that the emitted bundle changes.

These are bundler/plugin invalidation tests, not a promise that every host
framework's browser-side HMR or React Fast Refresh behavior is identical. The
host owns the dev server, framework runtime, and CSS asset delivery; those
framework-specific matrices belong in the corresponding integration fixtures.
