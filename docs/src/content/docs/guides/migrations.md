---
title: Migrate from another styling library
description: A practical migration playbook for CSS-in-JS, utility CSS, and component-system codebases.
sidebar:
  order: 5
---

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
pnpm exec pandwind-codemod swap \
  --from=<source> --to=css.class \
  --out=pandwind --diff --report \
  'src/**/*.{js,jsx,ts,tsx,vue,svelte,astro}'
```

Use `--report=json` for CI tooling, `--safe` to rewrite only lossless sites,
`--partial` when an explicit partial migration is acceptable, and `--write`
to apply the result. Keep generated output separate until the report is
reviewed.

For a full Panda project migration, the staged project command also handles
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
pnpm exec pandwind-codemod swap \
  --from=panda --to=css.class --out=pandwind --diff --report \
  'src/**/*.{ts,tsx}'
```

```tsx
// before
css({ color: "blue.500", _hover: { color: "blue.600" } });

// after (illustrative target)
css.class({ color: "$blue-500", _hover: { color: "$blue-600" } });
```

Run token migration first when Panda tokens are the source of truth. Recipes,
config plugins, runtime interpolation, and generated component selectors need
fixture validation; do not replace them with guessed literals.

## StyleX

```sh
pnpm exec pandwind-codemod swap \
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
hand. For object-style wrappers, use the swap command:

```sh
pnpm exec pandwind-codemod swap --from=tw --to=css.class --diff --report \
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

There is no dedicated Tokenami semantic adapter in the built-in catalog yet.
Use the shared token bridge to import Tokenami tokens into a Pandwind preset,
then migrate style calls through the closest source shape:

```ts
// token bridge direction
Tokenami tokens → normalized token set → Pandwind preset → tw/css/design target
```

This is a supported interoperability workflow, not a claim of zero-touch
codemod coverage. Validate alias resolution, mode/theme selection, and runtime
token reads manually until a dedicated adapter exists.

## UnoCSS

There is no dedicated UnoCSS semantic adapter in the built-in catalog yet.
Move the shared theme/token data through the token bridge, then use the
Tailwind-compatible `tw()` path for stable utility usage:

```tsx
// before
<div className="grid place-items-center gap-2" />

// after
<div className={tw({ grid: true, place: "center", gap: "2" })} />
```

Preserve UnoCSS shortcuts, variant groups, transformer syntax, and generated
utilities as explicit review items. A shortcut is not necessarily equivalent
to one Pandwind utility object.

## Emotion

```sh
pnpm exec pandwind-codemod swap --from=emotion --to=css.class --diff --report \
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
pnpm exec pandwind-codemod swap --from=styled-components --to=css.class \
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
pnpm exec pandwind-codemod swap --from=vanilla-extract --to=css.class \
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
pnpm exec pandwind-codemod swap --from=stitches --to=css.class \
  --diff --report 'src/**/*.{ts,tsx}'
```

Map `styled()`/variants to a component recipe and map `$` tokens to preset
tokens. Validate compound variants, responsive variants, `css` prop merging,
and theme switching; these are semantic behaviors rather than simple object
renames.

## Linaria

```sh
pnpm exec pandwind-codemod swap --from=linaria --to=css.class \
  --safe --diff --report 'src/**/*.{ts,tsx,js,jsx}'
```

Static Linaria declarations generally map cleanly to `css.class`. Keep
unsupported compile-time expressions, imported constants, keyframes, globals,
and SSR ordering in the report until the target fixture proves equivalence.

## JSS and React-JSS

```sh
pnpm exec pandwind-codemod swap --from=jss --to=css.class --diff --report \
  'src/**/*.{ts,tsx,js,jsx}'
```

JSS imperative rule application (`sheet.addRule`, dynamic rule updates, and
runtime plugin behavior) needs an explicit runtime target or a component
rewrite. Do not pretend that a static `css.class` call preserves imperative
updates.

## Fela and Goober

```sh
pnpm exec pandwind-codemod swap --from=fela --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod swap --from=goober --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

These adapters cover common object-style declarations. Validate renderer
ordering, keyframes, media queries, hydration IDs, and dynamic interpolation
functions. Use `css.vars()` for values that change without changing rule
shape.

## Aphrodite

```sh
pnpm exec pandwind-codemod swap --from=aphrodite --to=css.class --diff --report \
  'src/**/*.{ts,tsx}'
```

Map `StyleSheet.create` declarations and `css()` composition first. Font-face
arrays, keyframes, and priority/order behavior need authored-rule fixtures;
keep them explicit rather than flattening them into ordinary declarations.

## Treat

```sh
pnpm exec pandwind-codemod swap --from=treat --to=css.class --diff --report \
  'src/**/*.{ts,tsx}'
```

Treat themes and build-time values should become preset tokens and conditions.
Check generated class order and theme file boundaries after conversion.

## Compiled and Style9

```sh
pnpm exec pandwind-codemod swap --from=compiled --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod swap --from=style9 --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

Validate atomic precedence, compile-time restrictions, responsive states, and
the interaction between imported styles and local composition.

## Chakra UI, MUI, and Mantine

These are component-system migrations as well as styling migrations. Start by
converting theme tokens, then convert component props and style objects:

```sh
pnpm exec pandwind-codemod swap --from=chakra --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod swap --from=mui --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod swap --from=mantine --to=css.class --diff --report 'src/**/*.{ts,tsx}'
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
pnpm exec pandwind-codemod swap --from=next-yak --to=css.class --diff --report \
  'src/**/*.{ts,tsx}'
```

Next-yak's compile-time CSS and framework integration should be checked for
server/client boundaries, import ordering, and generated artifact placement.

## Solid and Vue styled systems

```sh
pnpm exec pandwind-codemod swap --from=solid-styled --to=css.class --diff --report 'src/**/*.{ts,tsx}'
pnpm exec pandwind-codemod swap --from=vue-styled --to=css.class --diff --report 'src/**/*.{vue,ts}'
```

Function-valued styles need framework-specific prop and theme wrappers. Keep
reactivity, Vue scoped-style behavior, Solid signals, and SSR boundaries in
framework fixtures; a static declaration rewrite is insufficient.

## Bamboo and React Native

Bamboo uses its adapter and should be checked for its composition/runtime
semantics:

```sh
pnpm exec pandwind-codemod swap --from=bamboo --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

React Native is a separate backend target. Use the source adapter to produce
semantic IR, then validate the RN backend rather than comparing browser CSS:

```sh
pnpm exec pandwind-codemod swap --from=react-native --to=css.class --diff --report 'src/**/*.{ts,tsx}'
```

Platform selectors, layout differences, accessibility props, and unsupported
browser-only declarations must be reported as target capability decisions.

## When the report contains residuals

Residuals are actionable when they identify a source location, semantic kind,
reason, target capability, and suggested strategy. The usual fixes are:

- replace a runtime interpolation with `css.vars()` or a custom property;
- rewrite a styled subject into an explicit host component;
- map a theme read into a preset token or target theme provider;
- preserve globals/keyframes/font-face as authored CSS;
- register a source plugin transform for framework syntax; or
- choose a runtime-capable backend instead of forcing static extraction.

Never delete a residual just to make the migration report green. Add a
fixture, implement the adapter/lowering, or document the intentional manual
boundary. See [adapter contracts](/reference/adapter-contract/) and
[compatibility](/interop/compatibility/).
