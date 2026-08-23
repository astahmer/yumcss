# pandwind-codemod

Migrate raw Tailwind authoring onto the pandwind APIs. Driven entirely by
your project's **generated metadata** (`types.d.ts`, `tw.ts`, `bridge.ts`) —
never hand-maintained tables.

```sh
# analysis only (default): reports what WOULD change
pnpm codemod "src/**/*.tsx" --to=tw

# preview exact diffs, then apply
pnpm codemod "src/**/*.tsx" --to=tw --diff --write

# also migrate away from a source library (repeatable / comma-separated)
pnpm codemod "src/**/*.tsx" --from=styled-components,stylex,panda --to=css --diff --write
```

## Source libraries (`--from=`)

Detectors that rewrite other styling libraries onto pandwind APIs BEFORE the
mode pass runs. Off by default.

| source              | what it converts                                                                                                                                                                                                                                                                                   | flagged (not converted)                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `styled-components` | `styled.tag`\`...\``with only flat literal declarations →`tw({...})`when the bridge maps every declaration to typed keys, else`css.class({...})`. JSX usages are rewritten to the intrinsic tag with `className={Name}`(static classNames merge via`cx`). The styled-components import is removed. | interpolated templates, nested selectors/media queries, `styled(<Component>)` inheritance |
| `stylex`            | `stylex.create({ name: { literalProps } })` → plain object of `css.class({...})` values; `stylex.props(a, b)` → `cx(a, b)`. The stylex import is removed.                                                                                                                                          | pseudo/`:hover`, media queries, non-literal values                                        |
| `panda`             | `css({ literalProps })` and base-only `cva({...})` → `css.class({...})` (keys must be known CSS properties).                                                                                                                                                                                       | panda shorthands (`bg`, `p`, ...), `tokens.*` references, spreads, `cva` with variants    |

All three require an existing pandwind `css()` binding in the file (same rule
as `--to=css`) — the codemod never invents an import for your app's css
factory.

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
