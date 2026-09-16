---
title: Preset contracts and typing
description: Understand config types, token bindings, strictness, and theme conditions in define.preset.
sidebar:
  order: 4
---

`define.preset` is where a token vocabulary becomes a typed styling contract.
It does not create a second styling API: it describes the values that
`createCss(preset)`, `createDesignCss(preset)`, and the stylesheet compiler are
allowed to resolve.

Pandwind uses a bring-your-own-types (BYOT) boundary for CSS properties. It
does not maintain a second CSS value grammar: `config` is a type witness
supplied by the application or design-system package.

## The mental model

Keep the four responsibilities separate:

| helper              | owns                                          | what it changes                                                            |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| `define.tokens`     | raw and semantic token values                 | preserves token groups and names                                           |
| `define.conditions` | condition names and selectors                 | preserves the condition vocabulary                                         |
| `define.properties` | property-to-token bindings                    | preserves the property vocabulary                                          |
| `define.theme`      | values plus the CSS config type               | preserves the theme's literal types; it is a zero-cost identity at runtime |
| `define.preset`     | conditions, property bindings, and strictness | adds the rules used to type and resolve style objects                      |
| `createCss(preset)` | the consumer                                  | returns a CSS function whose props and values follow the preset            |

The preset is the boundary between an open-ended CSS function and a design
system. The safe `pandwind/css` entrypoint requires that preset. If properties
are discovered at runtime, import `createUnsafeCss` from
`pandwind/unsafe/css`; its lack of a catalog is then visible at the call site.

Use `define.theme` when a theme is named, exported, or composed independently.
When the theme is only passed to one `define.preset` call, inline the
`{ config, tokens }` object. Both forms are equivalent at runtime; the direct
form keeps a small preset easy to read.

## Choose a built-in preset layer

Pandwind keeps its built-in choices in explicit tiers so a structural CSS
contract does not silently become a design-token contract:

| preset          | import                     | use it for                                                |
| --------------- | -------------------------- | --------------------------------------------------------- |
| `csstypePreset` | `pandwind/preset/csstype`  | tokenless structural CSS with values owned by your app    |
| `defaultPreset` | `pandwind/preset/default`  | the ordinary Pandwind app with stock scales               |
| `examplePreset` | `@pandwind/example-preset` | the repository's rich semantic-token and palette showcase |

The csstype preset uses the common `csstype` property grammar and default
conditions, but its `tokens` map and property-token bindings are empty. A
value such as `"red.500"` therefore remains authored CSS. The default preset
keeps Pandwind's stock property mappings, so the same value can resolve through
the built-in scale:

```ts
import { createCss } from "pandwind/css";
import { csstypePreset } from "pandwind/preset/csstype";
import { defaultPreset } from "pandwind/preset/default";

const csstypeCss = createCss(csstypePreset);
const defaultCss = createCss(defaultPreset);

csstypeCss.class({ color: "red.500", padding: "1rem" });
defaultCss.class({ color: "red.500", padding: 4 });
```

Use `csstypePreset` when the application or a published design system supplies its
own token catalog. Use `defaultPreset` when you want Pandwind's ready-to-use
values. The example package is deliberately separate and should remain a
showcase fixture rather than an implicit default dependency.

## A complete typed preset

This is a small preset with Pandwind's curated common CSS properties available,
while the three properties used by the design system also accept named token
references.

```ts
import { createCss } from "pandwind/css";
import { define, type PandwindProperties } from "pandwind/preset";

const tokens = define.tokens({
	colors: {
		"$brand-500": "#2563eb",
		$surface: "#ffffff",
	},
	spacing: {
		4: "1rem",
	},
});

const properties = define.properties({
	$all: true,
	backgroundColor: { $tokens: "colors", $strictness: "inherits" },
	color: { $tokens: "colors", $strictness: "inherits" },
	padding: { $tokens: "spacing", $strictness: "inherits" },
});

const cssConfig: PandwindProperties = {};

const preset = define.preset(
	{ config: cssConfig, tokens },
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
and the raw value type from Pandwind's curated `PandwindProperties` contract.

## Bring your own CSS type

Use Pandwind's curated `PandwindProperties` for the common web case. When a
preset needs the complete CSS grammar or a specialized variant, bring that
type directly from `csstype`:

```ts
import { createCss } from "pandwind/css";
import { define } from "pandwind/preset";
import type { StandardProperties as CsstypeStandardProperties } from "csstype";

type CardProperties = Pick<CsstypeStandardProperties, "backgroundColor" | "color" | "padding">;

const tokens = define.tokens({
	colors: { "$brand-500": "#2563eb" },
	spacing: { 4: "1rem" },
});

