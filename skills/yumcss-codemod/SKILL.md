---
name: yumcss-codemod
description: Migrate styling code onto YumCSS with packages/codemod. Use when converting Tailwind, Panda, StyleX, CSS-in-JS, or component-system code to YumCSS APIs, previewing residuals, or extending the registered adapter pipeline.
---

# yumcss-codemod

## Rules

- Choose the route first. Tailwind utility migrations and metadata-dependent
  external routes may need generated `types.d.ts`, `tw.ts`, `bridge.ts`, and
  `yumcss.interop.json`; project-owned source adapters can load their own
  official config or bootstrap target support. Do not generate Tailwind files
  for a native CSS/design route without a reason.
- Migrations write changes by default. Use `--dry-run --diff --report` for the
  first pass; remove `--dry-run` only after reviewing the result. There is no
  separate `--write` flag.
- Never chase 100% conversion. Arbitrary values, important modifiers,
  interpolated templates and unknown tokens stay verbatim on purpose (wrapped
  in `cx(...)` where needed) rather than guessing.
- Review generated imports and target modules as part of the diff. Do not
  invent an application-local `css` factory or pretend a source-library import
  is a YumCSS binding; let the selected target adapter or project bootstrap
  own that rewrite.
- Respect opt-outs: `// yumcss:migrate-skip` above a call site excludes it.
- Re-running must report 0 changes (idempotent). If it doesn't, stop and fix.

## Standard flow

1. Identify the source adapter, target API, project config, and package
   boundary. For a Tailwind-dependent route, generate metadata and pass its
   directory with `--meta=<dir>`; run `tw scan` only when dynamic utility
   candidates need it.
2. Preview the exact route with `--dry-run --diff --report`. Use the report and
   residuals as the migration audit; `--to=keep` is not a current CLI target.
3. Preserve and review existing merge helpers while the target binding is being
   established. The migration target should use YumCSS `cx()` for composing
   strings, atoms, and runtime carriers; there is no standalone `--to=cx`
   target in the current CLI.
4. Convert utility strings with `--to=yumcss-tw` (alias `tw`) or style
   objects with `--to=yumcss-css` (alias `css.class`), review, then run the
   write pass without `--dry-run`.
5. Run source-library passes such as `--from=styled-components`, `stylex`, or
   `panda` through the registered adapter route; follow each meaningful batch
   with a typecheck.
6. After migration, rerun the Tailwind scan only for the Tailwind lane, then
   typecheck, lint, tests, and one production build. Recheck browser/SSR paths
   when the source had host or runtime semantics.

## Flag reference

- `--to=yumcss-tw|yumcss-css|yumcss-dss` — the main YumCSS target
  aliases; `tw`, `css.class`, and `dss` are accepted dialect spellings. The
  other registered targets are visible through the adapter registry.
- `--from=<adapter>` — source adapter or `auto`; built-ins include Tailwind,
  Panda, StyleX, Emotion, styled-components, vanilla-extract, Stitches,
  Chakra, MUI, Mantine, Tokenami, UnoCSS, CSS Modules, Sass, Less, and more.
- `--dry-run` — preview without writing; `--diff` — print exact diffs.
- `--report` / `--report-format=json` — emit migration completeness evidence.
- `--safe` / `--partial` — require proven capabilities or explicitly allow a
  partial target; they cannot be combined.
- `--meta=<dir>` — generated YumCSS metadata directory for routes that need
  it; in this workspace the flat-route fallback is `examples/example/src`.
- `--out=<dir>` — output directory for project-owned migrations such as Panda.
- `--skip-marker=<text>` — override the opt-out marker
  (default `yumcss:migrate-skip`).
- `--token-refs`, `--token-format`, `--engine`, `--tokenize`, `--sort`, and
  `--dedup` — opt into token spelling, engine fallback, or source shaping; use
  only when the target project's contract and review plan call for them.

## Useful docs

- `packages/codemod/README.md`
- `docs/src/content/docs/tooling/codemod.md`
- `docs/src/content/docs/guides/migrations.md`
- `docs/src/content/docs/getting-started.md` (codegen commands)
