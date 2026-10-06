---
title: Codegen — commands & flags
description: yumcss-codemod code generation commands, with every flag.
sidebar:
  order: 1
---

These are published package binaries and are deterministic: identical inputs
produce byte-identical outputs. The examples use `pnpm`, but any package
manager's equivalent executable command works.

## `yumcss-codemod lib build` — publish extracted component-library rules

```sh
	pnpm exec yumcss-codemod lib build [root] [out-file] \
	[--include <glob>] [--css-source <module>] \
	[--preset-import <module>] [--preset-export <name>] \
	[--namespace <name>] [--cascade specificity|layers] \
	[--cascade-layer <name>] [--check]
```

The defaults are the current directory, `dist/yumcss.lib.json`, the
`yumcss/preset/default` export `defaultPreset`, and `css`/`design` import
sources.
Repeat `--include` for source globs and `--css-source` for custom CSS factory
module names. The command scans source with the shared workspace, compiles
literal `css()`/`css.class()` calls, includes structural rules for
`css.vars()`, preset-owned `web` CSS, and writes a deterministic
`yumcss.lib/1` artifact.

The artifact records used token declarations, stable rule identities and
priorities, source content hashes, and a compatibility fingerprint covering
the preset, compiler contract, namespace, cascade mode, cascade layer, and
default class strategy. Pass `--cascade-layer <name>` together with
`--cascade layers` when the published rules belong to a named layer. Expose
`yumcss.lib.json` from the library package and register its package name with
`yumcssExtractVite(css, { libraries: ["@acme/ui"] })`.
`--check` rebuilds in memory and fails when the packed artifact is missing or
stale. Invalid or incompatible artifacts fail closed; ordinary local source
extraction remains available when no library is registered.

This is a package distribution boundary, not a generated `styled-system`
package. It does not add shorthands, recipes, patterns, JSX factories, or a
static-CSS-only runtime.

## `yumcss-codemod css generate` — concrete types for large presets

```sh
pnpm exec yumcss-codemod css generate [root] [out-file] \
	[--preset-import <module>] [--preset-export <name>] \
	[--token-variable-names <hashed|authored>] [--check]
```

The defaults are the current directory, `src/css.generated.ts`, and a named
`preset` export from `./src/preset.ts`. The command loads the preset, flattens
its properties, conditions, token values, palette names, and dynamic-value
surface into a deterministic TypeScript facade, and writes an ordinary source
file:

```ts
import { css } from "./css.generated";

export const button = css.class({
	backgroundColor: "$blue-500",
	padding: 4,
});
```

The generated facade uses `createGeneratedCss` from `yumcss/css/generated`. It has the
same runtime and complete `css`, `class`, `vars`, `raw`, `props`, `group`,
`input`, and `keyframes` behavior as `createCss(preset)`; only the expensive
preset-derived type computation is replaced with concrete generated types. It
is therefore an opt-in typecheck optimization for large design systems, not a
new styling runtime or a zero-JavaScript mode. The generated source keeps
`firstThatWorks` in property unions and marks the factory call pure, so an
unused generated facade can disappear in a normal bundle. Pass
`--token-variable-names authored` when the runtime should use declared token
spellings for custom properties; the default remains `hashed`. `--check` verifies the file byte-for-byte
without writing it, so it can be added to CI after the preset build is
available.

Regenerate after changing the preset or upgrading YumCSS. Generated files
are source artifacts and should not be edited by hand.

## `yumcss-codemod tw generate` — typed runtime from your tailwind.css

```
pnpm exec yumcss-codemod tw generate <css-entry> <out-dir> [--tokens <module>] [--agents]
                         [--bridge] [--bridge-file <path>]
                         [--conflicts <all|none|utility,...>]
                         [--preset-import <module>] [--preset-export <name>]
```

Positionals default to `src/tailwind.css` and `src`. Loads the CSS through
Tailwind's own design system (`@tailwindcss/node`) and writes:

- `<out-dir>/types.d.ts` — one key per utility, literal value unions
  (including opacity modifiers), recursive variant nesting, `(string & {})`
  escape hatch.
