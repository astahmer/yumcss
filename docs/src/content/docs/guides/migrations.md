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

## Tokenami

The built-in Tokenami adapter loads the project's official config when
`@tokenami/config` is available. It preserves aliases and resolves scalar
custom tokens into Tokenami's native authored references, such as
`$colors.brand`, instead of replacing them with their raw values. Use the
shared token bridge when the project has no loadable config:

```ts
// token bridge direction
Tokenami tokens → normalized token set → Pandwind preset → tw/css/design target
```

Composition, mode-dependent values, and runtime token reads still produce
explicit residuals when no equivalent target contract is available.

## UnoCSS

The built-in UnoCSS adapter asks `@unocss/config` and `@unocss/core` to load
the project's presets, theme, shortcuts, rules, and generated utility CSS.
Custom utilities are resolved from that generator output; custom theme values
are emitted as named utilities when the property/value match is exact and
unique. Move shared theme data through the token bridge only when the official
project loader is unavailable:

```tsx
// before
<div className="grid place-items-center gap-2" />

// after
<div className={tw({ grid: true, place: "center", gap: "2" })} />
```

Preserve UnoCSS variant groups and transformer-only syntax as explicit review
items. If a custom utility cannot be resolved from the project's generator,
the adapter keeps the source and reports an `unknown-utility` residual rather
than guessing.

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

## styled-components

```sh
pnpm exec pandwind-codemod migrate --from=styled-components --to=css.class \
  --diff --report 'src/**/*.{ts,tsx,js,jsx}'
```

```tsx
// before
const Button = styled.button<{ $active: boolean }>`
	color: ${({ $active }) => ($active ? "red" : "gray")};
`;

// after: the subject and prop condition are rewritten together
const Button = ({ $active, ...props }) => (
	<button className={css.class({ color: $active ? "red" : "gray" })} {...props} />
);
```

Styled subjects require JSX/template rewrites, not only declaration rewrites.
Check transient props, component selectors, global styles, keyframes, and
theme context in a browser and SSR fixture.

## vanilla-extract

```sh
pnpm exec pandwind-codemod migrate --from=vanilla-extract --to=css.class \
  --diff --report 'src/**/*.{ts,tsx}'
```

```ts
// before
export const card = style({ padding: vars.space.md, background: vars.color.canvas });

// after
export const card = css.class({ padding: "$md", background: "$canvas" });
```

Preserve file-local composition, `recipe()` variants, global styles, layers,
font faces, and theme contracts. Runtime values are not automatically static.

## Stitches

```sh
pnpm exec pandwind-codemod migrate --from=stitches --to=css.class \
  --diff --report 'src/**/*.{ts,tsx}'
```

Inline static `createStitches({ theme })` configuration is read by the adapter,
and verified `$scale$key` references are resolved before the target decides
whether a native token exists. An unresolved or externally configured token is
reported instead of being guessed. Map `styled()`/variants to a component
recipe and validate compound variants, responsive variants, `css` prop
merging, and theme switching; these are semantic behaviors rather than simple
object renames.

## Linaria

```sh
pnpm exec pandwind-codemod migrate --from=linaria --to=css.class \
  --safe --diff --report 'src/**/*.{ts,tsx,js,jsx}'
```

Static Linaria declarations generally map cleanly to `css.class`. Keep
unsupported compile-time expressions, imported constants, keyframes, globals,
and SSR ordering in the report until the target fixture proves equivalence.

## JSS and React-JSS

```sh
pnpm exec pandwind-codemod migrate --from=jss --to=css.class --diff --report \
  'src/**/*.{ts,tsx,js,jsx}'
```

JSS imperative rule application (`sheet.addRule`, dynamic rule updates, and
runtime plugin behavior) needs an explicit runtime target or a component
rewrite. Function-valued theme rules remain runtime code. Do not pretend that a
static `css.class` call preserves imperative updates.

## Fela and Goober

