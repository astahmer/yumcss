---
title: Design css() — the Figma-inspector vocabulary
description: Give components a small, typed vocabulary for frames, layout, and text instead of repeating low-level CSS properties.
sidebar:
  order: 3
---

`createDesignCss(preset)` returns the same `css()` surface, but the style
object is the vocabulary designers already think in — borrowed from the
inspector panels of Figma, Framer and Sketch: ~30 props instead of ~500 CSS
properties, behind one function.

> **Design vocabulary lane — when to use this:** you want styling that reads
> as design intent (`$frame`, `$text`, `fill: "$blue-500"`) with strict tokens
> and a hard `$raw` escape hatch. Start with [engine css()](/api/css/) for
> ordinary CSS-property authoring, or pick [tw()](/api/tw/) when Tailwind
> already owns the stylesheet.

```ts
import { createDesignCss } from "pandwind/design";
import { examplePreset } from "@pandwind/example-preset";

const dss = createDesignCss(examplePreset);

const cardClass = dss.class({
	$frame: { w: "20", h: 40, corners: "lg", fill: "$blue-500", pad: [4, 8] },
});
const card = dss(
	{ $frame: { w: "20", h: 40, corners: "lg", fill: "$blue-500", pad: [4, 8] } },
	{
		$layout: { flow: "stackY", gap: 16, align: "center" },
		$text: { size: "xl", weight: "semibold", color: "$red-300" },
		_hover: { $text: { color: "$red-400" } },
	},
);
const cardProps = dss.props(card);
```

`dss.class(...)` and callable `dss(...)` are equal projections over the same
design-aware compiler. Use the class-string projection when the host wants a
direct `className`; keep the declaration map and pass it to `dss.props(...)`
when the result should remain composable. The choice is about the boundary,
not a different styling capability.

- **Wrong is a type error.** Every value is a token or a constrained option;
  colors are strict tokens, so an off-system color or a typo doesn't compile.
  Raw CSS props only under `$raw` — the escape hatch.
- **Reads like the Figma inspector.** Styling reads top-to-bottom as intent —
  you review what it means, not how it works. Designers can contribute in the
  words they already use.
- **Token groups come from your preset**: `colors`, `spacing`, `radii`,
  `fonts`, `fontSizes`, `fontWeights`, `lineHeights`, `letterSpacings`.
  Missing groups fall back to open strings.

## The modules

- **`$frame`** is the box: `w`, `h`, `corners`, `fill`, `border`, `blurBg`,
  `pad`, `padX`, `padY`, `overflow`, `z` (0–100 like the Figma slider),
  `opacity`.
- **`$layout`** is its children: `flow`, `wrap`, `cols`, `rows`, `align`,
  `gap`, `gapX`, `gapY`.
- **`$text`** is the type: `font`, `size`, `weight`, `color`, `align`,
  `case`, `truncate`, `spacing`, `decoration`, `highlight`.

Conditions and selectors nest to any depth.

The full return-shape surface (`css()` vs `css.class()` vs `vars` / `raw` /
`props` / `group`) is identical to the engine's — see [the css() surface
table](/api/css/#the-surface-at-a-glance-return-shapes).