- `<out-dir>/tw.ts` — the small typed `tw` runtime entry; marked `@__PURE__`.
- `<out-dir>/tw.runtime.ts` — optional variant, composition and token-remap
  metadata for applications that explicitly need dynamic Tailwind behavior.
  When conflict merging is enabled, it imports the separate
  `<out-dir>/tw.conflicts.ts` artifact. The generated `tw.ts` entry does not
  import either artifact.
- `<out-dir>/tw.conflicts.ts` — compact, lazily decoded conflict metadata for
  arbitrary runtime Tailwind class merging. It is only paid for when an app
  explicitly imports the generated conflict configuration.
- `<out-dir>/tw.build.ts` — build-only wildcard candidate metadata read by Vite
  and codemod tooling; runtime bindings never import it.
- With `--tokens <module-path>` — also emits `yumcss-theme.css` (the DTCG →
  Tailwind v4 `@theme` bridge) and injects token-derived values into the
  generated unions. Accepts a bare groups object, `{ tokens }`, or any export
  carrying a `.tokens` field (a full preset works).
- With `--bridge` — additionally writes the optional `bridge.ts` and refreshes
  the bridge section of `yumcss.interop.json`, using the configured preset.
  YumCSS does not import this file automatically. Its `twAdapter` becomes a
  runtime dependency only when the project explicitly selects Tailwind class
  output for `createDesignCss` or `yumcssExtractVite`; otherwise it remains
  build-time/migration metadata. `--bridge` can be combined with
  `--bridge-file`, `--preset-import`, and `--preset-export`.
- With `--conflicts <scope>` — controls the optional conflict catalog. The
  default is `all`; `none` disables conflict metadata, while a comma-separated
  list such as `bg,p,text` keeps only those utility prefixes. This does not
  change generated types, static extraction, or `tw.build.ts`. A narrowed
  catalog is safe only when every arbitrary runtime class that must merge is
  covered by the selected prefixes; unknown classes remain opaque instead of
  being guessed.
- With `--agents` — additionally writes `yumcss.agents.json`, the
  machine-readable capability file: every utility key with its literal value
  union (capped, with counts), variant set, conflict families, compose list,
  theme scopes, semantic tokens, plus the verify commands an agent runs
  (`typecheck`, `analyze --json`, the missing-css gate).

## `yumcss-codemod runtime generate` — specialized `createUnsafeCss` for non-Vite builds

```
pnpm exec yumcss-codemod runtime generate [out-file] \
  [--methods all|call|<method>[,<method>...]] [--check]
```

This writes a typed `createUnsafeCss` module for static bundlers that do not perform
YumCSS's Vite usage analysis. The default output is
`src/yumcss-runtime.ts`, and the default `all` selection preserves the full
unsafe CSS behavior. Use `--methods call` for the callable core only, or
select any comma-separated subset of `class`, `vars`, `raw`, `props`, `group`,
and `input`. `group` automatically includes its `vars` dependency.

The generated file intentionally exposes the unbound/unsafe lane and imports
only the selected runtime attachments through YumCSS's private runtime
entries. Use `createCss(preset)` from `yumcss/css` when preset-aware typing
and token resolution are required. It is version-tied generated output: do not edit it by hand, and
regenerate it after upgrading YumCSS. `--check` verifies that the file is
present and byte-for-byte current without writing it; add that command to CI.
Vite users already receive equivalent usage-aware virtual modules from
`yumcssExtractVite`, so this command is primarily for non-Vite/static builds.

## `yumcss-codemod runtime explain` — inspect Vite runtime pruning

```
pnpm exec yumcss-codemod runtime explain src/styles.ts \
  [--preset @yumcss/example-preset#examplePreset] [--json]
```

This reports which CSS factory methods, style keys, conditions, preset metadata,
and token entries the Vite runtime pruner can retain for a source module. An
`escaped` or `fallback-dynamic-shape` result identifies code that correctly
keeps the conservative runtime. Use `--preset` with the same preset configured
in `yumcssVite` to see projected token-group and entry counts; `--json` emits
the versioned `yumcss.runtime-explain/1` report for CI or bundle tooling.

For example, this source exposes a dynamic color but a literal spacing token:

```ts
const color = getColor();

css.class({
	color,
	padding: "2",
});
```

