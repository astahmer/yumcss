---
title: Tooling workflows
description: Learn Pandwind in the Playground, inspect a project, and review migration output.
sidebar:
  order: 1
---

These tools answer different questions. You do not need to run all of them to
use Pandwind:

| You want to know…                              | Use…                         |
| ---------------------------------------------- | ---------------------------- |
| “What does this style object do?”              | the **Playground**           |
| “What did this project generate or use?”       | the **Inspector**            |
| “Can CI repeat the same checks?”               | the **analyzer CLI**         |
| “What will this migration change?”             | **Migration Preview**        |

## Playground: learn by changing code

Start it from the repository root:

```sh
pnpm run playground
```

The Playground is a safe browser sandbox for `tw()`, `css()`, `cx()`, design
`css()`, tokens, variants, dynamic values, and migrations. Choose a scenario,
edit the example, and press run. The right side shows:

- the live preview of the style you just wrote;
- the class string or runtime values that were produced;
- whether the call was folded at build time or remains dynamic; and
- the generated declarations and CSS when you want to inspect the details.

Collapsed panels are intentional. Start with the preview; open execution
evidence only when you are debugging or learning how a result was produced.

The Playground is not a replacement for your project's build. It uses a
browser-safe evaluator and deliberately does not load your host project's
filesystem, Tailwind Node pipeline, or framework plugins.

## Inspector: understand a real project

```sh
pnpm run inspect
```

The Inspector reads the repository and presents the useful results in three
views:

- **Tokens** — a catalog of colors, typography, spacing, radii, theme
  variables, typed utility unions, and bridge mappings. Its sections group the
  catalog, usage and cleanup, and focused token relationships.
- **Build report** — how many style calls were eliminated at build time, how much CSS
  was generated, where the stylesheet is large, and where CSS may be missing.
- **History** — compare snapshots saved by earlier Inspector runs.

The Usage & cleanup view groups tokens by catalog category and shows catalog
coverage, the hottest entries, and tokens not observed by the current scan.
Authored shorthand such as `$blue-600` is normalized against its catalog group
before it is compared with the preset, so an observed color is not reported as
an unused `colors/$blue-600` entry. “Not observed” remains a conservative scan
result. The cleanup assessment adds project-policy and reachability evidence,
shows why some results need review, and can generate a read-only removal
preview. Catalog coverage and cleanup counts use different scopes; a cleanup
classification is not deletion approval.

The header confidence badge explains how much to trust the current snapshot:
`extraction-backed` means structured extraction and resolved project policy are
available, `static source scan` means the view is based on source scanning
without a fully resolved cleanup policy, and `conservative` calls out dynamic,
runtime, unresolved-import, missing-CSS, or other coverage boundaries.

Usage also includes a focused WCAG checker for one selected text/background
palette pair. It reports the ratio and AA status without generating a noisy
all-colors matrix; source pairs that fail contrast remain listed separately.

The Relationships section opens on a connected token and shows only its direct
dependents and references. Select a neighboring token to follow its links. An
“unlinked raw variable” is only unreferenced inside this graph; check Usage &
cleanup for application-level scan evidence before deciding it is unused.

The Inspector is read-only. It is a lens over analyzer results, not another
compiler or a second source of truth.

Inspector views are deep-linkable: `#tokens`, `#tokens/usage`,
`#tokens/relationships`, `#build`, and `#history` select a view, while a token
catalog section can be addressed as `#tokens/sec-colors` or
`#tokens/sec-spacing`. The catalog and Build report filters are stored in the
`q` query parameter, so a link such as
`?q=blue#tokens/sec-colors` opens the same filtered view after a refresh.
Use `/` to focus the filter, **clear** to reset it, and the live match count
to see how much of the current view remains visible. Empty sections disappear
while filtering, and the section links track the section currently in view.

The Build report groups build-time folding separately from stylesheet budget and
shows per-file fold outcomes in a sortable, horizontally scrollable table. Its
token/literal percentages describe statically classified authored values;
dynamic expressions are reported separately and excluded from that percentage
denominator. The export menu includes JSON, Markdown, self-contained HTML,
and an optional per-file CSV report for CI or spreadsheet analysis.

### Repeat the analysis in CI

The analyzer CLI consumes the same project scanner and reports the same
coverage and budget evidence. Run the repository example with:

```sh
pnpm run analyze
```

For a consumer project, the published command can emit JSON for CI:

```sh
pnpm exec pandwind-analyze \
	--root . \
	--tw src/tw.ts \
	"src/**/*.{ts,tsx}"
```

When `src/tw.ts` comes from codegen, the analyzer also reads adjacent
`tw.runtime.ts` and `tw.build.ts` artifacts; the build-only catalog is never
treated as a browser runtime dependency.

Use it to track:

- static versus runtime style calls;
- missing CSS candidates;
- generated CSS size and rule shape;
- authored CSS and theme imports;
- token usage and cleanup candidates; and
- migration or adapter coverage where configured.

The goal is not a wall of numbers. Use the human-readable output while
developing and `--json` when a CI job or editor needs structured data.

## Migration Preview: inspect a project before applying changes

Migration Preview opens a project-shaped, read-only migration workspace:

```sh
pnpm exec pandwind-migration-preview /path/to/project --no-open
```

Open the printed localhost URL. Choose a source adapter and a Pandwind target,
then inspect:

1. the source file the tool found;
2. the target code it would generate;
3. canonical CSS and generated files;
4. token/theme information; and
5. diagnostics for behavior that needs a human decision.

Edits in Migration Preview are overlays in memory. **Apply edit** re-evaluates the
overlay; it does not write the project. Use the CLI when you are ready to
produce a real diff:

```sh
pnpm exec pandwind-codemod migrate \
	--from=emotion \
	--to=css.class \
	--dry-run --diff --report \
	"src/**/*.{js,jsx,ts,tsx}"
```

Review the report before removing the old library. A migration can preserve
the visible style while still needing manual work for theme callbacks, slots,
framework props, runtime interpolation, or SSR behavior.

## What the labels mean

The tools separate evidence that is easy to confuse:

- **verified** means that the selected runtime or compiler check actually ran;
- **runtime** means the value is only known while the application runs;
- **unavailable** means this host or project did not provide that check; and
- **residual** means the source was kept because the target behavior was not
  proven equivalent.

That honesty is the point. A green browser sandbox result is useful feedback,
but it is not the same thing as a successful project build or SSR proof.

## A practical workflow

When learning:

```text
Playground → copy the style → typecheck your app → inspect generated CSS
```

When migrating:

```text
analyzer CLI → Migration Preview → codemod diff/report → typecheck/build/browser
```

When running CI:

```text
analyze --json → budget/missing-CSS gate → review residuals
```

For the detailed command flags, see [codegen](/tooling/codegen/),
[Vite plugins](/tooling/vite-plugins/), and [codemods](/tooling/codemod/).
