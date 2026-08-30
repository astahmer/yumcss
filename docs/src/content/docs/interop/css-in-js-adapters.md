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

The built-in adapter set covers `emotion`, `styled-components`, `chakra-ui`, `mui`, `mantine`,
`vanilla-extract`, `stitches`, `linaria`, `jss`, `fela`, `goober`,
`aphrodite`, `style9`, `treat`, `compiled`, `stylex`, `solid-styled`,
`vue-styled`, `bamboo`, `next-yak`, and `pandwind`. Bamboo's object dialect
and Next-yak's extracted `css`/`styled` template and css-prop lanes share the
same semantic adapter contract. `--to=css.class` is the pandwind target
spelling; external targets can be selected directly too:

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

Adapters also declare the package modules they own. After a successful rewrite,
those source imports and source runtime bootstrap bindings are removed, while
target imports are consolidated. Component identity is part of the contract:
for example, a styled-components subject cannot be silently lowered to an
Emotion class factory in safe mode; it remains in place with a `components`
capability residual.

The `--report` output is a migration worklist: it shows converted and skipped
sites, residual counts, and capability blockers. Use `--diff` before `--write`;
partial mode is an adapter API option for controlled tooling, not the CLI's
default safety policy.

The benchmark acceptance corpus is pinned in `reference-repos.md` and
`plans/evidence/real-repository-migrations-v2.json`. It exercises the
`css-in-js-bench` Bamboo and Next-yak lanes plus the existing ecosystem
references. `vanilla`, `tailwind-merge`, and `cnfast` in that benchmark are
control/utility lanes, not CSS-in-JS source adapters, so they remain outside
the adapter registry. The report is schema `/3` and carries a typed
`promotion` object. `source-static` means the source excerpt converted and
canonicalized; it does not imply a full browser, SSR, dependency, or CSS-size
promotion. `runtime-pending`, `source-mismatch`, and `pipeline-unpaired` are
explicit non-promoted states with dimension-level reasons.

## Runtime and host boundary

The runtime side uses `RuntimeSemanticRule` for ordered style, global, keyframe,
font-face, layer, supports, and custom-property rules. A `RuntimeSheet` can
collect CSS during SSR, hydrate it in a browser, and mount one deduplicated
`<style>` element. React, Preact, Solid, Vue, Svelte, and Astro bindings are
renderer-neutral host adapters, so migration output does not force a framework
dependency into the semantic core.