const cardConfig: CardProperties = {};

const cardPreset = define.preset(
	{ config: cardConfig, tokens },
	{
		strict: true,
		conditions: {},
		properties: {
			backgroundColor: { $tokens: "colors", $strictness: "inherits" },
			color: { $tokens: "colors", $strictness: "inherits" },
			padding: { $tokens: "spacing", $strictness: "inherits" },
		},
	},
);

const css = createCss(cardPreset);
css.class({
	backgroundColor: "$brand-500",
	color: "var(--runtime-ink)",
	padding: 4,
});
```

`Pick` makes the package boundary explicit: this component contract exposes
three CSS properties, while the values still come from the complete CSS type.
Use Pandwind's `PandwindProperties` directly for its curated common surface.
For a custom or third-party property vocabulary, compose your own type instead:

```ts
type AppProperties = CsstypeStandardProperties & Record<`--${string}`, string>;
```

That custom-property extension describes the host values your application
owns; it does not turn runtime values into tokens. For specialized `csstype`
variants such as hyphenated, SVG, vendor, or custom generic forms, import the
variant directly from `csstype`. Pandwind's BYOT boundary accepts those types
without converting them into a Pandwind-specific CSS grammar.

## What belongs in `config`?

`config` is a type witness for the CSS properties and raw values your preset
understands. `define.theme` returns the object unchanged; an empty typed config
does not create a runtime object full of CSS properties.

| config type                                      | use it when                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `PandwindProperties`                             | the preset should expose Pandwind's curated common CSS surface                          |
| `Pick<PandwindProperties, "color" \| "padding">` | the preset intentionally exposes an even smaller, closed CSS surface                    |
| `Record<string, never>`                          | mapped properties should be token-only and there should be no raw CSS value vocabulary  |
| `Record<string, unknown>`                        | an integration boundary truly has an open record; expect weaker property/value checking |

Use Pandwind's `PandwindProperties` for a normal web design system. Use `Pick`
when the package owns a deliberately small contract. Import the full
`StandardProperties` directly from `csstype` only when the long-tail grammar is
intentional. A broad record is useful at a migration or compatibility boundary,
not as a substitute for a design-system type.

## What does `properties` do?

`properties` has two jobs: it selects which CSS property names appear in a
preset-aware style object, and it tells Pandwind which token names can resolve
for each property.

### `true`: use the config's raw values

```ts
const properties = define.properties({
	borderRadius: true,
});
```

`borderRadius: true` uses `PandwindProperties["borderRadius"]`. It does not
attach a token group, and `strict` does not turn it into a token-only property.

### A token map: bind a property to a group

```ts
const properties = define.properties({
	backgroundColor: { $tokens: "colors" },
	padding: { $tokens: "spacing" },
});
```

`$tokens` is a string reference to a group in the theme. It is useful when the
component should write a token path such as `"component.card.padding"`
without importing a JavaScript token object. A local map is also supported
when a preset intentionally wants to author the values beside the property:

```ts
const properties = define.properties({
	color: {
		"$brand-500": "#2563eb",
		$muted: "#64748b",
	},
});
```

The local-map form and `$tokens` form produce the same kind of typed binding;
the latter avoids copying a token group into every property entry.

### `$all: true`: add property names, not token bindings

`$all: true` adds every property from `config` to the style surface. It does
not automatically bind every token group to every property.

```ts
const properties = define.properties({
	$all: true,
	color: { $tokens: "colors", $strictness: "inherits" },
});

// color accepts the colors group and raw PandwindProperties["color"] values.
// padding is available because of $all, but it accepts its config values only
// until padding receives an explicit $tokens mapping.
```

This distinction keeps `$all` useful for a general CSS preset without making
unrelated tokens valid for every CSS property.

## How `strict` and `$strictness` combine

For a mapped property such as
`backgroundColor: { $tokens: "colors" }`, the value rules are:

| preset setting                                | accepted values                                                  |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `strict: true`                                | token names from the mapped group (plus color opacity modifiers) |
| `strict: false`                               | token names and raw values from `config`                         |
| `strict: true` with `$strictness: "inherits"` | token names and raw values from `config` for that property       |
| property value `true`                         | raw values from `config`, regardless of `strict`                 |

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
explicitly inherits the raw `PandwindProperties` value type. Remove
`$strictness: "inherits"` and the same call becomes a type error while the
token call remains valid.

## Theme values and semantic/component layers

Conditions belong to the preset, while condition-aware semantic values belong
to the theme. A component token can point at one semantic token by string
reference, or choose different semantic tokens for different conditions:

```ts
import { define } from "pandwind/preset";
import { tokens } from "./tokens";

