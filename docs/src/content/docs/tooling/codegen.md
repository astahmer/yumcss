---
title: Codegen — commands & flags
description: pandwind-tw generate / scan / prune and the analyze CLI, with every flag.
sidebar:
  order: 1
---

These are published package binaries and are deterministic: identical inputs
produce byte-identical outputs. The examples use `pnpm`, but any package
manager's equivalent executable command works.

## `pandwind-tw generate` — typed runtime from your tailwind.css

```
pnpm exec pandwind-tw generate <css-entry> <out-dir> [--tokens <module>] [--agents]
                         [--bridge] [--bridge-file <path>]
                         [--preset-import <module>] [--preset-export <name>]
```

Positionals default to `src/tailwind.css` and `src`. Loads the CSS through
Tailwind's own design system (`@tailwindcss/node`) and writes:

- `<out-dir>/types.d.ts` — one key per utility, literal value unions
  (including opacity modifiers), recursive variant nesting, `(string & {})`
  escape hatch.
- `<out-dir>/tw.ts` — the typed `tw` instance wired with variants, the
  conflict map and composing utilities; marked `@__PURE__`.
- With `--tokens <module-path>` — also emits `pandwind-theme.css` (the DTCG →
  Tailwind v4 `@theme` bridge) and injects token-derived values into the
  generated unions. Accepts a bare groups object, `{ tokens }`, or any export
  carrying a `.tokens` field (a full preset works).
- With `--bridge` — additionally writes `bridge.ts` and refreshes the bridge
  section of `pandwind.interop.json`, using the configured preset. `--bridge`
  can be combined with `--bridge-file`, `--preset-import`, and
  `--preset-export`.
- With `--agents` — additionally writes `pandwind.agents.json`, the
  machine-readable capability file: every utility key with its literal value
  union (capped, with counts), variant set, conflict families, compose list,
  theme scopes, semantic tokens, plus the verify commands an agent runs
  (`typecheck`, `analyze --json`, the missing-css gate).

## `pandwind-tw scan` — safelist from real call sites

```
pnpm exec pandwind-tw scan [tw-entry] [src-dir] [out-file]
```

Defaults: `src/tw.ts src src/pandwind.safelist.ts`. Statically evaluates
every `tw({ ... })` call through the same runtime. The out-file extension
selects the mode:

- `.ts` → `export const pandwindSafelist = [...] as const`
- `.css` → Tailwind v4 `@source inline("...")` directives (import from
  `tailwind.css`; no generated JS lands in your source tree)

## `pandwind-tw prune` — drop unused theme variables

```
pnpm exec pandwind-tw prune [theme-css] [tw-entry] [src-dir]
```

Defaults: `src/pandwind-theme.css src/tw.ts src`. Re-compiles the scanned
classes through the real engine and keeps only the `@theme` variables the
compiled CSS actually references. Opt-in; breaks dynamic token access; run
after `pandwind-tw generate` whenever sources change.

## `analyze` — coverage & budget reports

```
pnpm exec pandwind-analyze [globs...] [--tw <generated-tw.ts>] [--json] [--root <dir>] [--css] [--constants <path>] [--github-annotations]
```

- `--tw <path>` — generated tw module (default `src/tw.ts` resolved against
  `--root`).
- `--json` — JSON output tagged with schema `pandwind.analyze/2`. In addition
  to fold coverage, it includes `authoredCss` explicit web stylesheet imports,
  `cssSources` call-site provenance and
  `cssDiagnostics` with source positions, reasons, and suggestions for calls
  the CSS extractor could not handle.
- `--css` — CSS budget lane: compiles the scanned `tw()` surface through the
  real engine.
- `--constants <path>` — JSON file of imported constants
  (`Record<string, string>`) so cross-module constants fold.
- `--github-annotations` — emit GitHub annotations.
- Default patterns when none given: `src/**/*.{ts,tsx}`.

The studio (`nub run inspect`) renders these same reports read-only — extend the
CLI, not the app.
