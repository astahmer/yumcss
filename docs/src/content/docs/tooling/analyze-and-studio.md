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

The editor's Pandwind declarations are not copied API typings. The playground
predev/prebuild hook runs `pnpm editor:types`, which resolves the workspace
package through `node_modules/pandwind`, emits its public declaration graph and
the transitive declaration dependencies it references, and mounts that graph
into Monaco's virtual filesystem. `pnpm editor:types:check`
regenerates into a temporary directory and fails if the checked-in graph is
stale. This keeps `tw`, `css`, `cx`, design presets, and option contracts tied
to the package exports; the small declarations for unavailable migration
libraries are clearly isolated browser shims, not claims about their installed
package APIs.

## Migration lab

Open `/migrate` in the playground to exercise the same registry-backed
migration use case used by the codemod. Choose any registered source adapter
and target adapter, edit the in-memory source document, and inspect the
rewritten code, target capabilities, canonical validation, dependencies, and
structured residuals.

The lab deliberately uses the browser entry point
`pandwind-codemod/swap/browser`: it shares the adapter catalog and semantic
migration pipeline with the CLI while excluding project filesystem access,
Tailwind's Node engine, and project-module loading. This makes the playground
a safe interactive preview, not a second migration implementation. Source
adapters that need project configuration still report that limitation as a
residual until a project-aware CLI migration supplies the configuration.

## `pnpm inspect` — pandwind studio

A local read-only dashboard over the [analyze](#analyze) machinery:

- **Coverage tab** — fold elimination, CSS budget, dead candidates,
  missing-css warnings, and class-to-rule drill-down with editor links.
- **Design-system tab** — theme vars, typed utility unions, bridge map,
  preset tokens, component scopes, and exportable DTCG/`@theme` artifacts.
- **Graph tab** — token alias graph, cycles, and provenance.
- **History and usage tabs** — persisted run snapshots/diffs and token/property
  usage analytics when the local inspector server is enabled.
- **Reports** — self-contained HTML/JSON/Markdown exports and CI-friendly
  `--github-annotations` output from the analyzer.

Extend the CLI, not the app, when adding metrics.

## Analyze

The analysis machinery behind the studio lives in `packages/analyze`. It
parses real sources, evaluates calls through the same engines, and reports
coverage/budget facts — the same reports the missing-css gate and
`analyze --json` agent commands rely on (see
[codegen](/tooling/codegen/#agents-file)).