The report keeps the `color` token group conservatively, projects only
`spacing.2`, and records the `class` method plus the two property names. A
literal `color: "blue.100"` would project only that color entry. Bounded
expressions are narrowed too: `color: tone === "primary" ? "$blue-500" :
"$red-500"` keeps exactly those two candidates, including when the expression
is assigned to a top-level `const`. Calls, unbounded identifiers, unknown
dynamic spreads, and opaque `$raw` objects remain conservative; the latter reports
`fallback-dynamic-shape` and retains the full preset path. The command explains
one source module at a time; the Vite plugin is the authority that applies the
same analysis during a real bundle.

When that real bundle has a JSX host carrier with only flat scalar dynamic
values, the Vite rewrite can remove both `css.props()` and `css.vars()` from
the emitted JavaScript. It keeps the same structural var rules in the CSS
artifact and inlines only the value validation, normalization, and token
aliases required by that carrier. `lib build` remains a CSS distribution
boundary: it publishes the rules and token declarations, while the consuming
Vite build decides whether its JavaScript carrier can be lowered directly.

This report is complementary to `yumcss-codemod lib build`. `lib build`
publishes extracted CSS rules and used token declarations for a component
library; it does not carry consumer-specific JavaScript runtime usage. Build a
library's JavaScript through the Vite transform (or use `runtime generate` for
a static build), and register its `yumcss.lib.json` separately so the host
can consume the CSS artifact without rescanning the library source.

## `yumcss-codemod tw scan` — safelist from real call sites

```
pnpm exec yumcss-codemod tw scan [tw-entry] [src-dir] [out-file]
```

Defaults: `src/tw.ts src src/yumcss.safelist.css`. Statically evaluates
every `tw({ ... })` call through the same runtime and writes Tailwind v4
`@source inline("...")` directives for every design-system-verified class.
Import the generated file from `tailwind.css` so dynamic candidates get
compiled CSS; no generated JS lands in your source tree.

## `yumcss-codemod tw prune` — drop unused theme variables

```
pnpm exec yumcss-codemod tw prune [theme-css] [tw-entry] [src-dir]
```

Defaults: `src/yumcss-theme.css src/tw.ts src`. Re-compiles the scanned
classes through the real engine and keeps only the `@theme` variables the
compiled CSS actually references. Opt-in; breaks dynamic token access; run
after `yumcss-codemod tw generate` whenever sources change.

## `yumcss-codemod tw verify` — consumer freshness and size gate

```sh
pnpm exec yumcss-codemod tw verify . \
	--manifest src/yumcss.generated.json \
	--budget yumcss.generated-budget.json
```

This checks the hashes for every input and generated file recorded by the
manifest. The optional budget file uses schema `yumcss.generated-budget/1`
and maps generated paths to `maxRawBytes`, `maxGzipBytes`, and an optional
ownership tag. It is safe to run after formatting because the manifest can be
refreshed with `yumcss-codemod tw manifest src src/tailwind.css`. Add the
verify command to the consumer project's ordinary typecheck/build workflow so
stale generated declarations, runtime bindings, or bridge artifacts fail with
the exact path visible in the report.

## `analyze` — coverage & budget reports

```
pnpm exec yumcss-analyze [globs...] [--tw <generated-tw.ts>] [--json] [--root <dir>] [--css] [--constants <path>] [--github-annotations]
```

- `--tw <path>` — generated tw module (default `src/tw.ts` resolved against
  `--root`).
- `--json` — JSON output tagged with schema `yumcss.analyze/1`. In addition
  to fold coverage, it includes `authoredCss` explicit web stylesheet imports,
  `cssSources` call-site provenance and
  `cssDiagnostics` with source positions, reasons, and suggestions for calls
  the CSS extractor could not handle.
- `--css` — CSS budget lane: compiles the scanned `tw()` surface through the
  real engine.
- `--constants <path>` — JSON file of imported constants
  (`Record<string, string>`) so cross-module constants fold.
- `--github-annotations` — emit GitHub annotations.
- Default patterns when none given: `src/**/*`, filtered through the shared
  compiler source scanner. This includes TS, TSX, JS, JSX, and Vue files with
  script blocks; Svelte and Astro are not part of the compiler analysis lane.

The Inspector (`pnpm run inspect`) renders these same reports read-only — extend the
CLI, not the app.
