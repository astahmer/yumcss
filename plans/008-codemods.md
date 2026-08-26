# Plan 008 — Codemods & authoring-migration tooling

Pandwind accepts plain Tailwind class strings, so migration is never
_forced_ — codemods exist to upgrade DX (typing, folding, design-token
autocomplete), not to fix breakage. Multiple target modes matter because
different call sites deserve different APIs.

## Codemod 1 — raw tailwind → pandwind (`pandwind-codemod migrate`)

Input: source files with `className="..."` / `className={...}` / clsx()
calls containing literal Tailwind utilities.
Output modes (flag `--to=`):

- `tw` — convert static strings to typed object form:
  `"px-4 text-gray-900 hover:bg-blue-500"` →
  `tw({ px: "4", textColor: "gray-900", hover: { backgroundColor: "blue-500" } })`.
  Uses the generated bridge/conflict map (inverse of the utility map) to map
  utilities back onto keys; sub-key partitioning decides `textColor` vs
  `textSize`. Anything un-mappable stays a plain string inside the same call.
- `cx` — multi-source expressions (`clsx(a && "...", cond ? x : y)`) become
  `cx(...)` calls, preserving conditions as runtime args so partial folding
  can kick in at build time.
- `css` — for style-object-friendly sites: convert groups of utilities whose
  bridge properties are representable into one `css({...})` call (opt-in per
  file; not all utilities have atomic equivalents).
- `keep` — leave strings, only add imports + wrap in tw() where trivially
  beneficial (default conservative mode).
  Safety rails: dry-run + unified diff output by default; idempotent (running
  twice = no-op); a comment marker `/* pandwind:migrate-skip */` escape hatch;
  per-file summary of converted/skipped counts.

## Codemod 2 — `clsx`/`classnames`/`tailwind-merge` → `cx`

Detect imports from clsx/classnames/classcat/tailwind-merge and rewrite call
shapes onto cx() (which subsumes concat+merge). Handles common wrappers:
`const cn = (...a) => twMerge(clsx(a))` → drop wrapper, import cx. Highest
real-world value; smallest surface.

## Codemod 3 — legacy CSS modules / styled-components → css()

Scoped to literal styles: `.module.css` classes with only mappable
declarations, or styled-components with no props interpolation, become
`css({...})` atoms. Interpolated/dynamic ones get flagged, not converted.

## Codemod ideas backlog (not yet scheduled)

- **Class-sorter**: canonical utility ordering (conflict-map-aware, not
  alphabetical) as oxfmt/prettier plugin or part of codemod output.
- **Variant hoisting**: `_hover: {...}` nesting ↔ `hover:` prefix rewriting
  both directions inside tw() objects.
- **Token swap**: raw hex colors → nearest preset token (`#3182ce` →
  `$blue-500`) using the token maps; flag near-misses instead of guessing.
- **Arbitrary-value extraction**: repeated `[width:37px]` arbitraries →
  preset/token proposal list printed for the user.
- **test/Storybook className literals** → shared cx() constants when
  identical strings appear N times (dedup pass).
- **Vue/Svelte adapters**: same core over different template syntaxes
  (attribute regexes differ; core mapping is shared).

## Codemod 1+2 Outcomes (2026-08-23)

- `packages/codemod` shipped: CLI (`pnpm codemod <globs> --to=… [--diff] [--write]
[--meta=<dir>]`) + library surface (`mapToken`/`transformSource`) for tests.
- Disambiguation is fully metadata-driven: `conflicts[prefix][value]` yields
  the compiled CSS properties; candidate keys scored by property-name overlap.
  No hand-written utility tables.
- Known conservative limits (by design): negative utilities and important
  modifiers stay verbatim; arbitrary values stay verbatim via a wrapping cx();
  cross-file css mode requires an existing `css` binding; template-literal
  classNames are never touched.

> **2026-08-26:** panda-css inbound migration landed via plan 024
> (`swap --from=panda`) — see plans/024-panda-inbound-codemod.md and
> plans/024-baseline-report.md.
