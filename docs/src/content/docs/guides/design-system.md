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
import type { StandardProperties } from "csstype";
import { definePreset, defineTheme } from "pandwind/preset";
import { tokens } from "./tokens";

const theme = defineTheme({
	config: {} as StandardProperties,
	tokens,
});

export const preset = definePreset(theme, {
	strict: true,
	conditions: {
		_hover: "&:hover",
		_focusVisible: "&:focus-visible",
		_dark: ".dark &",
		sm: "@media (min-width: 640px)",
	},
	properties: { $all: true },
});
```

`strict: true` makes the typed surface reject unknown values. `$all: true` is
a useful starting point for a general CSS preset; a mature system can narrow
the property map and expose only approved aliases. Keep arbitrary values in
an explicit `$raw`/escape lane so they are visible to review and analysis.

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
export const preset = definePreset(theme, {
	strict: true,
	conditions: {
		_dark: ".dark &",
		_highContrast: "@media (prefers-contrast: more)",
	},
	properties: { $all: true },
});
```

```tsx
<button className={tw({ bg: "$brand", _dark: { bg: "$brand" }, text: "$onBrand" })} />
```

If a target library has a theme API, an adapter should map these references to
that API. If it does not, lower them to custom properties or leave a
machine-readable residual; never substitute a guessed literal.

## 6. Bind component token contracts

Use a small map of token references as the contract between the design system
and its consumers. The component binds those references directly; it does not
choose raw colors with runtime ternaries.

```ts
// src/design-system/component-tokens.ts
export const componentTokens = {
	button: {
		background: "$brand",
		foreground: "$onBrand",
		padding: "8",
		radius: "md",
	},
} as const;
```

```ts
// src/design-system/styles.ts
import { createDesignCss } from "pandwind/design";
import { preset } from "./preset";
import { componentTokens } from "./component-tokens";

export const dcss = createDesignCss(preset);

export const buttonClass = dcss.class({
	$frame: {
		pad: componentTokens.button.padding,
		corners: componentTokens.button.radius,
		fill: componentTokens.button.background,
	},
	$text: { color: componentTokens.button.foreground, weight: "600" },
	_hover: { $frame: { fill: "$brand" } },
});
```

The preset can change the semantic meaning of `$brand` and `$onBrand` for a
theme without changing `buttonClass` or the component. If a component has
multiple visual contracts, author them as separate named token maps or a
static variant table; keep the token choice visible and type checked.

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
