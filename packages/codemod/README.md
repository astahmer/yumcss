# pandwind-codemod

Migrate raw Tailwind authoring onto the pandwind APIs. Driven entirely by
your project's **generated metadata** (`types.d.ts`, `tw.ts`, `bridge.ts`) —
never hand-maintained tables.

```sh
# analysis only (default): reports what WOULD change
pnpm codemod "src/**/*.tsx" --to=tw

# preview exact diffs, then apply
pnpm codemod "src/**/*.tsx" --to=tw --diff --write
```

## Modes

| mode        | what it does                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--to=tw`   | static class strings → typed `tw({...})` objects (variants become nesting; overloaded utilities disambiguated via the generated conflict map — `text-gray-900` → `textColor`, `text-lg` → `textSize`). Unmappable tokens (arbitrary values, important modifiers, unknowns) stay verbatim via a wrapping `cx(...)` so nothing is lost. |
| `--to=cx`   | `clsx` / `classnames` / `classcat` / `tailwind-merge` imports and calls → pandwind `cx`. Collapses the common `const cn = (...a) => twMerge(clsx(a))` wrapper automatically.                                                                                                                                                          |
| `--to=css`  | bridge-mappable static strings → `css.class({...})` with **exact resolved declarations** from the preset-scoped bridge (requires an existing `css` binding in the file).                                                                                                                                                              |
| `--to=keep` | analysis only: per-file counts of mappable vs verbatim tokens, zero edits.                                                                                                                                                                                                                                                            |

## Safety rails

- dry-run by default; `--diff` shows changes; `--write` applies.
- idempotent — running twice reports 0 changes.
- opt-out marker per call site:
  ```ts
  // pandwind:migrate-skip
  <div className="p-4" />
  ```
- negative utilities and anything outside the generated metadata stay
  verbatim rather than guessing.

## Flags

`--meta=<dir>` — where the codegen outputs live (default `apps/example/src`).
`--skip-marker=<text>` — override the opt-out marker.
