---
title: Getting started
description: Choose a styling lane, get one working example running, and know where to go next.
sidebar:
  order: 1
---

You do not need to understand the whole Pandwind repository to use it. Pick
the path that matches your app today:

| Your starting point                       | Read this first                                 |
| ----------------------------------------- | ----------------------------------------------- |
| You want typed CSS objects                | [The `css()` API](/api/css/)                    |
| You are designing a shared token system   | [Build a design system](/guides/design-system/) |
| You already use Tailwind                  | [Tailwind compatibility](/api/tw/)              |
| You are replacing another styling library | [Migration guide](/guides/migrations/)          |

For new Pandwind code, start with the atomic CSS path. The Tailwind path is
for applications where Tailwind already owns the stylesheet or its ecosystem
is the reason you are adopting Pandwind.

## The primary atomic CSS path

Choose this path for new Pandwind code when you want typed CSS objects and an
extracted atomic stylesheet without making Tailwind the stylesheet engine.

### 1. Install

```sh
pnpm add pandwind
pnpm add -D unplugin
```

### 2. Create a preset

`createCss(preset)` is the typed form. A preset defines the tokens and values
your application is allowed to use. The [design-system guide](/guides/design-system/)
has a complete preset; the shape is:

```ts
// src/preset.ts
import { define, type PandwindProperties } from "pandwind/preset";

const tokens = define.tokens({
	colors: { $surface: "#ffffff", $ink: "#111827" },
	spacing: { 4: "16px" },
	radii: { lg: "12px" },
});

const cssConfig: PandwindProperties = {};

export const preset = define.preset(
	{ config: cssConfig, tokens },
	{
		strict: true,
		conditions: { _hover: "&:hover" },
		properties: { $all: true },
	},
);
```

### 3. Configure extraction

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { pandwindCssVite } from "pandwind/vite";
import { css } from "./src/styles";

export default defineConfig({
	plugins: [pandwindCssVite(css)],
});
```

Import the virtual stylesheet once from your application entry point:

```ts
import "pandwind:css";
```

### 4. Author a component

```ts
// src/styles.ts
import { createCss } from "pandwind/css";
import { preset } from "./preset";

export const css = createCss(preset);
```

```tsx
import { css } from "./styles";

export function Card() {
	return (
		<article
			className={css.class({
				backgroundColor: "$surface",
				color: "$ink",
				padding: "4",
				borderRadius: "lg",
			})}
		>
			Your content
		</article>
	);
}
```

Use `css.vars()` when a value is only known at runtime. Keep global rules,
fonts, and keyframes in ordinary authored CSS; they are part of the web
platform, not a missing Pandwind feature.

## The Tailwind compatibility path

This path adds typed object syntax to a Tailwind project. Tailwind still owns
the final stylesheet.

### 1. Install

```sh
pnpm add pandwind
pnpm add -D tailwindcss @tailwindcss/vite pandwind-codemod
```

### 2. Create the stylesheet entry

```css
/* src/tailwind.css */
@import "tailwindcss";
```

Import this file once from your application entry point.

### 3. Generate the typed helper

```sh
pnpm exec pandwind-codemod tw generate ./src/tailwind.css ./src
```

The command reads the Tailwind design system and writes `src/tw.ts` plus its
declarations. Those generated files are the source of autocomplete in your
editor. Regenerate them when the Tailwind input or theme changes.

### 4. Add the Vite plugin

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

`pandwindVite()` turns literal calls into the class strings Tailwind already
knows how to compile. Your existing Tailwind workflow stays recognizable.

### 5. Use it

```tsx
import { tw } from "./tw";

export function Welcome() {
	return (
		<main className={tw({ minH: "screen", bg: "gray-50", p: "8" })}>
			<button className={tw({ rounded: "lg", bg: "blue-600", px: "4", py: "2", text: "white" })}>
				Continue
			</button>
		</main>
	);
}
```

Run your normal command:

```sh
pnpm run dev
pnpm run build
```

TypeScript now catches invalid utility names and values. Continue with the
[Tailwind walkthrough](/guides/basic/) if you want this setup as a complete
small app.

### Dynamic class choices

Static calls are visible to Tailwind through the Vite plugin. If a runtime
choice can produce several utility classes, tell Tailwind about those
candidates:

```sh
pnpm exec pandwind-codemod tw scan ./src/tw.ts ./src ./src/pandwind.safelist.css
```

Then import the generated file:

```css
@import "tailwindcss";
@import "./pandwind.safelist.css";
```

The scanner is only needed when the possible class names are not present as
literal source that Tailwind can see.

## What should I read next?

- [Build a design system](/guides/design-system/) when tokens or themes are
  becoming shared product infrastructure.
- [Build a component library](/guides/component-library/) when styles cross a
  package boundary.
- [Theming](/api/theming/) for light/dark and component scopes.
- [Playground, inspector, and Studio](/tooling/analyze-and-studio/) to see
  generated output instead of guessing.
- [Migration guide](/guides/migrations/) when you are bringing an existing
  codebase along.

If a page starts with compiler terminology you do not recognize, skip it for
now. The [API reference](/api/css/) is designed for looking up a decision after
you have chosen a lane, not as a prerequisite for using Pandwind.
