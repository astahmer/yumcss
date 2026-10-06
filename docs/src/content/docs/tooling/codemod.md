---
title: Codemods — migrate to and from YumCSS
description: Use the adapter-backed migration pipeline to migrate styling systems safely.
sidebar:
  order: 4
---

`packages/codemod` has one migration workflow. It routes a source adapter
through the semantic IR to a target adapter, and uses the same command for
Tailwind/class composition, ecosystem swaps, and YumCSS's own APIs. Token
format conversion remains a separate `tokens` command.

```sh
# write a Tailwind project migration by default
pnpm exec yumcss-codemod migrate --from=tailwindcss --to=yumcss-tw "src/**/*.tsx"

# preview exact diffs without changing files
pnpm exec yumcss-codemod migrate --from=tailwindcss --to=yumcss-tw \
  "src/**/*.tsx" --dry-run --diff --report

# migrate between registered ecosystems
pnpm exec yumcss-codemod migrate --from=styled-components --to=yumcss-css \
  "src/**/*.{ts,tsx}" --diff
```

Migrations write changes by default. Use `--dry-run` for a read-only preview;
`--diff` and `--report` can be combined with either mode. The source remains
untouched when the target cannot represent the complete call, unless
`--partial` explicitly permits the target's partial capability contract.

## Registered adapter migrations

The built-in registry contains independently owned implementations for these
source families:

The registry shows which adapters can be selected, not which output is
canonical or proven in an installed project. Check the
[route audit](/interop/official-api-matrix/) before choosing a route; unverified
and research routes stay labeled that way. Start with `--dry-run --diff
--report`, review every residual, and validate the target project before
applying a migration.

| source family                                                                                                                                 | target examples                                          | adapter-owned behavior                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `emotion`, `styled-components`, `linaria`, `jss`, `fela`, `goober`, `aphrodite`, `treat`, `compiled`, `style9`, `stitches`, `vanilla-extract` | `css.class`, `design`, external targets where registered | static declarations, templates, rule-level constructs, runtime/config capabilities, and residuals |
| `panda`, `chakra-ui`, `mui`, `mantine`, `next-yak`, `bamboo`                                                                                  | YumCSS CSS/design targets                                | source config, token/theme semantics, host props, recipes/patterns, and component rewrites        |
| `stylex`, `solid-styled`, `vue-styled`, `react-native`                                                                                        | compatible YumCSS target lanes                           | host/framework semantics and runtime carriers where static extraction is not safe                 |

```sh
pnpm exec yumcss-codemod migrate --from=emotion --to=yumcss-css --safe --diff \
	"src/**/*.{js,jsx,ts,tsx}"
pnpm exec yumcss-codemod migrate --from=stylex --to=yumcss-css --safe --diff \
	"src/**/*.{js,jsx,ts,tsx}"
pnpm exec yumcss-codemod migrate --from=chakra-ui --to=yumcss-css --diff \
	"src/**/*.{ts,tsx}"
```

The target adapter creates or consolidates its YumCSS binding as needed.
Source component imports are preserved when a host rewrite still depends on
them. Third-party packages can provide one adapter, a plugin, or an adapter
collection through the explicit manifest/discovery contract described in [the
adapter contract](/reference/adapter-contract/).

Tokenami and UnoCSS are also registered source adapters. Tokenami decodes its
encoded custom-property keys and preserves composition as semantic metadata.
UnoCSS resolves literal class attributes through an injectable project
resolver; unknown preset utilities produce residuals rather than unsafe
guesses. `createUnoCssResolverFromCss` can consume CSS emitted by a real
UnoCSS generator.

## Virtual bundler migrations

For a reversible evaluation, the same adapter route can run inside any bundler
supported by `unplugin`. The plugin transforms modules in memory; it does not
edit the checkout or create files on disk. Generated target modules are served
through the host's virtual-module hooks.

