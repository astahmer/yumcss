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

Component tokens should be references, not another place to put raw colors.
Bind the references directly to the component's styles:

```tsx
import { createCss } from "pandwind/css";
import { preset } from "./preset";
// This module belongs to the design-system package, not the component.

const css = createCss(preset);

const componentTokens = {
	emptyState: {
		border: "border.default",
		background: "bg.muted",
		foreground: "fg.error",
		padding: "card.padding",
		radius: "card.radius",
	},
} as const;

const EmptyState = ({ title }: { title: string }) => (
	<section
		className={css.class({
			borderColor: componentTokens.emptyState.border,
			backgroundColor: componentTokens.emptyState.background,
			color: componentTokens.emptyState.foreground,
			padding: componentTokens.emptyState.padding,
			borderRadius: componentTokens.emptyState.radius,
		})}
	>
		{title}
	</section>
);
```

The component owns the contract (`emptyState.background`), while the preset
owns what `bg.muted` means in each theme. Switching `data-theme` changes the
resolved value without changing the component, its props, or its class name.
There is no runtime color ternary here: a component token is a typed reference
that is checked when it is bound to the preset-aware `css` function.

The names above are illustrative aliases. Your preset must expose the matching
semantic/component values for each property. Keep the reference map in the
design-system package so product components consume the contract instead of
repeating token paths.

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
