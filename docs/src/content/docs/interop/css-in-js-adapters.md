---
title: CSS-in-JS adapter migrations
description: Safely move CSS-in-JS styles through pandwind's semantic adapter boundary.
sidebar:
  order: 2
---

pandwind's codemod treats the semantic style program as the pivot boundary. A
source adapter detects a library, parses its declarations and rule structure,
and emits a target adapter without making the target understand the source
library.

## Migrate a project

Run a dry migration first. The external adapter path does not require generated
pandwind metadata:

```sh
pandwind-codemod swap \
  --from=emotion \
  --to=css.class \
  --diff --report \
  "src/**/*.{ts,tsx}"
```

The first adapter wave supports `emotion`, `styled-components`,
`vanilla-extract`, `stitches`, and `pandwind`. `--to=css.class` is the
pandwind target spelling; external targets can be selected directly too:

```sh
pandwind-codemod swap --from=styled-components --to=emotion --write "src/**/*.tsx"
```

With `--from=auto`, the CLI uses adapter detection evidence from imports and
known authoring calls. Pass `--meta` only for the existing pandwind/Tailwind
swap path or other migrations that need generated project metadata.

## Safety and residuals

Safe mode is the default. It rewrites a call only when the target capability
contract and parser prove that the complete call is representable. Dynamic
interpolations, unsupported at-rules, computed keys, and parse failures stay in
place with a `pandwind:migrate-skip` marker and a machine-readable residual in
the adapter result.

The `--report` output is a migration worklist: it shows converted and skipped
sites, residual counts, and capability blockers. Use `--diff` before `--write`;
partial mode is an adapter API option for controlled tooling, not the CLI's
default safety policy.

## Runtime and host boundary

The runtime side uses `RuntimeSemanticRule` for ordered style, global, keyframe,
font-face, layer, supports, and custom-property rules. A `RuntimeSheet` can
collect CSS during SSR, hydrate it in a browser, and mount one deduplicated
`<style>` element. React, Preact, Solid, Vue, Svelte, and Astro bindings are
renderer-neutral host adapters, so migration output does not force a framework
dependency into the semantic core.
