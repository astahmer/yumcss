---
title: Preset contracts and typing
description: Understand config types, token bindings, strictness, and theme conditions in definePreset.
sidebar:
  order: 4
---

`definePreset` is where a token vocabulary becomes a typed styling contract.
It does not create a second styling API: it describes the values that
`createCss(preset)`, `createDesignCss(preset)`, and the stylesheet compiler are
allowed to resolve.

## The mental model

Keep the four responsibilities separate:

| helper | owns | what it changes |
| --- | --- | --- |
| `defineTokens` | raw and semantic token values | preserves token groups and names |
| `defineTheme` | values plus the CSS config type | preserves the theme's literal types; it is a zero-cost identity at runtime |
| `definePreset` | conditions, property bindings, and strictness | adds the rules used to type and resolve style objects |
| `createCss(preset)` | the consumer | returns a CSS function whose props and values follow the preset |

The preset is the boundary between an open-ended CSS function and a design
system. A bare `createCss()` still accepts runtime CSS values, but it cannot
know which token names or conditions belong to your application.

## A complete typed preset

This is a small preset with all standard CSS properties available, while the
three properties used by the design system also accept named token references.

```ts
import type { StandardProperties } from "csstype";
import { createCss } from "pandwind/css";
import {
	definePreset,
	defineProperties,
	defineTheme,
	defineTokens,
} from "pandwind/preset";

const tokens = defineTokens({
	colors: {
		"$brand-500": "#2563eb",
		"$surface": "#ffffff",
	},
	spacing: {
		4: "1rem",
	},
});

const properties = defineProperties({
	$all: true,
	backgroundColor: { $tokens: "colors", $strictness: "inherits" },
	color: { $tokens: "colors", $strictness: "inherits" },
	padding: { $tokens: "spacing", $strictness: "inherits" },
});

const preset = definePreset(
	defineTheme({ config: {} as StandardProperties, tokens }),
	{
		strict: true,
		conditions: {
			_hover: "&:hover",
			_dark: ".dark &",
		},
		properties,
	},
);

const css = createCss(preset);

css.class({
	backgroundColor: "$brand-500",
	padding: 4,
	color: "var(--runtime-ink)",
	_hover: { backgroundColor: "$surface" },
});
```

The `$tokens` entries bind a CSS property to a token group. The
`$strictness: "inherits"` entries deliberately allow both that token group
and the raw value type from `StandardProperties`.

## What belongs in `config`?

`config` is a type witness for the CSS properties and raw values your preset
understands. `defineTheme` returns the object unchanged; `{} as
StandardProperties` does not create a runtime object full of CSS properties.

| config type | use it when |
| --- | --- |
| `{} as StandardProperties` | the preset should describe ordinary web CSS with `csstype`'s property names and value types |
| `{} as Pick<StandardProperties, "color" \| "padding">` | the preset intentionally exposes a small, closed CSS surface |
| `{} as Record<string, never>` | mapped properties should be token-only and there should be no raw CSS value vocabulary |
| `{} as Record<string, unknown>` | an integration boundary truly has an open record; expect weaker property/value checking |

Use `StandardProperties` for a normal web design system. Use `Pick` when the
package owns a deliberately small contract. A broad record is useful at a
migration or compatibility boundary, not as a substitute for a design-system
type.

## What does `properties` do?

`properties` has two jobs: it selects which CSS property names appear in a
preset-aware style object, and it tells Pandwind which token names can resolve
for each property.

### `true`: use the config's raw values

```ts
const properties = defineProperties({
	borderRadius: true,
});
```

`borderRadius: true` uses `StandardProperties["borderRadius"]`. It does not
attach a token group, and `strict` does not turn it into a token-only property.

### A token map: bind a property to a group

```ts
const properties = defineProperties({
	backgroundColor: { $tokens: "colors" },
	padding: { $tokens: "spacing" },
});
```

`$tokens` is a string reference to a group in the theme. It is useful when the
component should write a token path such as `"component.card.padding"`
without importing a JavaScript token object. A local map is also supported
when a preset intentionally wants to author the values beside the property:

```ts
const properties = defineProperties({
	color: {
		"$brand-500": "#2563eb",
		"$muted": "#64748b",
	},
});
```

The local-map form and `$tokens` form produce the same kind of typed binding;
the latter avoids copying a token group into every property entry.

### `$all: true`: add property names, not token bindings

`$all: true` adds every property from `config` to the style surface. It does
not automatically bind every token group to every property.

```ts
const properties = defineProperties({
	$all: true,
	color: { $tokens: "colors", $strictness: "inherits" },
});

// color accepts the colors group and raw StandardProperties["color"] values.
// padding is available because of $all, but it accepts its config values only
// until padding receives an explicit $tokens mapping.
```

This distinction keeps `$all` useful for a general CSS preset without making
unrelated tokens valid for every CSS property.

## How `strict` and `$strictness` combine

For a mapped property such as
`backgroundColor: { $tokens: "colors" }`, the value rules are:

| preset setting | accepted values |
| --- | --- |
| `strict: true` | token names from the mapped group (plus color opacity modifiers) |
| `strict: false` | token names and raw values from `config` |
| `strict: true` with `$strictness: "inherits"` | token names and raw values from `config` for that property |
| property value `true` | raw values from `config`, regardless of `strict` |

Use `strict: true` when the preset is the design-system boundary and every
mapped value should be intentional. Use `strict: false` for an open preset or
when raw CSS values are part of the contract. Use `$strictness: "inherits"`
when most of the preset is strict but one mapped property needs a controlled
raw escape without giving up its token names.

The distinction is visible at the call site:

```ts
const css = createCss(preset);

css.class({ backgroundColor: "$brand-500" });
css.class({ backgroundColor: "var(--brand-from-host)" });
```

The second call is valid in the complete preset above because that property
explicitly inherits the raw `StandardProperties` value type. Remove
`$strictness: "inherits"` and the same call becomes a type error while the
token call remains valid.

## Theme values and semantic/component layers

Conditions belong to the preset, while condition-aware semantic values belong
to the theme. A component token can then point at a semantic token by string
reference:

```ts
import { defineSemanticTokens } from "pandwind/preset";
import { tokens } from "./tokens";

const conditions = {
	base: "",
	_dark: ".dark &",
};

const semantic = defineSemanticTokens(conditions, {
	colors: {
		surface: { base: tokens.colors["$surface"], _dark: "#111827" },
	},
});

const themedTokens = {
	...tokens,
	semantic: semantic.colors,
	component: {
		"component.card.background": "semantic.surface",
	},
};
```

The component can bind `backgroundColor` to `component` and write
`"component.card.background"`. It does not choose a light or dark literal in
JavaScript. The active theme scope changes the semantic value instead. See
[Theming](/api/theming/) for the full component-contract example.

## Keep the examples honest

Static docs code blocks are syntax-highlighted by Starlight's built-in
Expressive Code/Shiki pipeline. Highlighting is not TypeScript IntelliSense:
for hover information and live errors, use the repository Playground, where
the same package declarations power Monaco. The examples on this page are
also mirrored by package type tests so changes to the preset contract cannot
quietly make the documentation stale.
