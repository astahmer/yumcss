---
title: Codemods — migrate to and from Pandwind
description: Use the raw-authoring codemod or the adapter-backed swap pipeline to migrate styling systems safely.
sidebar:
  order: 4
---

`packages/codemod` has two related workflows. The default mode upgrades raw
Tailwind/class composition onto Pandwind APIs using generated project
metadata. The `swap` mode routes a source adapter through the semantic IR to a
target adapter, so migrations are not implemented as one bespoke function for
each pair.

```sh
# analysis only (default): reports what WOULD change
pnpm codemod "src/**/*.tsx" --to=tw

# preview exact diffs, then apply
pnpm codemod "src/**/*.tsx" --to=tw --diff --write

# migrate away from a source library through the adapter contract
pnpm codemod swap --from=styled-components --to=css.class \
  "src/**/*.{ts,tsx}" --diff --write
```

Run `--diff` before `--write`. The default is dry-run and safe mode; the
source remains untouched when the target cannot represent the complete call.

## Default metadata-driven modes

The default workflow is driven by the project's generated `types.d.ts`,
`tw.ts`, and `bridge.ts` rather than hand-maintained mappings.

| mode        | behavior                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--to=tw`   | static class strings → typed `tw({...})` objects; variants become nesting and overloaded utilities use the generated conflict map |
| `--to=cx`   | `clsx`, `classnames`, `classcat`, and `tailwind-merge` composition → Pandwind `cx()`                                              |
| `--to=css`  | bridge-mappable static strings → `css.class({...})` with resolved declarations                                                    |
| `--to=keep` | analysis only: counts mappable, unmappable, and verbatim tokens                                                                   |

Unknown utilities, arbitrary values, important modifiers, and dynamic class
construction remain verbatim or are wrapped in `cx()` so the codemod never
silently loses a class.

## Adapter-backed swaps

The built-in registry contains independently owned implementations for these
source families:

| source family                                                                                                                                 | target examples                                          | adapter-owned behavior                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `emotion`, `styled-components`, `linaria`, `jss`, `fela`, `goober`, `aphrodite`, `treat`, `compiled`, `style9`, `stitches`, `vanilla-extract` | `css.class`, `design`, external targets where registered | static declarations, templates, rule-level constructs, runtime/config capabilities, and residuals |
| `panda`, `chakra-ui`, `mui`, `mantine`, `next-yak`, `bamboo`                                                                                  | Pandwind CSS/design targets                              | source config, token/theme semantics, host props, recipes/patterns, and component rewrites        |
| `stylex`, `solid-styled`, `vue-styled`, `react-native`                                                                                        | compatible Pandwind target lanes                         | host/framework semantics and runtime carriers where static extraction is not safe                 |

```sh
pnpm codemod swap --from=emotion --to=css.class --safe --diff \
  "src/**/*.{js,jsx,ts,tsx}"
pnpm codemod swap --from=stylex --to=css.class --safe --diff \
  "src/**/*.{js,jsx,ts,tsx}"
pnpm codemod swap --from=chakra-ui --to=css.class --diff \
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

For a reversible evaluation, the same adapter route can run inside Vite. The
plugin transforms modules in memory; it does not edit the checkout or create
files on disk. Generated target modules are served through Vite's virtual
module hooks.

```ts
import { pandwindMigrateVite } from "pandwind-codemod/swap/vite";
import { CodemodAdapterId } from "pandwind-codemod/swap";
import tailwindcss from "@tailwindcss/vite";

export default {
	plugins: [
		pandwindMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
			onResidual: ({ file, residuals }) =>
				console.warn(file, residuals),
		}),
		tailwindcss(),
	],
};
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
pnpm codemod swap --from=auto --to=css.class "src/**/*.tsx" --diff --write
pnpm codemod swap --from=design --to=tw "src/**/*.tsx" --diff --write
pnpm codemod swap --from=css --to=tailwind "src/**/*.tsx" --diff --write
```

Literal declarations use the flat `SwapIR` fast path. Rich rules use the
versioned semantic `StyleProgram`, preserving conditions, selectors, rule
ordering, dynamic metadata, and provenance.

Panda project migration is the staged variant of this workflow:

```sh
pnpm exec pandwind-codemod swap --from=panda --to=css.class \
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
pnpm codemod tokens --from=dtcg --to=theme tokens.json --out=theme.css
pnpm codemod tokens --from=panda --to=dtcg panda.config.ts --out=tokens.json
pnpm codemod tokens --from=preset --to=panda src/preset.ts
```

Supported format adapters are DTCG, Tailwind `@theme`, Panda, Pandwind
presets, Style Dictionary, Figma Tokens, root CSS variables, and StyleX
export. Adding a format means implementing one source/target adapter; the
normalized representation is shared.

## Safety rails and reports

- dry-run by default; `--diff` shows changes and `--write` applies them;
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

Run `pnpm references:prepare` to materialize the pinned read-only repositories
used by the real migration corpus. Then run the relevant adapter fixtures and
the complete workspace matrix:

```sh
pnpm references:prepare
pnpm --filter pandwind-codemod test
pnpm test:all
pnpm knip

# Installed browser/SSR promotion for the pinned Goober corpus entry
pnpm pivot:proof:installed
```

The checked-in reports record repository URL, commit, source path, adapter
route, target dependencies, canonical CSS evidence, browser/SSR dimensions,
CSS-size accounting, and residual status. Source-static evidence is not
promoted to full browser/SSR support until those dimensions are actually
executed.
