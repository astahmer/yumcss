---
title: Codemods — migrate to and from Pandwind
description: Use the adapter-backed migration pipeline to migrate styling systems safely.
sidebar:
  order: 4
---

`packages/codemod` has one migration workflow. It routes a source adapter
through the semantic IR to a target adapter, and uses the same command for
Tailwind/class composition, ecosystem swaps, and Pandwind's own APIs. Token
format conversion remains a separate `tokens` command.

```sh
# write a Tailwind project migration by default
pnpm exec pandwind-codemod migrate --from=tailwindcss --to=pandwind-tw "src/**/*.tsx"

# preview exact diffs without changing files
pnpm exec pandwind-codemod migrate --from=tailwindcss --to=pandwind-tw \
  "src/**/*.tsx" --dry-run --diff --report

# migrate between registered ecosystems
pnpm exec pandwind-codemod migrate --from=styled-components --to=pandwind-css \
  "src/**/*.{ts,tsx}" --diff
```

Migrations write changes by default. Use `--dry-run` for a read-only preview;
`--diff` and `--report` can be combined with either mode. The source remains
untouched when the target cannot represent the complete call, unless
`--partial` explicitly permits the target's partial capability contract.

## Registered adapter migrations

The built-in registry contains independently owned implementations for these
source families:

| source family                                                                                                                                 | target examples                                          | adapter-owned behavior                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `emotion`, `styled-components`, `linaria`, `jss`, `fela`, `goober`, `aphrodite`, `treat`, `compiled`, `style9`, `stitches`, `vanilla-extract` | `css.class`, `design`, external targets where registered | static declarations, templates, rule-level constructs, runtime/config capabilities, and residuals |
| `panda`, `chakra-ui`, `mui`, `mantine`, `next-yak`, `bamboo`                                                                                  | Pandwind CSS/design targets                              | source config, token/theme semantics, host props, recipes/patterns, and component rewrites        |
| `stylex`, `solid-styled`, `vue-styled`, `react-native`                                                                                        | compatible Pandwind target lanes                         | host/framework semantics and runtime carriers where static extraction is not safe                 |

```sh
pnpm exec pandwind-codemod migrate --from=emotion --to=pandwind-css --safe --diff \
	"src/**/*.{js,jsx,ts,tsx}"
pnpm exec pandwind-codemod migrate --from=stylex --to=pandwind-css --safe --diff \
	"src/**/*.{js,jsx,ts,tsx}"
pnpm exec pandwind-codemod migrate --from=chakra-ui --to=pandwind-css --diff \
	"src/**/*.{ts,tsx}"
```

The target adapter creates or consolidates its Pandwind binding as needed.
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
import { pandwindMigrateUnplugin } from "pandwind-codemod/swap/unplugin";
import { CodemodAdapterId } from "pandwind-codemod/swap";
import tailwindcss from "@tailwindcss/vite";

export default {
	plugins: [
		pandwindMigrateUnplugin.vite({
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
	pandwindMigrateEsbuild,
	pandwindMigrateRollup,
	pandwindMigrateWebpack,
} from "pandwind-codemod/swap/unplugin";
import { CodemodAdapterId } from "pandwind-codemod/swap";

const route = {
	from: CodemodAdapterId.StyledComponents,
	to: CodemodAdapterId.Tailwind,
};

// rollup: plugins: [pandwindMigrateRollup(route)]
// webpack: plugins: [pandwindMigrateWebpack(route)]
// esbuild: plugins: [pandwindMigrateEsbuild(route)]
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

## Pandwind API swaps

The same pipeline supports `tw`, `css.class`, `design`, `tailwind`, `panda`,
and `stylex` target dialects:

```sh
pnpm exec pandwind-codemod migrate --from=auto --to=pandwind-css "src/**/*.tsx" --dry-run --diff
pnpm exec pandwind-codemod migrate --from=pandwind-dss --to=pandwind-tw "src/**/*.tsx" --diff
pnpm exec pandwind-codemod migrate --from=pandwind-css --to=tailwindcss "src/**/*.tsx" --diff
```

Literal declarations use the flat `SwapIR` fast path. Rich rules use the
versioned semantic `StyleProgram`, preserving conditions, selectors, rule
ordering, dynamic metadata, and provenance.

Panda project migration is the staged variant of this workflow:

```sh
pnpm exec pandwind-codemod migrate --from=panda --to=pandwind-css \
  --out=pandwind --diff --report \
  'src/**/*.{ts,tsx}'
```

It owns project discovery, config/theme loading, shared scanning, recipe and
pattern extraction, semantic conversion, module emission, rewrite
application, and validation. Representable recipes and patterns are emitted
as target modules; unsupported plugin or runtime behavior remains explicit.

## Token formats

The `tokens` subcommand converts through one normalized token-set IR:

```sh
pnpm exec pandwind-codemod tokens --from=dtcg --to=theme tokens.json --out=theme.css
pnpm exec pandwind-codemod tokens --from=panda --to=dtcg panda.config.ts --out=tokens.json
pnpm exec pandwind-codemod tokens --from=preset --to=panda src/preset.ts
```

Supported format adapters are DTCG, Tailwind `@theme`, Panda, Pandwind
presets, Style Dictionary, Figma Tokens, root CSS variables, and StyleX
export. Adding a format means implementing one source/target adapter; the
normalized representation is shared.

## Safety rails and reports

- writes are enabled by default; `--dry-run` disables writes and `--diff` shows changes;
- safe mode rewrites only calls whose required target capabilities are proven;
- `--partial` permits capabilities explicitly declared as partial;
- rewrites are idempotent;
- `// pandwind:migrate-skip` opts out a call site; and
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
pnpm --filter pandwind-codemod run test
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
