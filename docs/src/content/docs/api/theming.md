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

## Component tokens

Component tokens stack on top of theme scopes:

```ts
components: {
	button: {
		primary: "$color-brand";
	}
}
```

Codegen emits `.pwc-button { --color-primary: … }` scope classes — every
existing utility restyles per component, and theme scopes compose naturally
(`[data-theme]` × `.pwc-*`).
