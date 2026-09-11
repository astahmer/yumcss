# pandwind-codemod

Move to Pandwind in a reviewable way, or generate the typed files your
Tailwind project needs.

## The shortest path

Preview a migration before writing anything:

```sh
pnpm exec pandwind-codemod migrate \
	--from styled-components \
	--to pandwind-css \
	--dry-run --diff --report \
	"src/**/*.tsx"
```

The command shows converted code and residuals for behavior it could not prove
safe. Remove --dry-run only after reviewing the diff. Use the same workflow
for Tailwind, Panda, Emotion, vanilla-extract, and the other registered
adapters.

If you already use Tailwind, generate the typed helper instead:

```sh
pnpm exec pandwind-codemod tw generate ./src/tailwind.css ./src
```

That creates a project-owned tw.ts; it is runtime code only when your
application imports it. The main [migration guide](../../docs/src/content/docs/guides/migrations.md)
explains how to choose a route and handle dynamic behavior.

## What the tool promises

- it loads project configuration when an official loader is available;
- it preserves unsupported or ambiguous code as an explicit residual;
- it can preview, report, and validate before it writes; and
- it keeps generated support files separate from application code.

The sections below are the detailed reference for adapter authors, CI
budgets, virtual bundler migrations, and token-format conversion.

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

The published codemod keeps `magic-string` as a runtime dependency. Its
`SourcePass` utility is used by the migration entrypoints to apply source-range
edits without losing offsets or silently accepting overlapping rewrites; it is
intentionally external to the codemod bundle.

## Tailwind project tooling

The `tw` subcommand owns the project-aware Tailwind loader and generated
Pandwind artifacts. It keeps the Tailwind compiler and codegen dependencies out
of the runtime `pandwind` package:

```sh
pandwind-codemod tw generate [css-entry] [out-dir] [--tokens <module>] [--bridge]
pandwind-codemod tw scan [tw-entry] [src-dir] [out-file]
pandwind-codemod tw prune [theme-css] [tw-entry] [src-dir]
pandwind-codemod tw verify [project-root] [--manifest <path>] [--budget <path>]
```

`generate` emits the typed `tw.ts`, declarations, the optional preset theme
bridge, and the optional `css()` bridge. `tw.ts` is a project-owned runtime
binding: Pandwind does not import it automatically, so a project only pays for
it when its source imports `tw()` or its generated conflict metadata for `cx()`.
The generated `__pandwindBuildMetadata` catalog is consumed by Vite and
codemod tooling and is tree-shaken when the application does not import it.

`bridge.ts` is a separate, optional artifact. It is generated for build-time
and migration tooling, but Pandwind does not import it automatically. Its
`twAdapter` becomes a runtime dependency only when the application explicitly
chooses Tailwind utility classes as its `ClassNameStrategy` (for example, in
`createDesignCss(..., { className: twAdapter })`). Ordinary Pandwind `css()`
and `tw()` usage does not need the bridge. The playground imports it only for
its explicit Tailwind adapter selector.

`scan` and `prune` are explicit follow-up passes for dynamic candidates and
unused generated theme variables. `verify` is the consumer-side freshness
gate: it checks every input and generated artifact hash in
`pandwind.generated.json`, and an optional budget file can declare
`maxRawBytes`, `maxGzipBytes`, and expected ownership for each generated path.
Use `--report` when a CI job should collect the JSON report without failing the
process. The same lane is available as `pandwind-codemod/tw` for scripts that
need the typed tooling ports instead of a subprocess.

Example budget file:

```json
{
	"schema": "pandwind.generated-budget/1",
	"artifacts": {
		"src/tw.ts": {
			"ownership": "runtime",
			"maxRawBytes": 200000,
			"maxGzipBytes": 50000
		}
	}
}
```

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

## One migration command

Migrations use one command: `migrate`. Token-format conversion remains the
separate `tokens` command.

The command writes changes by default. Use --dry-run for a read-only plan and
add --diff or --report when reviewing the result:

```sh
# Tailwind classes -> a project-owned typed Pandwind tw() module
pnpm exec pandwind-codemod migrate -f tailwindcss -t pandwind-tw src

# styled-components -> Pandwind css.class(), with a preview
pnpm exec pandwind-codemod migrate -f styled-components -t pandwind-css \
	--dry-run --diff --report "src/**/*.tsx"

# Pandwind -> another registered adapter
pnpm exec pandwind-codemod migrate --from pandwind --to unocss src
```

-f is short for --from, -t is short for --to, and --root selects a project
root when the command is run outside it. -h and --help work at the root, after
migrate or tokens, and after a command's arguments.

When the target is Pandwind, the command bootstraps shared project support in
pandwind/ by default: definePreset, css.ts, runtime.ts, dss.ts, cx.ts, the
typed tw.ts, its optional bridge, types.d.ts, the versioned interop artifact,
and a derived theme file when the source configuration proves one. Converted
files import those shared modules; they do not create a new createCss() instance
at every call site. Use --out <dir> to change that folder. The bridge is not a
default runtime import; keep it only when the target project needs the
Tailwind-class strategy or the build-time bridge metadata.

The source adapter loads the ecosystem's official project configuration when
one is available. Verified token names, conditions, utilities, and resolved
values flow into the target. For example, a Tailwind @theme token named card
is emitted as tw({ p: "card" }) when the target preset can prove the same
value. Missing or ambiguous configuration becomes a residual and stays
visible in the report instead of producing guessed code.

