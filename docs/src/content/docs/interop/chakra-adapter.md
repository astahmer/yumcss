---
title: Chakra UI adapter
description: Verified Chakra UI styling forms and their YumCSS migration behavior.
---

# Chakra UI adapter

This page records the Chakra UI APIs that YumCSS treats as migration inputs
or outputs. The list is based on Chakra's official v3 documentation, not on
names guessed from package exports.

## Verified user-facing forms

| Form                               | Example                                                             | YumCSS behavior                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Style props                        | `<Box bg="red.200" p="4" />`                                        | Extracts the props into the semantic style program.                                                                                          |
| `css` prop                         | `<Box css={{ "& svg": { color: "red.500" } }} />`                   | Extracts nested style objects and conditions.                                                                                                |
| Chakra factory                     | `<chakra.button bg="blue.500" />`                                   | Treats the factory host like any other Chakra style-prop host.                                                                               |
| `system.css` / `defaultSystem.css` | `system.css({ color: "red.500" })`                                  | Recognizes the documented interop utility and lowers its returned style object. It is never treated as a class-name string.                  |
| Recipes                            | `defineRecipe({ base, variants })` and `system.cva(...)`            | Emits an explicit composition residual until a recipe-aware target is selected; it must not be flattened into an ordinary style declaration. |
| Slot recipes                       | `defineSlotRecipe({ slots, base, variants })` and `system.sva(...)` | Preserves multi-part composition as an explicit residual; slot ownership and variant output need a component-aware target.                   |
| Token helpers                      | `system.token(...)` and `system.token.var(...)`                     | Supplies theme context to style programs; it is not itself a style carrier. Token resolution is validated through the loaded system/config.  |

Chakra documents style props as the fundamental styling interface in the
[styling overview](https://chakra-ui.com/docs/styling/overview). The
[Chakra factory](https://chakra-ui.com/docs/styling/chakra-factory) provides
`chakra.div`, `chakra.button`, and `chakra("a", ...)` for host projection.
The documented [`css` prop](https://chakra-ui.com/docs/theming/overview) is a
style-object carrier, including nested selectors.

Chakra also documents `defineRecipe`/`defineSlotRecipe`, `system.cva`/`system.sva`,
and `system.token`/`system.token.var` as separate recipe and theme-context
facilities. They are intentionally tracked separately from ordinary style
objects because flattening a recipe or slot recipe can change variant,
compound-variant, and component behavior.

`system.css` is also an official API, but it is an interop conversion utility:
the [theming overview](https://chakra-ui.com/docs/theming/overview) describes
it as converting Chakra style objects into CSS style objects that can be
passed to another styling library. Since its result is an object, a migration
must not emit it as `className={...}`. YumCSS uses `css={...}` on a Chakra
host, or `chakra.<intrinsic>` when the source host is a native JSX element.

## Themes and custom systems

Chakra's [customization guide](https://chakra-ui.com/docs/theming/customization/overview)
defines custom systems with `defineConfig` and `createSystem(defaultConfig,
config)`, then supplies the result through `ChakraProvider value={system}`.
YumCSS's project loader reads an existing project system/config when it can,
and uses that context for token normalization. A missing or unevaluable
configuration is reported as a configuration residual; the adapter does not
silently replace a project's custom theme with a default system.

## Proof contract

`packages/codemod/tests/chakra-official-api.test.ts` snapshots every verified
form above, with executable assertions for conversion, residuals, and output
shape. The tests deliberately assert that no Chakra style object appears in a
`className` carrier. Recipe residuals are part of the contract until explicit
variant/component lowering is available.
