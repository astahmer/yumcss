---
title: SSR, hydration, and framework matrix
description: What yumcss guarantees on the server and which bundler integrations are proven.
sidebar:
  order: 6
---

## Server rendering

The dynamic CSS contract is server-safe: `css.vars()` returns a plain
`{ class, style }` object. Serialize those values into the element rendered by
your host framework and pass the same values to the client during hydration.
yumcss does not touch `window`, `document`, or a global style injector while
creating classes or variable values.

The build-time stylesheet generator is also idempotent. Repeated collection of
the same static calls produces one rule per identity, which is safe when a
server render is retried or a stream is rendered in chunks.

The runtime sheet primitive also supports deterministic registration,
snapshot extraction, hydration, and optional DOM insertion. The React
`renderToPipeableStream` fixture proves that a streamed server render can
register semantic rules once and hydrate the same snapshot without duplicates.
Static rules still belong in the generated CSS entry, while dynamic values can
use the inline custom properties returned by `css.vars()` or an adapter-owned
runtime sheet.

`createCss(preset)` is the normal choice when the application has a build-time
CSS entry: `yumcssExtractVite()` emits the stable rules for `css.vars()` and
`css.input()` while the rendered values remain serializable inline props.
`createRuntimeCss(preset)` is the explicit choice when the host must collect
atomic rules during rendering, has no generated CSS entry, or needs the
attached `RuntimeSheet` for SSR snapshot extraction and hydration.

## Integration matrix

| Host/integration                             | Static extraction                                     | Dynamic values        | Proof level                                                               |
| -------------------------------------------- | ----------------------------------------------------- | --------------------- | ------------------------------------------------------------------------- |
| Vite                                         | Yes                                                   | `css.vars()` contract | Real Vite integration and browser example                                 |
| Rollup via unplugin                          | Yes                                                   | `css.vars()` contract | Real Rollup build and Chromium fixture                                    |
| Webpack/Rspack/esbuild/rolldown via unplugin | Shared adapter path                                   | `css.vars()` contract | Adapter docs; add dedicated fixtures before claiming framework support    |
| React RSC / streaming                        | Use generated CSS and serializable `css.vars()` props | Host-owned            | `renderToPipeableStream` fixture covers stream output and sheet hydration |
| Webpack via unplugin                         | Yes                                                   | `css.vars()` contract | Real production, CSS virtual-module, and watch-rebuild fixtures           |
| Rspack/esbuild/rolldown via unplugin         | Shared adapter path                                   | `css.vars()` contract | Generic adapter contract; host-specific behavior remains host-owned       |
| Native/OpenTUI                               | Separate backend                                      | Backend-specific      | No DOM insertion or browser hydration implied                             |
