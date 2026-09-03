---
title: Playground, studio & analyze
description: Live playground, the inspect dashboard and the analyze machinery.
sidebar:
  order: 5
---

## `nub run playground` — live editor

A local in-browser editor: type `tw()` / `css()` / `cx()` expressions and see
the merged class string, fold verdict (full/partial/runtime) and
conflict-merge visualization instantly. Per-example routes, URL-hash sharing,
Monaco + Shiki. Styled with pandwind itself.

The editor's Pandwind declarations are not copied API typings. The playground
predev/prebuild hook runs `nub run editor:types`, which resolves the workspace
package through `node_modules/pandwind`, emits its public declaration graph and
the transitive declaration dependencies it references, and mounts that graph
into Monaco's virtual filesystem. `nub run editor:types:check`
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

## `pandwind-studio` — local codebase Studio

Start a read-only Studio for an existing project:

```sh
pnpm exec pandwind-studio /path/to/project
```

Use `--no-open` when the URL should only be printed (for example in a test or
remote shell):

```sh
pnpm exec pandwind-studio . --no-open
```

The command binds to localhost and prints a per-session URL containing a
capability token. The browser never receives the project's module loader or
filesystem implementation. Source edits are virtual overlays: **Apply edit**
re-evaluates the overlay and does not write the project. Reopen the project to
explicitly discard overlays and reload disk state.

The static Studio view provides:

- the shared source workspace and scanner, with supported documents and style
  call sites;
- registry-derived source/target adapter selectors, including the Pandwind
  `css.class`, `dss`, and `tw` target dialects;
- the rewritten target source, generated artifacts, byte metrics, semantic
  `StyleProgram` evidence, canonical source/target CSS, and residuals;
- discovered global and selector-scoped `@theme` variables, with the selected
  theme scope carried through evaluation; and
- a static component/style tree and an explicit host-preview state.

When a disk file changes underneath an unsaved Studio overlay, the overlay is
kept and a conflict is shown. This fails closed: the Studio does not silently
choose disk over the user's edit. A real host preview is an optional adapter;
projects without one remain in static mode.

The Studio uses the same `StyleMigrationUseCase` and adapter registry as the
codemod. It is therefore a feedback surface for the migration, not a second
parser or a browser-side implementation of every ecosystem.

## `nub run inspect` — analyzer dashboard

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

CSS discovery follows authored `@import` edges transitively, including scoped
package exports such as `@acme/theme/tailwind.css`. Reachable `@theme`
variables are included in the design-system view; selector-scoped custom
properties are retained as scope entries instead of being flattened into the
root theme. The exported stylesheet preserves those selectors, so inspecting
an external dark, brand, or component theme does not change its cascade.

The repository also ships a reusable PR-comment workflow at
`.github/workflows/analyze-comment.yml`. Consumers call it with
`astahmer/pandwind/.github/workflows/analyze-comment.yml@main`, provide their
`app-dir` and file `patterns`, and optionally pin `pandwind-version`. It runs
the published analyzer against HEAD and the base checkout, then updates one
marker-keyed comment with fold coverage, missing CSS, and CSS budget deltas.

Extend the CLI, not the app, when adding metrics.

## Analyze

The analysis machinery behind the studio lives in `packages/analyze`. It
parses real sources, evaluates calls through the same engines, and reports
coverage/budget facts — the same reports the missing-css gate and
`analyze --json` agent commands rely on (see
[codegen](/tooling/codegen/#agents-file)).