```ts
import { yumcssMigrateUnplugin } from "@yumcss/codemod/swap/unplugin";
import { CodemodAdapterId } from "@yumcss/codemod/swap";
import tailwindcss from "@tailwindcss/vite";

export default {
	plugins: [
		yumcssMigrateUnplugin.vite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			onResidual: ({ file, residuals }) => console.warn(file, residuals),
		}),
		tailwindcss(),
	],
};
```

Use the matching named platform slice in another bundler configuration:

```ts
import {
	yumcssMigrateEsbuild,
	yumcssMigrateRollup,
	yumcssMigrateWebpack,
} from "@yumcss/codemod/swap/unplugin";
import { CodemodAdapterId } from "@yumcss/codemod/swap";

const route = {
	from: CodemodAdapterId.StyledComponents,
	to: CodemodAdapterId.Tailwind,
};

// rollup: plugins: [yumcssMigrateRollup(route)]
// webpack: plugins: [yumcssMigrateWebpack(route)]
// esbuild: plugins: [yumcssMigrateEsbuild(route)]
```

The migration plugin runs with `enforce: "pre"`, so the official target plugin
sees the migrated module and remains responsible for target CSS generation.
This composes with Tailwind, StyleX, or another registered target plugin in the
same way; the route is selected by the adapter registry rather than a
bundler-specific ecosystem switch.

This lane is useful when a repository is too large for an immediate committed
codemod, when a team wants to compare target CSS before changing source, or
when migration should be enabled progressively by package or directory. It
does not update editor-visible source, package manifests, runtime dependency
graphs, or a separate SSR build automatically. Configure the plugin in every
relevant build and treat residual callbacks as a migration worklist. Use the
CLI codemod once the virtual result is accepted and should become a committed,
searchable source change.

## YumCSS API swaps

The same pipeline supports `tw`, `css.class`, `design`, `tailwind`, `panda`,
and `stylex` target dialects:

```sh
pnpm exec yumcss-codemod migrate --from=auto --to=yumcss-css "src/**/*.tsx" --dry-run --diff
pnpm exec yumcss-codemod migrate --from=yumcss-dss --to=yumcss-tw "src/**/*.tsx" --diff
pnpm exec yumcss-codemod migrate --from=yumcss-css --to=tailwindcss "src/**/*.tsx" --diff
```

Literal declarations use the flat `SwapIR` fast path. Rich rules use the
versioned semantic `StyleProgram`, preserving conditions, selectors, rule
ordering, dynamic metadata, and provenance.

Panda project migration is the staged variant of this workflow:

```sh
pnpm exec yumcss-codemod migrate --from=panda --to=yumcss-css \
  --out=yumcss --diff --report \
  'src/**/*.{ts,tsx}'
```

It owns project discovery, config/theme loading, shared scanning, recipe and
pattern extraction, semantic conversion, module emission, rewrite
application, and validation. Representable recipes and patterns are emitted
as target modules; unsupported plugin or runtime behavior remains explicit.

## Token formats

The `tokens` subcommand converts through the versioned `TokenDocument` model.
The DTCG 2025.10 adapter preserves token groups, inherited types, root tokens,
standard metadata, structured values, references, and extensions. DTCG Resolver
sets and modifiers stay in a separate sidecar until a context is explicitly
selected. Format adapters report unsupported semantics and refuse lossy output
unless `--allow-lossy` is supplied.

```sh
pnpm exec yumcss-codemod tokens --from=dtcg tokens.tokens.json --validate --report-format=json
pnpm exec yumcss-codemod tokens --from=panda --to=dtcg panda.config.ts --out=tokens.tokens.json --resolver-out=tokens.resolver.json
pnpm exec yumcss-codemod tokens --from=dtcg --resolver=tokens.resolver.json --to=theme tokens.tokens.json --context=mode=dark --allow-lossy --out=dark-theme.css
```

