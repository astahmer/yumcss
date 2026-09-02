---
title: Basic mode
description: A step-by-step introduction to building with pandwind.
sidebar:
  order: 1
---

Basic mode is the shortest path from an empty app to typed styles. Start with
the `tw()` lane if you already use Tailwind. Add `css()` or design `css()` when
you need atomic CSS-in-JS or a design-language API.

## What you will build

By the end of this guide, a Vite app will:

1. generate typed style helpers from your Tailwind theme;
2. turn literal `tw()` calls into ordinary class strings at build time;
3. keep dynamic calls working through the runtime and safelist scanner; and
4. produce CSS through Tailwind, with no Pandwind runtime cost for static calls.

You need Node.js, Nub, a package manager, a Vite app, and Tailwind CSS. React is used in the
examples, but the generated helpers are not tied to React.

## 1. Install

```sh
pnpm add pandwind
pnpm add -D tailwindcss @tailwindcss/vite
```

## 2. Add Tailwind input

Create `src/tailwind.css`:

```css
@import "tailwindcss";
```

## 3. Generate the typed helper

Add scripts to `package.json`:

```json
{
	"scripts": {
		"tw:codegen": "nub node_modules/pandwind/src/tw/generate-types.ts ./src/tailwind.css ./src",
		"tw:scan": "nub node_modules/pandwind/src/tw/collect.ts ./src/tw.ts ./src ./src/pandwind.safelist.ts"
	}
}
```

Run them once, and again whenever the Tailwind theme or source-file set
changes:

```sh
nub run tw:codegen
nub run tw:scan
```

This creates the typed `src/tw.ts`, declarations, and a safelist module. If
your design tokens live in a preset, pass it to codegen with
`--tokens ./src/preset.ts`; see [Build a design system](/guides/design-system/).

## 4. Configure Vite

```ts
// vite.config.ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { pandwindVite } from "pandwind/vite";

export default defineConfig({
	plugins: [pandwindVite(), tailwindcss(), react()],
});
```

`pandwindVite()` runs before Tailwind. Literal calls are replaced with class
strings, so Tailwind sees the same classes it would see if you had written
them by hand.

## 5. Use `tw()`

```tsx
// src/App.tsx
import { tw } from "./tw";

export function App() {
	return (
		<main
			className={tw({
				flex: true,
				minH: "screen",
				items: "center",
				justify: "center",
				bg: "gray-50",
				p: "8",
			})}
		>
			<button className={tw({ bg: "blue-600", text: "white", rounded: "lg", px: "4", py: "2" })}>
				Continue
			</button>
		</main>
	);
}
```

Import `src/tailwind.css` from your application entry point. Start the app:

```sh
nub run dev
nub run build
```

TypeScript now catches invalid utility values. Literal styles compile away;
runtime-dependent values remain supported, but their possible Tailwind classes
must be covered by `tw:scan` or an explicit safelist.

## A second lane: atomic `css()`

Use this when styles are authored as CSS objects and should be emitted by
Pandwind's atomic extractor.

```ts
// src/css.ts
import { createCss } from "pandwind/css";

export const css = createCss();
```

Configure the extractor and import its virtual stylesheet once:

```ts
// vite.config.ts
import { pandwindCssVite } from "pandwind/vite";
import { defineConfig } from "vite";
import { cssPreset } from "./src/preset";

export default defineConfig({
	plugins: [pandwindCssVite(cssPreset)],
});
```

```ts
// src/main.tsx
import "pandwind:css";
```

```tsx
import { css } from "./css";

export function Card() {
	return <article className={css.class({ bg: "white", p: "4", rounded: "lg" })} />;
}
```

Use `css.vars()` for dynamic values and `css.raw()` only when intentionally
crossing into authored CSS. See [the `css()` API](/api/css/).

## A third lane: design `css()`

The design lane gives your team a small, typed vocabulary such as `$frame`,
`$layout`, and `$text`:

```ts
// src/design.ts
import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";

export const dcss = createDesignCss(examplePreset);
```

```tsx
<div
	className={dcss.class({
		$frame: { fill: "$blue-500", pad: "16", corners: "lg" },
		$text: { color: "$white", weight: "bold" },
	})}
/>
```

This uses the same engine as `css()`. It is a vocabulary choice, not a
separate styling runtime. See [design `css()`](/api/design-css/).

## Which lane should I choose?

| Need                                                  | Start with                                |
| ----------------------------------------------------- | ----------------------------------------- |
| Tailwind utilities and the smallest runtime           | `tw()`                                    |
| CSS objects, atomic extraction, and custom properties | `css()`                                   |
| A constrained design-system vocabulary                | `createDesignCss(preset)`                 |
| Mixing class strings from any lane                    | `cx()`                                    |
| Migrating an existing styling library                 | [codemod migrations](/guides/migrations/) |

Next: [Advanced mode](/guides/advanced/), [build a design system](/guides/design-system/), or [build a component library](/guides/component-library/).
