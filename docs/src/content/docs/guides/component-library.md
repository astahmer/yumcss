---
title: Build a component library
description: Package reusable, typed, SSR-safe components on top of pandwind.
sidebar:
  order: 4
---

Treat a component library as a consumer of the design-system contract, not as
a second styling system. The library owns component semantics and variants;
the host application owns the final bundler and rendering environment.

## Recommended package layout

```text
packages/ui/
  src/
    preset.ts              # re-export or compose the system preset
    styles.ts              # dss/css façade
    Button.tsx
    Card.tsx
    index.ts
    authored.css
  package.json
```

Keep the public entry point small:

```ts
// src/styles.ts
import { createDesignCss } from "pandwind/design";
import { preset } from "./preset";

export const dss = createDesignCss(preset);
```

## Build a component contract

```tsx
// src/Button.tsx
import type { ComponentPropsWithoutRef } from "react";
import { cx } from "pandwind/cx";
import { dss } from "./styles";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export function Button({ className, ...props }: ButtonProps) {
	const styles = dss.class({
		$frame: {
			pad: "component.button.padding",
			corners: "component.button.radius",
			fill: "component.button.bg",
		},
		$text: { color: "component.button.fg", weight: "600" },
		_hover: { $frame: { fill: "component.button.hoverBg" } },
		_focusVisible: { outline: "2px solid $brand", outlineOffset: "2px" },
	});

	return <button className={cx(styles, className)} {...props} />;
}
```

`cx()` is the composition boundary. Accept a caller's `className` when
interoperating with an existing application, and keep the component's
semantic styles deterministic. The `component.*` values are string refs from
the preset's third token layer; the component does not import a JavaScript
token map or branch on a runtime color. A theme can remap `component.button.bg`
through a different semantic role without changing `Button`.

## Configure the consumer build

The application that consumes the library should run the appropriate
Pandwind plugin. For atomic CSS:

```ts
import { pandwindCssVite } from "pandwind/vite";
import { dss } from "@acme/ui/styles";

export default {
	plugins: [pandwindCssVite(dss)],
};
```

Import `pandwind:css` once from the host entry. For the Tailwind lane, expose
generated helpers or compile the library's literal calls as part of the host
source scan, then run `pandwindVite()` before Tailwind.

## Publish extracted library rules

For a package that is built and consumed independently, publish Pandwind's
build artifact so the host does not scan the library source again:

```sh
pnpm exec pandwind-codemod lib build . dist/pandwind.lib.json \
	--preset-import ./src/preset.ts \
	--preset-export preset \
	--include 'src/**/*.{ts,tsx}'
```

Expose the generated JSON from the package:

```json
{
	"exports": {
		".": "./dist/index.js",
		"./pandwind.lib.json": "./dist/pandwind.lib.json"
	}
}
```

Register the package in the consuming Vite build:

```ts
import { pandwindCssVite } from "pandwind/vite";
import { dss } from "@acme/ui/styles";

export default {
	plugins: [
		pandwindCssVite(dss, {
			libraries: ["@acme/ui"],
		}),
	],
};
```

The package artifact is validated against the consumer's preset, namespace,
cascade mode and layer, and class-output strategy before its rules are merged. Keep the
same Pandwind preset semantics on both sides; token/property/condition or
compiler mismatches fail the build with the differing compatibility fields.
Use `pandwind-codemod lib build --check` in the library's CI to catch stale
output. The artifact contains extracted atomic and variable-carrier rules plus
used token declarations; it does not replace the library's JavaScript runtime,
dynamic `css.vars()` values, or authored CSS imports.

Runtime pruning is a separate JavaScript-build concern. If the library ships
unbundled modules that still import Pandwind factories, run its distributable
build through `pandwindCssVite` so static calls and unused runtime attachments
are removed before publishing. A consuming Vite build intentionally does not
rewrite `node_modules` from the JSON artifact alone. Use
`pandwind-codemod runtime explain` against library source when checking the
expected method and token projection; use `lib build` for the reusable CSS
artifact.

If you publish prebuilt CSS, document whether it is additive, replaceable, or
expected to be tree-shaken. Do not make consumers guess which virtual module
to import.

## Package exports and dependencies

Expose the component entry points and the preset intentionally:

```json
{
	"exports": {
		".": "./dist/index.js",
		"./preset": "./dist/preset.js",
		"./styles": "./dist/styles.js"
	},
	"peerDependencies": {
		"pandwind": "workspace:^",
		"react": ">=18"
	}
}
```

Use a peer dependency for Pandwind when the host must share its engine,
preset, or virtual stylesheet. Keep framework-specific exports separate from
the core component contract.

## SSR and hydration checklist

- use one preset and one class-name identity policy on server and client;
- serialize the canonical CSS artifact in the server response;
- load the same virtual or published CSS before hydration;
- avoid random IDs and render-order-dependent style names;
- test streaming/RSC boundaries if the library is used by a React server app;
- test dark-mode, responsive, focus, and dynamic-value states in a browser.

For runtime values, prefer `dss.vars()`/`css.vars()` and pass the returned
`style` and `class` together. This keeps dynamic values out of the generated
stylesheet without pretending they are static.

## Authored CSS and escape hatches

Some components need global rules, fonts, or browser-specific features. Keep
those in an explicit authored CSS file, export it as a named entry, and
include it in the component's validation fixtures. A component-local
animation is the exception: use `css.keyframes()` so the build emits the
`@keyframes` rule with the rest of the generated CSS. The analyzer should be
able to distinguish authored CSS from generated atoms.

## Test the library as a product

Every public component should have:

- type tests for tokens and variants;
- rendered tests for class composition and props;
- browser-state snapshots;
- SSR and hydration fixtures;
- generated-CSS snapshots and size budgets;
- a consumer fixture using the supported framework/bundler; and
- migration fixtures when the component replaces another styling API.

For React Native or OpenTUI, use the corresponding backend adapter and keep
unsupported browser semantics explicit in the capability report. See
[backends](/reference/backends/) and [SSR](/reference/ssr/).
