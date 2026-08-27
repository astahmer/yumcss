---
title: Getting started
description: Install pandwind, generate the typed runtime, wire the vite plugins, and use tw() / css() / cx().
sidebar:
  order: 1
---

pandwind ships **source** (`.ts` entry points) and expects a bundler that
compiles TypeScript (Vite does natively) with `moduleResolution: "bundler"`.

```sh
pnpm add pandwind
```

There are four steps: define a preset, run codegen, add vite plugins, and use
the APIs.

## 1. Preset

Define your design system once in `src/preset.ts` — tokens, radii,
conditions. See
[`packages/pandwind/src/preset/example-preset.ts`](https://github.com/astahmer/pandwind/blob/main/packages/pandwind/src/preset/example-preset.ts)
for a complete example using `defineTokens` / `defineTheme` / `definePreset`.

## 2. Codegen

Generate the typed `tw()` runtime and `@theme` bridge from your
`tailwind.css`:

```jsonc
// package.json
{
	"scripts": {
		"tw:codegen": "tsx node_modules/pandwind/src/tw/generate-types.ts ./src/tailwind.css ./src --tokens ./src/preset.ts",
		"tw:bridge": "tsx node_modules/pandwind/src/tw/generate-bridge.ts ./src/tailwind.css ./src/tw.ts ./src/bridge.ts",
		"tw:scan": "tsx node_modules/pandwind/src/tw/collect.ts ./src/tw.ts ./src ./src/pandwind.safelist.ts",
	},
}
```

```sh
pnpm tw:codegen && pnpm tw:bridge && pnpm tw:scan
```

This generates `src/types.d.ts`, `src/tw.ts`, `src/bridge.ts`, a safelist, and
`src/pandwind-theme.css` (the token bridge — import it from your
`tailwind.css`). The `--tokens` flag feeds your preset's DTCG token groups in;
drop it if you don't use tokens.

## 3. Vite plugins

Fold literal calls at build time:

```ts
// vite.config.ts
import { pandwindVite } from "pandwind/vite";
import { createTwAdapter } from "pandwind/tw";
import examplePreset from "./src/preset"; // or however you expose the preset

export default {
	plugins: [
		pandwindVite({
			preset: examplePreset,
			// optional: css() atoms compile to Tailwind classes too
			className: createTwAdapter({/* bridge + variants from generated files */}),
		}),
	],
};
```

Without `className` the atomic engine emits hashed classes compiled by
`pandwindCssVite`; with the adapter everything compiles through Tailwind —
same API either way.

## 4. Use it

Pick one lane — each is self-contained, and mixing them in a module graph is
never required:

- **tw()** (`pandwind/tw`) for typed Tailwind utilities
- **css()** (`pandwind/css`) for atomic styles — or **design css()**
  (`pandwind/design`, convention: `const dcss = createDesignCss(preset)`) for
  the ~30-prop Figma vocabulary on the same engine
- **cx()** (`pandwind/cx`) to merge both, last-wins

Plain strings keep working everywhere.

## Subpath exports

The root export (`pandwind`) carries ONLY the recommended lane: `tw` + `cx`.
Every other surface requires its explicit subpath, so choosing an API lane is
a visible import decision:

Runtime subpaths: `pandwind/css`, `pandwind/tw`, `pandwind/cx`,
`pandwind/preset`, `pandwind/design`, `pandwind/vite`; generic bundler
adapters under `pandwind/unplugin`; build-time codegen helpers under
`pandwind/codegen/{types,theme,collect}`; non-web backends
`pandwind/react-native`, `pandwind/opentui`, plus the render-agnostic
`pandwind/stack` (+ `pandwind/stack/react`). `generate-bridge` stays CLI-only
(it executes on import).

See [Tooling → Codegen](/tooling/codegen/) for every command and flag.
