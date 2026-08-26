---
title: Codegen — commands & flags
description: tw:codegen / generate-bridge / collect (scan) / prune-theme and the analyze CLI, with every flag.
sidebar:
  order: 1
---

All commands run on source via `tsx` and are deterministic: identical inputs
produce byte-identical outputs.

## `tw:codegen` — typed runtime from your tailwind.css

```
tsx packages/pandwind/src/tw/generate-types.ts <css-entry> <out-dir> [--tokens <module>] [--agents]
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
- With `--agents` — additionally writes `pandwind.agents.json`, the
  machine-readable capability file: every utility key with its literal value
  union (capped, with counts), variant set, conflict families, compose list,
  theme scopes, semantic tokens, plus the verify commands an agent runs
  (`typecheck`, `analyze --json`, the missing-css gate).

## `tw:bridge` — the property→utility bridge

```
tsx packages/pandwind/src/tw/generate-bridge.ts <css-entry> <tw-file> <out-file> [preset-import] [preset-export]
```

Defaults: `src/tailwind.css src/tw.ts src/bridge.ts`, importing
`examplePreset` from `pandwind/preset`. Writes a module exporting `bridge`,
`variants`, and a ready-made `twAdapter` (`createTwAdapter` bound to the
preset). CLI-only — it executes on import.

## `tw:scan` — safelist from real call sites

```
tsx packages/pandwind/src/tw/collect.ts [tw-entry] [src-dir] [out-file]
```

Defaults: `src/tw.ts src src/pandwind.safelist.ts`. Statically evaluates
every `tw({ ... })` call through the same runtime. The out-file extension
selects the mode:

- `.ts` → `export const pandwindSafelist = [...] as const`
- `.css` → Tailwind v4 `@source inline("...")` directives (import from
  `tailwind.css`; no generated JS lands in your source tree)

## `tw:prune` — drop unused theme variables

```
tsx packages/pandwind/src/tw/prune-theme.ts [theme-css] [tw-entry] [src-dir]
```

Defaults: `src/pandwind-theme.css src/tw.ts src`. Re-compiles the scanned
classes through the real engine and keeps only the `@theme` variables the
compiled CSS actually references. Opt-in; breaks dynamic token access; run
after `tw:codegen` whenever sources change.

## `analyze` — coverage & budget reports

```
pnpm analyze [globs...] [--tw <generated-tw.ts>] [--json] [--root <dir>] [--css] [--constants <path>] [--github-annotations]
```

- `--tw <path>` — generated tw module (default `src/tw.ts` resolved against
  `--root`).
- `--json` — JSON output tagged with schema `pandwind.analyze/1`.
- `--css` — CSS budget lane: compiles the scanned `tw()` surface through the
  real engine.
- `--constants <path>` — JSON file of imported constants
  (`Record<string, string>`) so cross-module constants fold.
- `--github-annotations` — emit GitHub annotations.
- Default patterns when none given: `src/**/*.{ts,tsx}`.

The studio (`pnpm inspect`) renders these same reports read-only — extend the
CLI, not the app.
