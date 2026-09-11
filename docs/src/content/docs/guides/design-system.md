---
title: Build a design system
description: Create a typed token, theme, condition, and component contract with pandwind.
sidebar:
  order: 3
---

A Pandwind design system has one source of truth: tokens and semantic rules
are defined once, then consumed by `tw()`, `css()`, design `css()`, codegen,
and migration adapters. Keep the vocabulary small enough to teach and strict
enough to prevent accidental values.

## 1. Organize the package

```text
src/
  design-system/
    tokens.ts
    preset.ts
    conditions.ts
    index.ts
  tw.ts                 # generated typed runtime binding
  bridge.ts             # optional generated Tailwind class strategy
  tailwind.css
```

Export the preset from a stable module. Applications, component packages,
Vite, codegen, and codemods should all consume that same module.

The generated `bridge.ts` is not imported automatically by Pandwind. It stays
build-time/migration metadata unless the application explicitly selects its
`twAdapter` for Tailwind class output.

## 2. Define tokens

```ts
// src/design-system/tokens.ts
import { defineTokens } from "pandwind/preset";

export const tokens = defineTokens({
	colors: {
		$canvas: "#ffffff",
		$ink: "#111827",
		$muted: "#6b7280",
		$brand: "#2563eb",
		$onBrand: "#ffffff",
	},
	spacing: {
		1: "4px",
		2: "8px",
		3: "12px",
		4: "16px",
		6: "24px",
		8: "32px",
	},
	radii: {
		sm: "4px",
		md: "8px",
		lg: "12px",
		full: "9999px",
	},
	fonts: {
		sans: "ui-sans-serif, system-ui, sans-serif",
	},
});
```

Use token names that express intent when a value is semantic (`$brand`) and
scale names when a value is structural (`spacing.4`). Avoid exposing the
underlying hex or pixel value in component code.

## 3. Create a preset

```ts
// src/design-system/preset.ts
import {
	definePreset,
	defineProperties,
	defineTheme,
	type StandardProperties,
} from "pandwind/preset";
import { tokens } from "./tokens";

const theme = defineTheme({
	config: {} as StandardProperties,
	tokens,
});

const properties = defineProperties({
	$all: true,
	backgroundColor: { $tokens: "colors", $strictness: "inherits" },
	color: { $tokens: "colors", $strictness: "inherits" },
	padding: { $tokens: "spacing", $strictness: "inherits" },
});

export const preset = definePreset(theme, {
	strict: true,
	conditions: {
		_hover: "&:hover",
		_focusVisible: "&:focus-visible",
		_dark: ".dark &",
		sm: "@media (min-width: 640px)",
	},
	properties,
});
```

`strict: true` makes mapped properties use their token vocabulary. `$all: true`
adds the remaining CSS property names, but it does not bind every token group
to every property. Bind the properties that should accept tokens explicitly;
the [preset typing guide](/api/presets/) explains the strictness matrix and
the raw-value escape options.

## 4. Generate the Tailwind bridge

```json
{
	"scripts": {
		"tw:generate": "pandwind-codemod tw generate ./src/tailwind.css ./src --tokens ./src/design-system/preset.ts --bridge",
		"tw:scan": "pandwind-codemod tw scan ./src/tw.ts ./src ./src/pandwind.safelist.css"
	}
}
```

```sh
pnpm run tw:generate
pnpm run tw:scan
```

The bridge lets the same semantic style code lower to Tailwind. You can use
the exact preset with `createCss` or `createDesignCss` for an atomic or design
lane without creating a second token source.

## 5. Add themes and semantic tokens

Put light/dark behavior in conditions and semantic tokens rather than
duplicating component styles:

```ts
import { defineSemanticTokens } from "pandwind/preset";

const semanticConditions = {
	base: "",
	_dark: ".dark &",
	_highContrast: "@media (prefers-contrast: more)",
};

const semanticTokens = defineSemanticTokens(
	semanticConditions,
	{
		semantic: {
			"bg.muted": { base: tokens.colors.$canvas, _dark: tokens.colors.$ink },
			"fg.error": { base: "#b91c1c", _dark: "#fca5a5" },
			"border.default": { base: tokens.colors.$muted, _dark: tokens.colors.$muted },
			"border.width.default": { base: "1px", _dark: "1px" },
			"radius.card": { base: tokens.radii.md, _dark: tokens.radii.md },
			"shadow.card": {
				base: "0 12px 24px rgb(17 24 39 / 0.16)",
				_dark: "0 12px 24px rgb(0 0 0 / 0.32)",
			},
			"space.card.padding": { base: tokens.spacing[4], _dark: tokens.spacing[4] },
		},
	},
);

export const preset = definePreset(
	{
		...theme,
		tokens: { ...tokens, semantic: semanticTokens.semantic },
	},
	{
		strict: true,
		conditions: semanticConditions,
		properties,
	},
);
```

```tsx
<button className={tw({ bg: "$brand", _dark: { bg: "$brand" }, text: "$onBrand" })} />
```

If a target library has a theme API, an adapter should map these references to
that API. If it does not, lower them to custom properties or leave a
machine-readable residual; never substitute a guessed literal.

## 6. Bind component token contracts

Add a third token layer for component contracts. The values are string refs to
semantic tokens, not new raw values and not runtime ternaries:

```ts
// src/design-system/tokens.ts
const themedTokens = {
	...tokens,
	semantic: semanticTokens.semantic,
	component: {
		"component.card.borderWidth": "semantic.border.width.default",
		"component.card.border": "semantic.border.default",
		"component.card.radius": "semantic.radius.card",
		"component.card.shadow": "semantic.shadow.card",
		"component.card.padding": "semantic.space.card.padding",
		"component.state.emptyBg": "semantic.bg.muted",
		"component.state.errorText": "semantic.fg.error",
	},
};

export const componentPreset = definePreset(
	{ config: {} as StandardProperties, tokens: themedTokens },
	{
		strict: true,
		conditions: { base: "", _dark: '[data-theme="dark"] &' },
		properties: {
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

```tsx
// src/components/EmptyState.tsx
import { createCss } from "pandwind/css";
import { componentPreset } from "./preset";

const css = createCss(componentPreset);

export const EmptyState = ({ title }: { title: string }) => (
	<section
		className={css.class({
			borderWidth: "component.card.borderWidth",
			borderColor: "component.card.border",
			borderRadius: "component.card.radius",
			backgroundColor: "component.state.emptyBg",
			color: "component.state.errorText",
			boxShadow: "component.card.shadow",
			padding: "component.card.padding",
		})}
	>
		{title}
	</section>
);
```

The preset can change the semantic meaning of `bg.muted` or `fg.error` for a
theme without changing `EmptyState`, its props, or its class name. The
component pays for the string refs it authored; it does not import a
JavaScript component-token object. If a component has multiple visual
contracts, add separate component token paths rather than branching on raw
colors. A typed identifier map is still useful when JS composition is the
point, but it is an optional pattern—not the component-token layer itself.

## 7. Enforce the contract

At CI and package boundaries:

- run codegen and fail on a dirty generated diff;
- run `pandwind-codemod tw scan` so dynamic candidates are known;
- lint raw escapes and unresolved tokens;
- run browser-state and SSR/hydration fixtures for theme changes;
- measure CSS output and bundle size; and
- export tokens in the formats your consumers need through the token bridge.

For migration, the preset is also the target contract: adapters can map source
tokens into it and report anything that cannot be represented.

See [the theming API](/api/theming/), [design `css()`](/api/design-css/), and
[token interoperability](/api/tw/#token-interoperability).
