---
title: Playground, studio & analyze
description: Live playground, the inspect dashboard and the analyze machinery.
sidebar:
  order: 5
---

## `pnpm playground` — live editor

A local in-browser editor: type `tw()` / `css()` / `cx()` expressions and see
the merged class string, fold verdict (full/partial/runtime) and
conflict-merge visualization instantly. Per-example routes, URL-hash sharing,
Monaco + Shiki. Styled with pandwind itself.

## `pnpm inspect` — pandwind studio

A local read-only dashboard over the [analyze](#analyze) machinery:

- **Coverage tab** — fold elimination, CSS budget, dead candidates,
  missing-css warnings with editor links.
- **Design-system tab** — theme vars, typed utility unions, bridge map,
  preset tokens.

Extend the CLI, not the app, when adding metrics.

## Analyze

The analysis machinery behind the studio lives in `packages/analyze`. It
parses real sources, evaluates calls through the same engines, and reports
coverage/budget facts — the same reports the missing-css gate and
`analyze --json` agent commands rely on (see
[codegen](/tooling/codegen/#agents-file)).
