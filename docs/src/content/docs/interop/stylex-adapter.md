---
title: The StyleX adapter — compatible atomic identities
description: createStyleXAdapter gives css() StyleX-shaped atomic class names while Pandwind owns the stylesheet.
sidebar:
  order: 2
---

`createStyleXAdapter()` is a `ClassNameStrategy` for projects that want
StyleX-shaped atomic class names without adding the StyleX runtime to the
application:

```ts
import { createStyleXAdapter } from "pandwind/css/stylex";
import { createCss } from "pandwind/css";

const css = createCss({
	className: createStyleXAdapter(),
});

css.class({ color: "red" }); // e.g. "x1e2nbdu"
```

The adapter uses StyleX's stable atomic hash inputs — dashed property,
normalized value, and a sorted condition modifier — and uses `x` as the
default prefix. It is sheet-backed, so Pandwind still emits the stylesheet and
`cx()` can reason about the generated declarations.

Pass the resolved preset conditions when custom selectors or at-rules should
participate in the identity hash:

```ts
const css = createCss({
	className: createStyleXAdapter({
		conditions: {
			_night: ".night &",
			_supportHover: ["@media (hover: hover)", "&:hover"],
		},
	}),
});
```

Condition metadata is injected rather than guessed. This means custom
conditions remain deterministic without growing a hardcoded condition catalog.
The adapter changes class identity only; it does not claim to reproduce
StyleX's file/export-based variable or component identities.
