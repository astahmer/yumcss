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

## Swapping between pandwind APIs (`swap`)

The `swap` subcommand converts BETWEEN pandwind styling APIs — and outbound
to external libraries — call site by call site, using the same generated
metadata. Every conversion goes through a neutral IR (resolved declarations

- condition chains), so adding a target library means writing one emitter.

```sh
# tw() objects -> css.class() literals (auto-detects the source shape)
pnpm codemod swap --from=auto --to=css.class "src/**/*.tsx" --diff --write

# design vocabulary -> typed tw objects
pnpm codemod swap --from=design --to=tw "src/**/*.tsx" --write

# export OUT of pandwind entirely
pnpm codemod swap --from=css --to=tailwind "src/**/*.tsx" --write   # class strings
pnpm codemod swap --from=auto --to=panda "src/**/*.tsx" --write     # styled-system/css css()
pnpm codemod swap --from=auto --to=stylex "src/**/*.tsx" --write    # stylex.create + props
```

| `--to=`     | output shape                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `css.class` | `css.class({ camelCase })` literals with `_condition` nesting (requires an existing `css` binding)         |
| `design`    | the `$frame`/`$layout`/`$text` vocabulary where tokens match; leftovers land in `$raw` (same binding rule) |
| `tw`        | typed `tw({...})` objects via the bridge; misses flagged, original kept                                    |
| `tailwind`  | plain class strings; bridge misses degrade to arbitrary-property classes (`[prop:value]`)                  |
| `panda`     | panda-native `css({...})` with `_condition` keys + `styled-system/css` import                              |
| `stylex`    | a file-level `stylex.create({...})` block + `stylex.props(styles.sN)` at each call site                    |

Losslessness contract: a call site is rewritten only when EVERY literal entry
is representable in the target; otherwise the original stays and a skip
marker documents why. Dynamic values, bridge misses and unknown conditions
are reported per file in the summary.

### Token references (`--token-refs=`)

Value-capable targets (panda today) can emit **token references** instead of
resolved literals, derived from your app's DTCG preset:

| mode    | emitted value for `backgroundColor`  |
| ------- | ------------------------------------ |
| `bare`  | `"blue.500"` (default)               |
| `group` | `"colors.blue.500"`                  |
| `off`   | resolved/authoried literals verbatim |

```sh
pnpm codemod swap --from=auto --to=panda --token-refs=group "src/**/*.tsx" --write
```

Emitted calls are always SINGLE-LINE — the codemod never pretty-prints;
run your formatter afterwards if you want them expanded.

## Token configs (`tokens` subcommand)

Convert between the systems design systems store tokens in — one normalized
TokenSet IR in between, so each new format is one importer + one exporter:

```sh
# DTCG JSON -> tailwind @theme css
pnpm codemod tokens --from=dtcg --to=theme tokens.json --out=theme.css

# panda.config.ts tokens -> DTCG json
pnpm codemod tokens --from=panda --to=dtcg panda.config.ts --out=tokens.json

# a pandwind definePreset file -> panda snippet (stdout)
pnpm codemod tokens --from=preset --to=panda src/preset.ts
```

| format    | direction     | shape                                                           |
| --------- | ------------- | --------------------------------------------------------------- |
| `dtcg`    | import+export | W3C DTCG JSON with `$value` leaves                              |
| `theme`   | import+export | tailwind `@theme { --color-x: … }` custom properties            |
| `panda`   | import+export | config `theme[.extend].tokens` with `{ value }` leaves          |
| `preset`  | import+export | a module exporting a definePreset output (imported dynamically) |
| `sd`      | import+export | Style Dictionary v4 JSON, `{ value, type? }` leaves             |
| `figma`   | import+export | Figma Tokens plugin JSON, `{ value, type }` leaves              |
| `rootcss` | import+export | flat `:root { --color-x: … }` custom properties                 |
| `stylex`  | export-only   | `defineVars({...})` module (one export per group)               |

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
`--report` — print a migration-completeness summary (call sites through
pandwind vs flagged vs verbatim, files needing attention). Works in both
the default mode pass and `swap`.