```sh
pnpm exec pandwind-codemod migrate --from=fela --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod migrate --from=goober --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

These adapters cover common object-style declarations. Renderer configuration,
Fela plugins, and Goober `setup()` are explicit configuration residuals until
their target semantics are proven. Validate renderer ordering, keyframes, media
queries, hydration IDs, and dynamic interpolation functions. Use `css.vars()`
for values that change without changing rule shape.

## Aphrodite

```sh
pnpm exec pandwind-codemod migrate --from=aphrodite --to=css.class --diff --report \
  'src/**/*.{ts,tsx}'
```

Map `StyleSheet.create` declarations and `css()` composition first. Font-face
arrays, keyframes, and priority/order behavior need authored-rule fixtures;
keep them explicit rather than flattening them into ordinary declarations.

## Treat

```sh
pnpm exec pandwind-codemod migrate --from=treat --to=css.class --diff --report \
  'src/**/*.{ts,tsx}'
```

Treat themes and build-time values should become preset tokens and conditions.
Check generated class order and theme file boundaries after conversion.

## Compiled and Style9

```sh
pnpm exec pandwind-codemod migrate --from=compiled --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod migrate --from=style9 --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

Validate atomic precedence, compile-time restrictions, responsive states, and
the interaction between imported styles and local composition.

## Chakra UI, MUI, and Mantine

These are component-system migrations as well as styling migrations. Start by
converting theme tokens, then convert component props and style objects:

```sh
pnpm exec pandwind-codemod migrate --from=chakra-ui --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod migrate --from=mui --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod migrate --from=mantine --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

```tsx
// before
<Box p="4" bg="blue.500" _hover={{ bg: "blue.600" }} />

// after
<div className={css.class({ p: "4", bg: "$blue-500", _hover: { bg: "$blue-600" } })} />
```

Preserve accessibility behavior, slot structure, responsive prop semantics,
component defaults, and theme context. A codemod cannot replace a complex
third-party component implementation without a component-level acceptance
fixture.

## Next-yak

```sh
pnpm exec pandwind-codemod migrate --from=next-yak --to=css.class --diff --report \
  'src/**/*.{ts,tsx}'
```

Next-yak's compile-time CSS and framework integration should be checked for
server/client boundaries, import ordering, and generated artifact placement.

## Solid and Vue styled systems

```sh
pnpm exec pandwind-codemod migrate --from=solid-styled --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod migrate --from=vue-styled --to=css.class --diff --report 'src/**/*.{vue,ts}'
```

Function-valued styles need framework-specific prop and theme wrappers. Keep
reactivity, Vue scoped-style behavior, Solid signals, and SSR boundaries in
framework fixtures; a static declaration rewrite is insufficient.

The repository includes pinned real-project acceptance fixtures for these
routes in `plans/evidence/linaria-installed-proof.json`,
`plans/evidence/treat-installed-proof.json`,
`plans/evidence/solid-styled-installed-proof.json`, and
`plans/evidence/vue-styled-installed-proof.json`.
Run `pnpm run pivot:proof:installed:routes` to validate the checked-in reports;
the route gate covers canonical CSS, installed dependencies, typecheck/build,
SSR/hydration, browser states, and CSS accounting. These are still
experimental route proofs, not claims that dynamic themes, macros, plugins, or
framework-specific APIs all migrate automatically.

## Bamboo and React Native

Bamboo uses its adapter and should be checked for its composition/runtime
semantics:

```sh
pnpm exec pandwind-codemod migrate --from=bamboo --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

React Native is a separate backend target. Use the source adapter to produce
semantic IR, then validate the RN backend rather than comparing browser CSS:

```sh
pnpm exec pandwind-codemod migrate --from=react-native --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

Platform selectors, layout differences, accessibility props, and unsupported
browser-only declarations must be reported as target capability decisions.

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

## Tamagui

```sh
pnpm exec pandwind-codemod migrate --from=tamagui --to=css.class \
  --diff --report 'src/**/*.{ts,tsx,js,jsx}'
```

Static `styled(View, { ... })` declarations are projected through Pandwind's
host adapter while preserving the wrapped subject. Tamagui tokens, themes,
variants, `render`, and function-valued props depend on the project's official
compiler/configuration context. If that context is unavailable, the adapter
keeps the source and reports a configuration or dynamic residual.

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
