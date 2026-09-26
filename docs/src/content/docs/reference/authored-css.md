---
title: Authored CSS on the web
description: The explicit CSS lane for globals, fonts, layers, and other browser stylesheet primitives.
sidebar:
  order: 5
---

pandwind keeps full-fidelity browser-global CSS in ordinary CSS files. Import
those files through your application or package entrypoint and let the host
bundler own their parsing, ordering, and emission:

```tsx
// src/main.tsx
import "./globals.css";
import "@acme/brand/animations.css";
import "./app";
```

Use this lane for things outside the narrow build-time web contract in the
third `define.preset(theme, options, web)` argument, including:

- global selectors and resets;
- `@font-face` declarations;
- cascade layers, `@supports`, `@property`, and other authored at-rules;
- complex selectors or vendor-specific CSS that should remain recognizable as
  CSS.

For preset-owned, build-time globals that only need flat declarations, use the
typed web section instead of an additional CSS import:

```ts
import { define } from "pandwind/preset";

export const preset = define.preset(
	{ config: {}, tokens: { colors: { "$brand-900": "#172554" } } },
	{
		conditions: {},
		properties: { color: { $tokens: "colors" } },
	},
	{
		globals: { ":root": { color: "$brand-900" } },
		keyframes: {
			fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
		},
		fontFaces: {
			body: { family: "Brand", src: 'url("/fonts/brand.woff2") format("woff2")' },
		},
	},
);
```

The Vite/Unplugin build emits these rules in the generated stylesheet and
`pandwind.lib/3` carries them for registered component-library artifacts.
`web.globals` accepts selector-to-flat-declaration rules only; keyframe names
are explicit CSS identifiers and font-face descriptor values remain authored
CSS values. The runtime stylesheet does not consume this section, so the
contract adds no browser runtime work.

A component-local animation is a separate exception: `css.keyframes({ ... })`
returns a deterministic animation name and lets the build emit the matching
`@keyframes` rule into the Pandwind stylesheet, so the body never ships as a
runtime call. See
[`css.keyframes`](/api/css/#component-local-keyframes).

### Registering a typed custom property

`@property` describes a browser-global custom property: its syntax, inheritance
behavior, and initial value. A preset can own that registration through its
flat `cssVariables` contract; keep it in authored CSS when it is not preset
data:

```css
@property --progress {
	syntax: "<number>";
	inherits: false;
	initial-value: 0;
}

.progress-fill {
	width: calc(var(--progress) * 1%);
	transition: width 180ms ease;
}
```

The component can still keep the changing value and its type in TypeScript.
`css.input()` emits the structural `var(--progress)` rule, while
`css.props()` carries the current number as an inline custom property:

```tsx
import { createCss } from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
const styles = css.group({
	fill: {
		$input: {} as { progress: number },
		width: css.input("progress"),
	},
});

type ProgressProps = { value: number };

const Progress = (props: ProgressProps) => {
	const fill = css.props(styles.fill({ progress: props.value }));
	return (
		<div className={`progress-fill ${fill.className}`} style={fill.style} role="progressbar" />
	);
};
```

The registration stays global and recognizable CSS; the component value stays
typed and runtime-only. If the registration itself must be emitted during SSR
or created dynamically, use
`RuntimeSheet.registerSemanticRules([{ kind: "property", ... }])` instead. That advanced path is documented in the
[`css()` at-rule section](/api/css/#at-rules-local-conditions-versus-global-css).

The Pandwind lane remains responsible for typed, local atomic styles:

```tsx
import { css } from "./design";

const className = css.class({
	$layout: { flow: "stackY", gap: "4" },
	$text: { color: "$gray-900" },
});
```

Do not try to express a global rule as `css.global(...)`. Global selectors are
not runtime CSS-factory calls. Use `preset.web` for the small typed build-time
contract, or an authored CSS import when the rule needs the platform's full
syntax, native ordering, or host-bundler behavior.

## Sharing tokens with authored CSS

Expose the design tokens that authored CSS needs as custom properties in a
CSS entrypoint, then consume the variables from ordinary CSS:

```css
/* src/tokens.css — generated or maintained alongside the preset */
:root {
	--pw-color-brand: #3182ce;
	--pw-radius-control: 0.375rem;
}
```

```css
/* src/globals.css */
@keyframes pw-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.pw-dialog {
	border-radius: var(--pw-radius-control);
	color: var(--pw-color-brand);
	animation: pw-fade-in 160ms ease-out;
}
```

The CSS file is the source of truth for the authored rule. Pandwind does not
scan arbitrary CSS and infer a JavaScript API from it. `analyze` and the
inspector do, however, record explicit `.css` import edges so authored CSS is
visible in tooling alongside extracted atomic call sites.

## External variant composition

Pandwind does not ship a recipe or composition API. A CVA-style package can
select already-generated class strings while Pandwind retains responsibility
for typing and extraction:

```tsx
import { cva } from "class-variance-authority";
import { cx } from "./cx";
import { css } from "./design";

const button = cva(css.class({ $layout: { flow: "row", gap: "2" } }), {
	variants: {
		size: {
			sm: css.class({ $frame: { pad: [8, 12] } }),
			lg: css.class({ $frame: { pad: [12, 20] } }),
		},
	},
});

const className = cx(button({ size: "sm" }), css.class({ $text: { weight: "bold" } }));
```

Keep the variant map statically authored so every Pandwind call can be
extracted. For values that are only known at runtime, use `css.vars()` rather
than creating a new dynamic style shape.