Supported format adapters are DTCG, Tailwind `@theme`, Panda, YumCSS
presets, Style Dictionary, Figma Tokens, root CSS variables, and StyleX
import/export. Adding a format means implementing one registered adapter; the
normalized representation and fidelity contract are shared. Resolver file
sources are local and remain beneath the invocation project root; remote and
out-of-root references are rejected.

## Codemod polish

The metadata-aware polish command handles the small, repetitive cleanup tasks
around a migration. It reads the generated `types.d.ts`, `tw.ts`, and optional
`bridge.ts` from `--meta`; it never invents a utility or token vocabulary.

```sh
# Preview conflict-aware class ordering; add --write to apply it.
pnpm exec yumcss-codemod polish sort "src/**/*.{ts,tsx}" \
  --meta examples/example/src --diff

# Find repeated arbitrary values and show exact/nearby token proposals.
pnpm exec yumcss-codemod polish arbitrary "src/**/*.{ts,tsx}" \
  --meta examples/example/src --min-occurrences 2

# Use machine-readable output in CI or an editor integration.
pnpm exec yumcss-codemod polish arbitrary "src/**/*.{ts,tsx}" \
  --meta examples/example/src --report-format=json
```

Class sorting uses generated utility order and conflict properties. Colliding
utilities remain in source order so last-wins behavior is unchanged; unknown,
plugin, and arbitrary classes are barriers rather than guesses. The pass covers
static JSX `class`/`className` attributes, object properties, and literal
arguments to `cx`, `clsx`, `classnames`, and `twMerge`.

Arbitrary-value mode reports static class literals only. It groups occurrences
by property and resolved value, including forms such as `w-[37px]` and
`[width:37px]`, and reports exact or nearby preset matches without rewriting.
`--min-occurrences` filters the proposal list; dynamic expressions, spreads,
and runtime-built class strings remain outside the report.

Variant nesting is normalized through one shared condition pass. `_hover`,
`hover`, and known compound variant spellings resolve to the same IR path, then
the target emitter writes its native form (`_hover` for design objects,
`hover` nesting for `tw`). Unknown variants remain residuals.

StyleX `defineVars` is now importable through the token command as well as
exportable:

```sh
pnpm exec yumcss-codemod tokens --from=stylex --to=dtcg vars.stylex.ts \
  --out=tokens.json
```

Named aliases, namespace imports, and default imports are recognized. Static
static string/number leaves become typed token-document entries; conditional
or theme-dependent values are not flattened into invented token names. Their
unsupported paths remain visible in the fidelity report.

## Safety rails and reports

- writes are enabled by default; `--dry-run` disables writes and `--diff` shows changes;
- safe mode rewrites only calls whose required target capabilities are proven;
- `--partial` permits capabilities explicitly declared as partial;
- rewrites are idempotent;
- `// yumcss:migrate-skip` opts out a call site; and
- `--report` or `--report=json` exposes converted, skipped, and residual sites.

A residual identifies the source range, semantic kind, target capability, and
suggested action. Common genuine boundaries are runtime interpolations, theme
callbacks, imperative JSS rule application, styled subjects that need a
framework host rewrite, and framework-specific plugin behavior. Fix the
source, add a lowering/host adapter, or preserve the runtime carrier; do not
delete the marker just to make a report green.

## Reproducible proof

Run `pnpm run references:prepare` to materialize the pinned read-only repositories
used by the real migration corpus. Then run the relevant adapter fixtures and
the complete workspace matrix:

```sh
pnpm run references:prepare
pnpm --filter yumcss-codemod run test
pnpm run test:all
pnpm run knip

# Installed browser/SSR promotion for the pinned Goober corpus entry
pnpm run pivot:proof:installed
```

The checked-in reports record repository URL, commit, source path, adapter
route, target dependencies, canonical CSS evidence, browser/SSR dimensions,
CSS-size accounting, and residual status. Source-static evidence is not
promoted to full browser/SSR support until those dimensions are actually
executed.
