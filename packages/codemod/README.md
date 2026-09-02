# pandwind-codemod

The migration pivot is also available as the `pandwind-codemod/swap` entry
point. Third-party packages can export one `StyleAdapter`, a
`StyleAdapterPlugin`, or `{ adapters }` and register/discover it through
`createStyleAdapterRegistry`. Discovery is explicit and injectable, so CLI,
bundler, and test environments can choose their own package-loading policy.

```ts
import { createStyleAdapterRegistry } from "pandwind-codemod/swap";

const registry = createStyleAdapterRegistry();
await registry.discover(["my-pandwind-adapter"]);
```

Adapters implement the versioned `pandwind.style-adapter/3` contract and are
routed through the semantic style-program IR. Unsupported capabilities produce
residual reports instead of silent partial rewrites.

Adapter authors should read [ADAPTER_SDK.md](./ADAPTER_SDK.md) for the plugin
shape, schema versioning, capability declarations, and differential corpus
requirements.

## Virtual bundler migrations

The same adapter route can be evaluated without changing the source checkout.
The universal `unplugin` entry exposes platform slices for Vite, Rollup,
Rolldown, Webpack, Rspack, Rsbuild, esbuild, Farm, Bun, and unloader. The
migration runs before the target ecosystem's official plugin, which remains
responsible for final CSS generation.

```ts
import { pandwindMigrateUnplugin } from "pandwind-codemod/swap/unplugin";
import { CodemodAdapterId } from "pandwind-codemod/swap";

export default {
	plugins: [
		pandwindMigrateUnplugin.vite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
		}),
	],
};
```

Use `pandwindMigrateUnplugin.rollup`, `.webpack`, `.esbuild`, or another
named platform export in the corresponding host configuration. This lane is
reversible and virtual; use the CLI when the migration should become a
committed source change.

Migrate raw Tailwind authoring onto the pandwind APIs. Driven entirely by
your project's **generated metadata** (`types.d.ts`, `tw.ts`, `bridge.ts`) —
never hand-maintained tables.

```sh
# analysis only (default): reports what WOULD change
pnpm codemod "src/**/*.tsx" --to=tw

# preview exact diffs, then apply
pnpm codemod "src/**/*.tsx" --to=tw --diff --write

# also migrate away from a source library (repeatable / comma-separated)
pnpm codemod "src/**/*.tsx" --from=styled-components,stylex --to=css --diff --write
```

## Source libraries (`--from=`)

Detectors that rewrite other styling libraries onto pandwind APIs BEFORE the
mode pass runs. Off by default.

| source              | what it converts                                                                                                                   | flagged (not converted)                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `styled-components` | `styled.tag`\`...\``and object calls → the selected target; intrinsic JSX subjects can be rewritten with`className={Name}`and`cx`. | interpolated values and component inheritance remain residuals unless the host contract proves a safe rewrite |
| `stylex`            | `stylex.create({ name: { literalProps } })` → target style programs; `stylex.props(a, b)` → `cx(a, b)`.                            | non-literal values and unsupported rule semantics                                                             |
| `bamboo`            | `styled-system/css` object calls, including nested selectors and conditions.                                                       | dynamic config and unsupported generated patterns                                                             |
| `next-yak`          | extracted `css` templates, `styled.tag` templates, and css-prop source files.                                                      | runtime interpolations requiring host props/theme lowering                                                    |
| `chakra-ui`         | Chakra JSX style props on components such as `Box`, including aliases and pseudo props.                                            | project-specific theme extensions and non-style component props                                               |
| `mui`               | MUI `sx` objects, spacing aliases, inline theme palette values, and styled object calls.                                           | callback `sx`, responsive values requiring a project theme, and custom system functions                       |
| `mantine`           | Mantine style props and `style`/`sx` objects with CSS-variable token lowering.                                                     | callback/array styles and project-specific theme extensions                                                   |

The same v2 adapter registry also contains `emotion`, `vanilla-extract`,
`stitches`, `linaria`, `jss`, `fela`, `goober`, `aphrodite`, `style9`,
`treat`, `compiled`, `solid-styled`, `vue-styled`, `tokenami`, and `unocss`.
Each is a separate
adapter implementation behind the shared detection/config/parse/emit/
validation port; adding another source or target does not require changing
the swap orchestrator.

Both require an existing pandwind `css()` binding in the file (same rule
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

## Panda inbound migration (`swap --from=panda`)

Migrates a panda-css codebase to pandwind (plan 024):

```bash
pnpm add pandwind
node src/cli.ts swap --from=panda --to=css.class '<site>/{src,app,theme}/**/*.{ts,tsx}' --out=pandwind --write
```

- `css({...})` → `css.class({...})` — shorthands expanded, `_hover`/`_dark`/
  breakpoint scopes preserved, per-property responsive objects fanned out,
  textStyles expanded; semantic tokens map to authored `$refs` (offline theme
  ingestion from the host's panda.config, CSS-var fallback otherwise).
- `<panda.div px="4">` → `<div className={css.class({ paddingX: "4" })}>`
  (opening + closing tags; non-literal props are flagged, never guessed).
- cva/sva/defineRecipe → tier-1 modules under `<out>/recipes/` with identical
  export names: variants stay data + a generated resolver; single-use local
  definitions fold inline instead. Ark-ui anatomy/parts recipes are residual.
- Built-in patterns (`stack`, `hstack`, `grid`, …) re-emit as modules under
  `<out>/patterns/`; call sites only change their import specifier.
- Import specifiers rewrite 1:1: `@/styled-system/x` → `@/<out>/…`.
  Generated files are placed under the alias target (`@/* -> src/*` emits
  `src/<out>`), not blindly at the repository root. Alias detection:
  package.json#imports → next/vite/components.json/tsconfig paths.
- The generated bootstrap imports `pandwind/design` and `pandwind/cx`, so the
  target project must have the `pandwind` package installed before typechecking.
  Existing generated modules are preserved on reruns; add `--force` to regenerate them.

See `plans/024-panda-inbound-codemod.md` and
`plans/024-baseline-report.md` (real-world run on the panda docs website:
146/154 css sites + 86/86 factory elements converted, zero silent drops).
