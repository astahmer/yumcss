---
title: Migrate from another styling library
description: A practical migration playbook for CSS-in-JS, utility CSS, and component-system codebases.
sidebar:
  order: 5
---

You do not need to migrate an entire application in one step. Start with one
representative component, preview the target code, and keep anything Pandwind
cannot prove equivalent in the report for a human to decide.

Pandwind is a pivot layer, not a promise that every source semantic can be
rewritten blindly. A migration has two targets:

1. preserve observable styling with the smallest possible manual change; and
2. make every unsupported or dynamic semantic explicit in a residual report.

## The common workflow

### 1. Inventory the source

Run the analyzer and identify the source library, framework, build tool,
themes, runtime interpolations, global rules, and generated files. Start with
a representative fixture before changing the whole repository.

### 2. Prepare the target contract

Create a Pandwind preset and decide whether the destination is:

- `tw()` and Tailwind classes;
- `css()` and an extracted atomic stylesheet; or
- design `css()` with `$frame`, `$layout`, and `$text` vocabulary.

Map source tokens into the preset before mapping component calls. A token
conversion can be reused by every source adapter.

### 3. Preview, diff, and report

Use [Migration Preview](/tooling/workflows/) to explore registered source and
target adapters in a read-only project workspace. Its edits stay in memory.
Use the CLI below when you need a reviewable diff and residual report:

For an adapter-backed source, use:

```sh
pnpm exec pandwind-codemod migrate \
  --from=<source> --to=css.class \
  --out=pandwind --dry-run --diff --report \
  'src/**/*.{js,jsx,ts,tsx,vue,svelte,astro}'
```

Use `--report-format json` for CI tooling, `--safe` to rewrite only lossless
sites, and `--partial` when an explicit partial migration is acceptable. The
command writes by default; keep `--dry-run` while reviewing the report, then
remove it to apply the result.

For a full Panda project migration, the same command also handles
discovery, config/theme loading, scanning, conversion, emission, rewrites, and
validation. Run it in a disposable branch and inspect residuals before
deleting source configuration.

### 4. Validate behavior

Compare canonical CSS, browser states, SSR output, hydration, responsive and
theme states, dependency/bundle changes, and residual reports. A successful
codemod exit is not equivalence proof.

## Panda

Panda is the closest semantic source because both systems have typed style
objects, conditions, tokens, and recipe concepts.

```sh
pnpm exec pandwind-codemod migrate \
  --from=panda --to=css.class --out=pandwind --diff --report \
  'src/**/*.{ts,tsx}'
```

```tsx
// before
css({ color: "blue.500", _hover: { color: "blue.600" } });

// after (illustrative target; the generated design-system binding is `dss`)
dss.class({ color: "$blue-500", _hover: { color: "$blue-600" } });
```

Run token migration first when Panda tokens are the source of truth. Recipes,
patterns, globals, config plugins, runtime interpolation, and generated
component selectors need fixture validation; representable recipes/patterns
are emitted as target modules, while unsupported behavior remains a residual.

## StyleX

```sh
pnpm exec pandwind-codemod migrate \
  --from=stylex --to=css.class --safe --diff --report \
  'src/**/*.{js,jsx,ts,tsx}'
```

```tsx
// before
<View style={[styles.card, active && styles.active]} />

// after
<View className={cx(css.class({ padding: "16px" }), active && css.class({ opacity: 1 }))} />
```

StyleX precedence, pseudo states, themes, and compile-time restrictions must
be checked against the target backend. Keep residuals for unsupported
framework or prop semantics.

## Tailwind

Tailwind is both a Pandwind target and a source lane. For class-heavy code,
use the scanner and typed `tw()` helper rather than rewriting every string by
hand. For object-style wrappers, use the same migration command:

```sh
pnpm exec pandwind-codemod migrate --from=tw --to=css.class --diff --report \
  'src/**/*.{ts,tsx,vue,svelte,astro}'
```

```tsx
// before
<div className="flex items-center gap-4 p-4" />

// after
<div className={tw({ flex: true, items: "center", gap: "4", p: "4" })} />
```

Dynamic class construction must be made statically discoverable or safelisted.
Arbitrary values remain valid but are visible as an escape from the token
contract.

## Emotion

```sh
pnpm exec pandwind-codemod migrate --from=emotion --to=css.class --diff --report \
  'src/**/*.{ts,tsx,js,jsx}'
```

```tsx
// before
<div css={{ color: theme.colors.primary, padding: 16 }} />

// after
<div className={css.class({ color: "$primary", padding: "16px" })} />
```

Handle the Emotion JSX pragma, object-vs-template syntax, theme functions,
keyframes, globals, and `css` prop composition. Runtime interpolations should
be lowered to `css.vars()` or remain residuals.

## More adapter routes

Panda, StyleX, Tailwind, and Emotion cover the common migration paths shown
above. Recipes for other ecosystems live in the [adapter migration catalog](/interop/migration-adapters/),
where their route-specific caveats stay visible without making the main workflow
look like every adapter has the same maturity.

## When the report contains residuals

Residuals are actionable when they identify a source location, semantic kind,
reason, target capability, and suggested strategy. The usual fixes are:

- replace a runtime interpolation with `css.vars()` or a custom property;
- rewrite a styled subject into an explicit host component;
- map a theme read into a preset token or target theme provider;
- preserve broad globals/keyframes/font-face as authored CSS, or map
  preset-owned flat selectors, named keyframes, and typed font faces to
  `define.preset({ web: ... })`;
- register a source plugin transform for framework syntax; or
- choose a runtime-capable backend instead of forcing static extraction.

Never delete a residual just to make the migration report green. Add a
fixture, implement the adapter/lowering, or document the intentional manual
boundary. See [adapter contracts](/reference/adapter-contract/) and
[compatibility](/interop/compatibility/).

## CSS Modules, Sass, Less, and authored CSS

```sh
pnpm exec pandwind-codemod migrate --from=css-modules --to=css.class \
  --diff --report 'src/**/*.module.css'
pnpm exec pandwind-codemod migrate --from=sass --to=authored-css \
  --diff --report 'src/**/*.{scss,sass}'
pnpm exec pandwind-codemod migrate --from=less --to=authored-css \
  --diff --report 'src/**/*.less'
```

CSS Modules local classes can become a typed Pandwind class map; known
workspace consumers are proposed as atomic import changes. `composes`, global
selectors, and externally visible hashed class names stay preserved or
residual until their consumers are proven. Sass and Less use their official
compiler ports and retain source-map/dependency evidence. Authored CSS is a
valid target for compiler-generated or cascade-sensitive rules, so the
migration does not force globals, layers, keyframes, or nesting into a local
style object.
