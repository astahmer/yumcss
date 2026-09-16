---
title: Build your first Tailwind app
description: A small, copy-pasteable Vite and Tailwind app with typed Pandwind utility styles.
sidebar:
  order: 1
---

This is the Tailwind compatibility walkthrough. Use it when Tailwind already
owns your stylesheet or when you specifically want its utility ecosystem. For
new Pandwind code, start with the [typed `css()` API](/api/css/) instead. This
page installs Pandwind in a small Vite app, generates a typed `tw()` helper,
and renders one styled button. React is used for the component example, but
the generated helper is not tied to React.

## What you will have at the end

```text
src/
  App.tsx
  main.tsx
  tailwind.css
  tw.ts                 # generated — do not edit
  tw.runtime.ts         # optional generated conflict catalog — do not edit
  tw.build.ts            # generated build metadata — do not edit
  types.d.ts            # generated — do not edit
```

The important loop is simple:

```text
Tailwind theme → codegen → typed tw() → Vite build → ordinary CSS classes
```

## 1. Install the packages

```sh
pnpm add pandwind
pnpm add -D tailwindcss @tailwindcss/vite pandwind-codemod
```

If you are adding this to an existing Vite app, keep your current React/Vue/
Solid plugin and add the Pandwind and Tailwind plugins shown below.

## 2. Add Tailwind's input file

```css
/* src/tailwind.css */
@import "tailwindcss";
```

Import it from the application entry:

```tsx
// src/main.tsx
import "./tailwind.css";
```

## 3. Generate the typed helper

Run this from the project root:

```sh
pnpm exec pandwind-codemod tw generate ./src/tailwind.css ./src
```

The generated `src/tw.ts` follows the utilities and values that Tailwind
actually loaded. Codegen also writes `src/tw.runtime.ts` as an optional
conflict catalog and `src/tw.build.ts` as build-only candidate metadata. The
runtime entry is small, and neither companion is imported by it. Ordinary
generated `tw()` usage therefore does not ship the full catalog. This is why
editor autocomplete stays useful when the theme changes. Keep generated files
in source control if your team reviews them; never hand-edit them.

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

The order matters: Pandwind makes static styles visible before Tailwind
generates the final stylesheet.

## 5. Style a component

```tsx
// src/App.tsx
import { tw } from "./tw";

export function App() {
	return (
		<main className={tw({ minH: "screen", bg: "gray-50", p: "8" })}>
			<section
				className={tw({ mx: "auto", maxW: "md", rounded: "xl", bg: "white", p: "6", shadow: "lg" })}
			>
				<p className={tw({ mb: "4", textColor: "gray-600" })}>A typed style object.</p>
				<button
					className={tw({
						rounded: "lg",
						bg: "blue-600",
						px: "4",
						py: "2",
						fontWeight: "semibold",
						textColor: "white",
						hover: { bg: "blue-700" },
					})}
				>
					Continue
				</button>
			</section>
		</main>
	);
}
```

The object is checked before the browser runs. For example, a typo such as
`bgColor: "bleu-600"` fails in the editor instead of silently producing no
style.

## 6. Run it

```sh
pnpm run dev
pnpm run build
```

For a quick sanity check, also run your project's normal typecheck:

```sh
pnpm exec tsc --noEmit
```

## Dynamic values

This works:

```tsx
const tone = enabled ? "blue-600" : "gray-600";

<button className={tw({ bg: tone })}>Save</button>;
```

But Tailwind cannot discover arbitrary runtime strings by itself. If the
possible values are finite and come from runtime state, generate a safelist:

```sh
pnpm exec pandwind-codemod tw scan ./src/tw.ts ./src ./src/pandwind.safelist.css
```

```css
/* src/tailwind.css */
@import "tailwindcss";
@import "./pandwind.safelist.css";
```

The scanner evaluates the same typed helper and records the possible classes.
Unknown or unbounded values remain visible as diagnostics; they are not
silently guessed.

For a value that is not a class choice at all — a user-selected color, chart
coordinate, or API response — use the CSS-variable path in the [atomic CSS
guide](/api/css/#dynamic-values) instead.

## Add tokens later

You can start with Tailwind's theme and introduce a shared preset when the
product has a vocabulary worth naming:

```ts
tw({ bg: "$brand", textColor: "$onBrand", p: "4" });
```

The [design-system guide](/guides/design-system/) shows how to define `$brand`
once and share it with `tw()`, `css()`, and design `css()`.

## Which page next?

- Need typed CSS objects? Read [atomic `css()`](/api/css/).
- Need a smaller design vocabulary? Read [design `css()`](/api/design-css/).
- Need light/dark themes? Read [theming](/api/theming/).
- Need to migrate an existing app? Read [migrations](/guides/migrations/).
- Want to see every result live? Open the [playground and inspector guide](/tooling/analyze-and-studio/).
