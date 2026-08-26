---
name: pandwind-codemod
description: Migrate an app onto pandwind using packages/codemod. Use when converting raw Tailwind className strings, styled-components, stylex or panda-panda code to pandwind tw()/css()/cx(), or when auditing how much of a codebase is migratable (--to=keep analysis).
---

# pandwind-codemod

## Rules

- Codegen first: the codemod is driven by **generated metadata** (`types.d.ts`,
  `tw.ts`, `bridge.ts`). Run `pnpm tw:codegen && pnpm tw:bridge && pnpm
tw:scan` before migrating, and pass `--meta=<dir>` pointing at the dir that
  holds those files.
- Dry-run is the default. Always review with `--diff` before `--write`.
- Never chase 100% conversion. Arbitrary values, important modifiers,
  interpolated templates and unknown tokens stay verbatim on purpose (wrapped
  in `cx(...)` where needed) rather than guessing.
- The codemod never invents imports for your app's `css` factory — a file
  needs an existing pandwind `css()` binding for `--from=panda|stylex|styled-components`
  or `--to=css`.
- Respect opt-outs: `// pandwind:migrate-skip` above a call site excludes it.
- Re-running must report 0 changes (idempotent). If it doesn't, stop and fix.

## Standard flow

1. Ensure generated metadata is fresh (`--meta=<dir>`).
2. Audit scope: `codemod "src/**/*.{ts,tsx}" --to=keep` — per-file mappable vs
   verbatim counts, zero edits.
3. Convert merge helpers first: `--to=cx` replaces clsx/classnames/classcat/
   tailwind-merge (including the common `cn = (...a) => twMerge(clsx(a))`
   wrapper).
4. Convert strings: `--to=tw --diff`, review, then `--write`.
5. Optional source-library passes: `--from=styled-components` /
   `stylex` / `panda` (repeatable or comma-separated), each followed by
   typecheck.
6. After migration: rerun `tw:scan`, typecheck, and spot-check that folded
   output compiles (build once).

## Flag reference

- `--to=tw|css|cx|keep` — target API; `keep` (default) = analysis only.
- `--from=<lib>` — source-library detectors (`styled-components`, `stylex`,
  `panda`; comma-separated), off by default; run before the `--to` pass.
- `--diff` — print exact diffs; `--write` — apply (without it, dry-run).
- `--report` — migration-completeness report after the pass.
- `--meta=<dir>` — codegen output dir (default: `apps/example/src`, resolved
  by ascending to the workspace root).
- `--skip-marker=<text>` — override the opt-out marker
  (default `pandwind:migrate-skip`).

## Useful docs

- `packages/codemod/README.md`
- `docs/src/content/docs/tooling/codemod.md`
- `docs/src/content/docs/getting-started.md` (codegen commands)
