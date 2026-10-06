---
title: Theming
description: Theme scopes on tokens, component tokens, and data-theme switching with zero utility changes.
sidebar:
  order: 5
---

## Theme scopes

Themes let the same component use different values without changing its
class names. Put the values in your preset, then switch the active theme by
changing one data-theme attribute on a parent element.

Declare theme scopes on your tokens module:

```ts
themes: {
	dark: { "--color-surface": "#0b0b10" },
}
```

Codegen emits deterministic `[data-theme="…"]` override blocks next to the
`@theme` bridge. Utilities keep referencing `var(--color-surface)`; switching
is a `data-theme` attribute flip with zero utility CSS changes.

The inspector applies the same rule to authored CSS. It follows reachable
`@import` files and preserves any flat selector block containing only custom
properties as an explicit scope, including scopes supplied by a package
stylesheet. It never assumes that a scope is named `dark` or uses a fixed
theme-file list.

## Component token contracts

Component tokens are a third layer above raw and semantic tokens. They are
string references owned by the design system, so a component can bind a
stable contract without importing a JavaScript token map:

```ts
// tokens.ts — the design-system package
import { define, type YumCSSProperties } from "yumcss/preset";

const rawTokens = define.tokens({
	colors: {
		"$gray-200": "#e5e7eb",
		"$gray-700": "#374151",
		"$red-500": "#dc2626",
	},
	spacing: { 4: "1rem" },
	radii: { md: "0.5rem" },
	borders: { thin: "1px" },
	shadows: { card: "0 12px 24px rgb(0 0 0 / 0.16)" },
});

const themeConditions = { base: "", _dark: '[data-theme="dark"] &' };

const baseTokens = define.tokens({
	colors: rawTokens.colors,
	spacing: rawTokens.spacing,
	radii: rawTokens.radii,
	borders: rawTokens.borders,
	shadows: rawTokens.shadows,
	component: {
		"component.card.borderWidth": "semantic.border.width.default",
		"component.card.border": "semantic.border.default",
		"component.card.radius": "semantic.radius.card",
		"component.card.shadow": "semantic.shadow.card",
		"component.card.padding": "semantic.space.card.padding",
		"component.state.errorText": "semantic.fg.error",
	},
});

const semanticTokens = baseTokens.defineSemanticTokens(themeConditions, {
	semantic: {
		"bg.muted": { base: rawTokens.colors["$gray-200"], _dark: rawTokens.colors["$gray-700"] },
		"fg.error": { base: rawTokens.colors["$red-500"], _dark: "#fca5a5" },
		"border.default": {
			base: rawTokens.colors["$gray-200"],
			_dark: rawTokens.colors["$gray-700"],
		},
		"border.width.default": { base: rawTokens.borders.thin, _dark: rawTokens.borders.thin },
		"radius.card": { base: rawTokens.radii.md, _dark: rawTokens.radii.md },
		"shadow.card": {
			base: rawTokens.shadows.card,
			_dark: "0 12px 24px rgb(0 0 0 / 0.32)",
		},
		"space.card.padding": { base: rawTokens.spacing[4], _dark: rawTokens.spacing[4] },
	},
});

const tokens = semanticTokens.defineSemanticTokens(themeConditions, {
	component: {
		"component.state.emptyBg": {
			base: "semantic.bg.muted",
			_dark: "semantic.bg.primary",
		},
		"component.state.hoverBg": {
			base: "semantic.bg.primary",
			_dark: "semantic.bg.muted",
		},
		"component.state.hoverText": {
			base: "semantic.fg.on-primary",
			_dark: "semantic.fg.error",
		},
	},
});

const cssConfig: YumCSSProperties = {};

export const preset = define.preset(
	{ config: cssConfig, tokens },
	{
		strict: true,
		conditions: themeConditions,
		properties: {
			borderStyle: true,
			borderWidth: { $tokens: "component" },
			borderColor: { $tokens: "component" },
			borderRadius: { $tokens: "component" },
			backgroundColor: { $tokens: "component" },
			color: { $tokens: "component" },
			boxShadow: { $tokens: "component" },
			padding: { $tokens: "component" },
		},
	},
);
```

The component uses those paths directly:

```tsx
import { createCss } from "yumcss/css";
import { preset } from "./tokens";

const css = createCss(preset);

const EmptyState = ({ title }: { title: string }) => (
	<section
		className={css.class({
			borderStyle: "solid",
			borderWidth: "component.card.borderWidth",
			borderColor: "component.card.border",
			borderRadius: "component.card.radius",
			backgroundColor: "component.state.emptyBg",
			color: "component.state.errorText",
			boxShadow: "component.card.shadow",
			padding: "component.card.padding",
			_hover: {
				backgroundColor: "component.state.hoverBg",
				color: "component.state.hoverText",
			},
		})}
	>
		{title}
	</section>
);
```

The component owns no raw color and does not choose between semantic roles at
runtime. A component token may be a single string alias, such as
`component.card.radius`, or a condition map. Here `component.state.emptyBg`
uses `semantic.bg.muted` in the base scope and `semantic.bg.primary` in the
dark scope; `component.state.hoverBg` makes the opposite choice. YumCSS
emits one component variable with condition-scoped aliases to the semantic
variables. Switching `data-theme` changes those references without changing
the component, its props, or its class name. The string refs are checked
because each property is bound to the preset's `component` token group.

If a particular component benefits from JavaScript composition, a typed
identifier map is also valid:

```ts
const namedRefs = { background: "component.state.emptyBg" } as const;
css.class({ backgroundColor: namedRefs.background });
```

That is a separate convenience pattern. The component-token contract itself is
the string layer above semantic tokens, which keeps the component from paying
for an imported contract object.

When a layer value comes from a raw token, distinguish a token-path reference
such as `"colors.$gray-700"` from a JavaScript lookup such as
`rawTokens.colors["$gray-700"]`. The first preserves the alias and theme
relationship; the second copies the current value as a literal. See
[Token paths versus resolved values](/api/presets/#token-paths-versus-resolved-values).

## Color palettes and theme roles

Color palettes are a separate role layer for color-only APIs. Compose the
palette definitions from the same token catalog as semantic and component
tokens, then attach them to the preset:

```ts
const colorPalettes = tokens.defineColorPalettes({
	brand: {
		muted: "colors.$gray-200",
		solid: "colors.$gray-700",
		contrast: "colors.$gray-200",
	},
});

export const preset = define.preset(
	{ config: cssConfig, tokens },
	{
		strict: true,
		conditions: themeConditions,
		properties: {
			backgroundColor: { $tokens: "colors" },
			color: { $tokens: "colors" },
		},
		colorPalettes,
	},
);
```

Components can select `colorPalette: "brand"` on a parent and use
`colorPalette.muted`, `colorPalette.solid`, or `colorPalette.contrast` for
`backgroundColor` and `color`. The palette supplies stable roles while the
theme still owns the underlying token values. See [Presets](/api/presets/#color-palettes)
for string-source palettes that expose a whole color subtree and object-source
palettes that map explicit roles.

## Codegen component scopes

The Tailwind bridge also supports a separate `components` export for applying
semantic-variable overrides to an entire component scope:

```ts
export const designSystem = {
	components: {
		button: {
			primary: "$color-brand",
		},
	},
};
```

Codegen emits `.pwc-button { --color-primary: … }`. Add that generated scope
class to the target component and existing utilities restyle through the
rebound variable; theme scopes compose naturally (`[data-theme] × .pwc-*`).
This scope export is build-time metadata. It complements direct component
token references; it is not a reason to put runtime ternaries in a component.
