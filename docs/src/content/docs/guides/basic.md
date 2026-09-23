---
title: Tailwind component patterns
description: Use generated tw() styles for reusable components and finite runtime choices.
sidebar:
  order: 3
---

This guide assumes your app already has a generated `tw()` helper and the
Pandwind Vite plugin. For first-time setup, follow [Getting started](/getting-started/).
Here, focus on writing component styles that stay visible to Tailwind and
Pandwind's build-time analysis.

## Keep finite choices static

When a component has a small set of runtime choices, write one literal style
per choice. Each call can be checked against the generated utility types and
folded before the browser runs.

```tsx
import type { ReactNode } from "react";
import { tw } from "./tw";

const toneClasses = {
	primary: tw({
		bg: "blue-600",
		textColor: "white",
		hover: { bg: "blue-700" },
	}),
	secondary: tw({
		bg: "gray-100",
		textColor: "gray-900",
		hover: { bg: "gray-200" },
	}),
};

type Tone = keyof typeof toneClasses;

export function Button(props: { tone: Tone; children: ReactNode }) {
	return <button className={toneClasses[props.tone]}>{props.children}</button>;
}
```

The selected class changes at runtime, but both class strings are literal and
visible to the build. An unknown tone fails in TypeScript rather than producing
an empty style.

## Avoid building utility names dynamically

Do not assemble class names from fragments such as `"bg-" + color`. Tailwind
cannot infer every possible string from that expression. Keep a finite choice
as a map of complete classes, as above. If choices come from a data source and
are not present as literals, run the [safelist scanner](/tooling/codegen/) and review its
output before importing it into the Tailwind entry stylesheet.

For values that are genuinely arbitrary — a user-selected color or a chart
coordinate, for example — use a CSS variable with the atomic `css()` API or
authored CSS. Do not turn unconstrained runtime values into guessed Tailwind
class names.

## Check the result

Keep the normal project build as the source of truth. The [Inspector](/tooling/workflows/)
shows the generated utility catalog and build report; the analyzer CLI can make
the same checks repeatable in CI. See [Migrations](/guides/migrations/) when
you are moving an existing codebase between styling libraries.