Target adapter dependencies are installed after a successful write using the
project's declared package manager or lockfile. Pass --no-install for an
offline run. The installer deduplicates packages already declared in the
project and separates runtime, peer, development, and config dependencies.

All registered adapters can be used as a source or target where their contract
supports it. The catalog includes Pandwind, Tailwind CSS, Panda, UnoCSS,
Chakra UI, styled-components, Emotion, MUI, Mantine, vanilla-extract,
Stitches, Linaria, JSS, Fela, Goober, Aphrodite, StyleX, Style9, Treat,
Compiled, Solid Styled, Vue Styled, Tokenami, Bamboo, Next-Yak, React Native,
Sass, Less, CSS Modules, and authored CSS. Use --from auto to detect a source
file, or pass a canonical adapter id.

Every route crosses the semantic style-program contract. A fully representable
site is rewritten into the target's documented carrier; unsupported, dynamic,
ambiguous, or conflicting semantics keep the source and receive a typed
pandwind:migrate-skip residual. --report prints residual details and
--report-format json exposes them to CI.

### Pandwind API targets

| target                  | output                                                |
| ----------------------- | ----------------------------------------------------- |
| pandwind-css / pandwind | shared css.class() bindings and a generated preset    |
| pandwind-tw / tw        | shared generated typed tw() binding and bridge        |
| pandwind-dss / dss      | Pandwind design-system object calls                   |
| css.class               | existing Pandwind css binding, with condition nesting |
| design / dss            | $frame, $layout, $text, and $raw vocabulary           |

### External targets

The same command handles routes such as:

```sh
pnpm exec pandwind-codemod migrate -f tailwindcss -t panda src
pnpm exec pandwind-codemod migrate -f unocss -t tailwindcss src
pnpm exec pandwind-codemod migrate -f styled-components -t chakra-ui-v3 src
```

Target emitters own their documented imports, component carriers, token
spelling, and framework rewrites. A source library's runtime context is
preserved or reported as a residual when the target cannot represent it.

### Token references

Value-capable targets can use --token-refs=off|bare|group to control whether
verified token references are emitted instead of resolved literals. Registered
source and target adapters own class-string conversion and token
preservation. Use `--from` and `--to` to select the route; unsupported values
remain in place with a typed residual in the migration report.

Token spelling is configured independently with
`--token-format=preserve|dot-delimited|stitches`:

- `preserve` is the default. It keeps an authored source spelling when the
  semantic token carried one; a reference inferred from an exact raw-value
  match uses the canonical `blue.500` form.
- `dot-delimited` always emits canonical paths such as `blue.500`.
- `stitches` emits the `$blue-500` spelling used by Stitches-style APIs.

`--token-refs` controls whether a target qualifies a reference with its group;
`--token-format` controls the spelling of the token path itself.

## Token configs (tokens subcommand)

tokens remains a separate data-format conversion command. It uses one
normalized TokenSet IR between importers and exporters:

```sh
# DTCG JSON -> Tailwind @theme CSS
pnpm exec pandwind-codemod tokens --from dtcg --to theme tokens.json --out theme.css

# panda.config.ts tokens -> DTCG JSON
pnpm exec pandwind-codemod tokens --from panda --to dtcg panda.config.ts --out tokens.json

# a Pandwind definePreset file -> Panda snippet on stdout
pnpm exec pandwind-codemod tokens --from preset --to panda src/preset.ts
```

Supported formats are dtcg, theme, panda, preset, sd, figma, rootcss, and
stylex. Use pandwind-codemod tokens --help for the validated format list.

## Safety and review flags

- writes are enabled by default; --dry-run disables all source and generated-file writes;
  --diff shows unified diffs;
- --report prints per-file counts and residual details; --report-format json is suitable for CI;
- --meta selects existing Pandwind metadata when bootstrapping is not desired;
- --skip-marker changes the opt-out marker, whose default is pandwind:migrate-skip;
- --safe requires the target capability contract; --partial permits partial lowering;
- --no-install skips package-manager execution;
- negative utilities, dynamic values, unknown utilities, and ambiguous tokens stay visible rather than being guessed.

The conversion is idempotent. Unsupported sites retain their source beside a
skip marker, so a later configuration or adapter improvement can be rerun
without losing the original intent.

## Adapter sources and targets

The registry includes the official API families for styled-components, StyleX,
Bamboo, Next-Yak, Chakra UI, MUI, Mantine, Emotion, vanilla-extract,
Stitches, Linaria, JSS, Fela, Goober, Aphrodite, Style9, Treat, Compiled,
Solid Styled, Vue Styled, Tokenami, UnoCSS, Panda, Tailwind CSS, and the
Pandwind APIs. Each adapter owns detection, official configuration loading,
semantic parsing, target emission, dependencies, capabilities, and residuals.

For example, the following routes use the same command and project-aware
configuration boundary:

```sh
pnpm exec pandwind-codemod migrate -f styled-components -t pandwind-css src
pnpm exec pandwind-codemod migrate -f tailwindcss -t pandwind-tw src
pnpm exec pandwind-codemod migrate -f panda -t pandwind-css src
pnpm exec pandwind-codemod migrate -f pandwind -t unocss src
```

## Panda inbound migration (`migrate --from=panda`)

Migrates a panda-css codebase to pandwind (plan 024):

```bash
pnpm add pandwind
pnpm exec pandwind-codemod migrate --from=panda --to=pandwind-css '<site>/{src,app,theme}/**/*.{ts,tsx}' --out=pandwind
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