const conditions = {
	base: "",
	_dark: ".dark &",
};

const baseTokens = define.tokens({
	colors: tokens.colors,
	component: {
		"component.card.background": "semantic.surface",
	},
});

const semanticTokens = baseTokens.defineSemanticTokens(conditions, {
	semantic: {
		surface: { base: "colors.$surface", _dark: "#111827" },
		inverseSurface: { base: "#111827", _dark: "colors.$surface" },
	},
});

const themedTokens = semanticTokens.defineSemanticTokens(conditions, {
	component: {
		"component.card.interactiveBackground": {
			base: "semantic.surface",
			_dark: "semantic.inverseSurface",
		},
	},
});
```

The component can bind `backgroundColor` to `component` and write either
`"component.card.background"` or
`"component.card.interactiveBackground"`. The latter remains one stable
component contract while its base and dark scopes refer to different semantic
roles. The component does not choose a light or dark literal in JavaScript;
the active theme scope changes the component variable's semantic reference.
See [Theming](/api/theming/) for the full component-contract example.

Here the empty `base` condition is needed because `.defineSemanticTokens` uses
`base` as a typed default branch. An ordinary preset condition map does not
need a `base: ""` entry: top-level styles already use the base scope.

### Token paths versus resolved values

A token catalog exposes both its current JavaScript values and typed path
strings. They are intentionally different inputs. Use a path string when a
semantic, component, or palette role should keep pointing at the raw token;
use a JavaScript lookup when you intentionally want to copy the current value
as a literal.

```ts
import { define } from "pandwind/preset";

const tokens = define.tokens({
	colors: {
		"$blue-600": "#2563eb",
		"$blue-700": "#1d4ed8",
	},
});

const conditions = define.conditions({ base: "", _dark: ".dark &" });

const themedTokens = tokens.defineSemanticTokens(conditions, {
	semantic: {
		brand: {
			base: "colors.$blue-600",
			_dark: "colors.$blue-700",
		},
		snapshotBrand: {
			base: tokens.colors["$blue-600"],
			_dark: tokens.colors["$blue-700"],
		},
	},
});
```

| Form                         | Meaning                        | Emitted semantic value                                  |
| ---------------------------- | ------------------------------ | ------------------------------------------------------- |
| `"colors.$blue-600"`         | Typed token-path reference     | A `var(...)` reference to the raw token custom property |
| `tokens.colors["$blue-600"]` | Current JavaScript token value | The literal `#2563eb`                                   |

The exact custom-property name may be hashed, but the distinction remains: a
path preserves the alias and its theme/dependency relationship, while a lookup
does not. The lookup form is useful for an intentional snapshot or a derived
literal. For stable design-system relationships, prefer the path form; its
group, token name, and condition keys are checked against the catalog.

## Color palettes

Color palettes are named roles over the preset's `colors` tokens. Define them
on the token catalog so both palette names and token references are checked,
then pass the returned map to `define.preset`:

```ts
import { createCss } from "pandwind/css";
import { define } from "pandwind/preset";

const tokens = define.tokens({
	colors: {
		"$blue-50": "#ebf8ff",
		"$blue-600": "#2b6cb0",
		$white: "#ffffff",
	},
});

const colorPalettes = tokens.defineColorPalettes({
	brand: {
		muted: "colors.$blue-50",
		solid: "colors.$blue-600",
		contrast: "colors.$white",
	},
});

const preset = define.preset(
	{ config: {}, tokens },
	{
		strict: true,
		conditions: { base: "" },
		properties: {
			backgroundColor: { $tokens: "colors" },
			color: { $tokens: "colors" },
		},
		colorPalettes,
	},
);

const css = createCss(preset);

css.class({
	colorPalette: "brand",
	backgroundColor: "colorPalette.muted",
	color: "colorPalette.contrast",
});
```

A string source such as `"colors.blue"` exposes every descendant color under
that path. Use an object source when the palette should publish stable roles
such as `muted`, `solid`, and `contrast` from unrelated color tokens. Select a
palette on an element or ancestor with `colorPalette`; the
`colorPalette.<role>` values then resolve through the palette's custom
properties. Static extraction emits only the selected palette assignments, and
the runtime-sheet API follows the same mapping.

## Keep the examples honest

Static docs code blocks are syntax-highlighted by Starlight's built-in
Expressive Code/Shiki pipeline. Highlighting is not TypeScript IntelliSense:
for hover information and live errors, use the repository Playground, where
the same package declarations power Monaco. The examples on this page are
also mirrored by package type tests so changes to the preset contract cannot
quietly make the documentation stale.
