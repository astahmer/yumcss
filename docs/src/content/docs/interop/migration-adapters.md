---
title: Adapter migration recipes
description: Examples for migration routes beyond the most common project paths.
sidebar:
  order: 4
---

These recipes cover a broad set of source ecosystems. A listed route does not
promise complete framework parity: review each adapter’s [safety notes](/interop/css-in-js-adapters/)
and the diagnostics from a dry run. Keep unsupported behavior in the source
until the target behavior is verified.

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
