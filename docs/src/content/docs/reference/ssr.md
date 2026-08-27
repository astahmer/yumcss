---
title: SSR, hydration, and framework matrix
description: What pandwind guarantees on the server and which bundler integrations are proven.
sidebar:
  order: 6
---

## Server rendering

The dynamic CSS contract is server-safe: `css.vars()` returns a plain
`{ class, style }` object. Serialize those values into the element rendered by
your host framework and pass the same values to the client during hydration.
pandwind does not touch `window`, `document`, or a global style injector while
creating classes or variable values.

The build-time stylesheet generator is also idempotent. Repeated collection of
the same static calls produces one rule per identity, which is safe when a
server render is retried or a stream is rendered in chunks.

The runtime stylesheet extraction/hydration adapter is not shipped yet. For
now, static rules belong in the generated CSS entry, while dynamic values use
the inline custom properties returned by `css.vars()`.

## Integration matrix

| Host/integration                             | Static extraction                                     | Dynamic values        | Proof level                                                            |
| -------------------------------------------- | ----------------------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| Vite                                         | Yes                                                   | `css.vars()` contract | Real Vite integration and browser example                              |
| Rollup via unplugin                          | Yes                                                   | `css.vars()` contract | Real Rollup build and Chromium fixture                                 |
| Webpack via unplugin                         | Yes                                                   | `css.vars()` contract | Real production, CSS virtual-module, and watch-rebuild fixtures        |
| Rspack/esbuild/rolldown via unplugin         | Shared adapter path                                   | `css.vars()` contract | Generic adapter contract; host-specific fixtures remain future work    |
| React RSC                                    | Use generated CSS and serializable `css.vars()` props | Host-owned            | Guidance only; no RSC adapter is shipped                               |
| Native/OpenTUI                               | Separate backend                                      | Backend-specific      | No DOM insertion or browser hydration implied                          |
