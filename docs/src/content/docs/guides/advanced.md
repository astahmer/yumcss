---
title: Advanced mode
description: The complete guide to pandwind's runtime, compiler, adapters, and validation surfaces.
sidebar:
  order: 2
---

Advanced mode is for teams building a design system, component library,
compiler integration, migration pipeline, or non-DOM renderer. The central
model is:

```text
source style intent → semantic style program → backend → class/CSS/runtime artifact
```

`tw()`, `css()`, and design `css()` are deliberately small façades over that
pipeline. The same semantic intent can be lowered to Tailwind classes, atomic
CSS, React Native objects, or OpenTUI output where the backend supports it.

## Choose the execution model

### Static Tailwind lowering

```ts
import { pandwindVite } from "pandwind/vite";

pandwindVite({
	twSources: ["/src/tw.ts", /generated\/tw/],
	cxSources: ["/src/cx.ts"],
	onUnresolved: "warn",
});
```

Literal `tw()` and safe `cx()` calls become class strings before Tailwind runs.
`onUnresolved: "error"` is useful in CI; `warn` is useful during adoption.
Dynamic values remain runtime values and need a scanner/safelist strategy.

### Static atomic extraction

```ts
import { pandwindCssVite } from "pandwind/vite";
import { preset } from "./src/preset";

pandwindCssVite(preset, {
	cssSources: [/\/src\/styles\//],
	include: [/\.(tsx|ts|vue|svelte|astro)$/],
	exclude: [/\.stories\./],
	debug: true,
	splitByRoute: [{ name: "dashboard", match: /routes\/dashboard/ }],
});
```

The extractor scans source files, canonicalizes atoms, and serves the result
from `pandwind:css`. Route splitting is opt-in. `inlineCritical` can inline a
route's common and exclusive CSS into its built HTML, with `capBytes` as a
guardrail.

### One engine context

When `pandwindVite({ css })` and `pandwindCssVite()` participate in the same
build, pass one context created from one preset:

```ts
import { createPandwindEngineContext, pandwindCssVite, pandwindVite } from "pandwind/vite";
import { preset } from "./src/preset";

const engine = createPandwindEngineContext({ preset });

plugins: [pandwindVite({ css: { preset, engine } }), pandwindCssVite(preset, { engine })];
```

This keeps folded classes and extracted rules on the same identity and
ordering policy.

## The API surface

### `css()` and its boundaries

```ts
const result = css({ color: "$blue-500" });
const className = css.class({ color: "$blue-500" });
const dynamic = css.vars({ color: runtimeColor });
const props = css.props(result);
const raw = css.raw({ "--app-size": "12px" });
```

Use `css()` when a consumer needs the compiled declaration map, `.class` when
it needs a class string, `.vars()` when values are dynamic, and `.props()` to
adapt a compiled result to a host element. `raw()` is an explicit escape hatch
and is reported as authored CSS by analysis tools.

`$input` creates a runtime input function. `group()` creates named style
groups. These paths are intentionally not treated as static literals unless a
compiler can prove the result.

### Conditions, selectors, and nesting

Preset conditions can be media queries, pseudo states, parent selectors, or
arbitrary selectors. Keep condition names stable because they are part of the
semantic program and migration reports:

```ts
conditions: {
  _hover: "&:hover",
  _focusVisible: "&:focus-visible",
  _dark: ".dark &",
  sm: "@media (min-width: 640px)",
}
```

Nested condition objects preserve their selector/at-rule relationship. If a
target cannot represent a condition, the adapter must emit a residual rather
than silently dropping it.

### Class-name strategies

`ClassNameStrategy` is the port between semantic styles and a target naming
system. `createTwAdapter()` maps declarations to generated Tailwind utilities;
`createStyleXAdapter()` emits StyleX-shaped atomic identities; named or atomic
strategies can keep a stylesheet-backed identity. Strategies must preserve
deterministic identity and expose capability/lossiness behavior to compilers
and adapters. Pass resolved condition metadata to `createStyleXAdapter` when
custom selectors or at-rules need to participate in the identity hash.

## Presets and themes

Use `defineTokens`, `defineTheme`, `definePreset`, `defineConditions`, and
`defineProperties` to make the design contract explicit. A preset can carry
raw property configuration, token groups, semantic tokens, conditions, and
strictness. See [Build a design system](/guides/design-system/) for a complete
composition.

Theme scopes and semantic tokens should be lowered through the target's theme
mechanism where possible. If a migration relies on runtime theme lookup, use a
runtime expression/custom property or keep an explicit residual.

## Vite and other bundlers

`pandwindVite` options:

| Option           | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `twSources`      | Generated `tw` module import sources                   |
| `cxSources`      | Generated `cx` module import sources                   |
| `exclude`        | Module-id regexes to skip                              |
| `css.preset`     | Preset for folded `css()` calls                        |
| `css.className`  | Class-name strategy for folded CSS calls               |
| `css.engine`     | Shared engine context                                  |
| `css.cssSources` | CSS/design module import sources                       |
| `onUnresolved`   | `off`, `warn`, or `error` for unresolved folded tokens |

`pandwindCssVite` options:

| Option                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `cssSources`          | CSS/design imports to scan                   |
| `include` / `exclude` | Files included or skipped                    |
| `root`                | Scan root; defaults to the current directory |
| `virtualId`           | Virtual CSS module id                        |
| `className`           | Tailwind or named class strategy             |
| `engine`              | Shared engine context                        |
| `splitByRoute`        | Route-specific CSS buckets                   |
| `inlineCritical`      | Inline route CSS into built HTML             |
| `debug`               | Add development provenance information       |

The same extraction core is available through the generic unplugin entry
point. Keep the Vite wrapper thin and use the core when integrating another
bundler.

## SSR, hydration, and non-DOM backends

The CSS backend owns canonical rule identity, ordering, serialization, and the
style-element sink. SSR should serialize the same canonical sheet used by the
client. Hydration must reuse the same identity/order inputs, not re-create
random class names. See [SSR](/reference/ssr/).

React Native and OpenTUI use the same backend port with different adapters.
They do not promise browser CSS semantics: unsupported conditions, selectors,
or at-rules are capability failures and should be visible in validation.
See [backends](/reference/backends/).

## Tooling and architecture

The codemod layer is a port-and-adapter system. A source adapter detects and
parses one ecosystem; a target adapter emits one destination; semantic IR,
lossiness contracts, scanners, lowerings, and validators are shared. Plugins
can be discovered through the adapter manifest convention. See [the adapter
contract](/reference/adapter-contract/) and [codemod](/tooling/codemod/).

Analyzer and Studio consume the same scanner and semantic facts. Use them to
measure source coverage, dynamic/residual sites, dependency changes, CSS shape,
and migration history before and after a change.

## Differential validation

For serious migrations, compare source and target at several levels:

1. canonical CSS and rule ordering;
2. browser states such as hover, focus, dark mode, and responsive breakpoints;
3. SSR HTML/CSS;
4. client hydration and streaming/RSC where applicable;
5. dependency and bundle changes; and
6. residual, lossiness, and manual-fix reports.

The goal is not merely “the codemod ran”; it is equivalent observable styling.
Use [compatibility](/interop/compatibility/) and [benchmarks](/reference/benchmarks/)
for the project-level acceptance model.

## Performance and release discipline

Run static extraction for stable literals, keep runtime values in `css.vars()`
or a deliberate runtime lane, and inspect generated CSS size. Before release,
run typecheck, lint, Knip, package builds, adapter fixtures, differential
fixtures, and SSR/hydration checks. The frozen user-facing API remains small;
new behavior should normally be compiler, tooling, adapter, or backend work.
