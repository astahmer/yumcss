---
title: Theming
description: Theme scopes on tokens, component tokens, and data-theme switching with zero utility changes.
sidebar:
  order: 5
---

## Theme scopes

Declare theme scopes on your tokens module:

```ts
themes: {
	dark: { "--color-surface": "#0b0b10" };
}
```

Codegen emits deterministic `[data-theme="…"]` override blocks next to the
`@theme` bridge. Utilities keep referencing `var(--color-surface)`; switching
is a `data-theme` attribute flip with zero utility CSS changes.

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
