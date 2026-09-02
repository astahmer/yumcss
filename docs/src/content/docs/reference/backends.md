---
title: Style backends — one design system, every target
description: Lower the same resolved design IR to web CSS, React Native style objects or OpenTUI styles.
sidebar:
  order: 1
---

Status as of 2026-08-25 (plan
[021](https://github.com/astahmer/pandwind/blob/main/plans/021-multi-target-backends.md),
steps 1–4 and 6 landed; canvas deferred). This is the guide to the
`StyleBackend` layer and the non-web targets.

## Why

pandwind's differentiator is the design layer: a typed, token-constrained
vocabulary (~30 Figma-style props, `$frame`/`$layout`/`$text`) resolved
against DTCG tokens. Until now everything downstream of it assumed the
terminal artifact was **CSS class names plus a stylesheet** — which locked the
whole layer to the web.

The fix is not another port of the API. It is moving the target-specific part
to exactly one place: what a _resolved style declaration_ becomes.

## The layering

```
design vocabulary  css() / createDesignCss()   ← frozen core API, unchanged
  → resolveDesignStyle()      tokens resolved against the preset
  → flat style IR             Record<string, string>, condition-nested keys
  → StyleBackend              ← the seam: IR → whatever the target consumes
       ├─ css           class names + stylesheet (atom registry + vite extract)
       ├─ react-native  registered style objects on the RN `style` prop
       ├─ opentui       plain style objects on OpenTUI's `style` prop
       └─ canvas        plain objects for draw code — deferred
```

Everything upstream of a backend is target-independent: the vocabulary, DTCG
token resolution, condition flattening and `cx` semantics. A backend lowers
**one flattened declaration at a time** and owns its artifact registry.
Policy violations throw — a silently dead style is never acceptable.

### The IR contract

The IR is today's flat style object, pinned by `FlatStyleIR`
(`src/backends/types.ts`) and `tests/backends-ir.test.ts`:

- keys are `prop` or condition-nested `_cond__prop`, `__`-separated,
  **outermost condition first**: `_hover___dark__color`;
- values are already token-resolved — a backend never sees `$surface`, only
  the concrete value;
- produced by the owned flattener: nested objects/arrays flatten,
  `null`/empty entries disappear.

## Targets

| Backend         | Export                  | Terminal artifact                       | Unit policy                                                             |
| --------------- | ----------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `css` (default) | `pandwind/css`          | class strings + generated stylesheet    | CSS units verbatim                                                      |
| `react-native`  | `pandwind/react-native` | registered style objects (`style` prop) | automatic: px → unitless dp numbers, rem × 16                           |
| `opentui`       | `pandwind/opentui`      | plain style objects (`style` prop)      | declared-with-default: cells = round(px / cellSize), cellSize default 4 |
| `canvas`        | —                       | draw-call style objects                 | deferred until a concrete consumer exists                               |

Selection is per-module via subpath imports — a module graph should not mix
targets, two css instances cannot fight over one registry, and existing web
apps change nothing (zero-churn: the subpaths are purely additive).

### React Native

```ts
import { createDesignCss, createCx } from "pandwind/react-native";
import { examplePreset } from "./pandwind.preset";

// Lengths become unitless dp numbers ("20px" -> 20, "0.5rem" -> 8).
// Shorthand lists split per side / corner like CSS.
const dcss = createDesignCss(examplePreset, {
	dark: () => useColorScheme().scheme === "dark",
});
const cx = createCx();

const styles = {
	card: dcss({
		$frame: { fill: "$gray-100", corners: "lg", pad: [4, 8] },
		_dark: { $frame: { fill: "$gray-800" } },
	}),
};
// <View style={styles.card} />
```

Identical styles resolve to **the same object reference** (hash-keyed
registry), so list rendering and memoization see stable identity. `cx` merges
last-wins per property and returns one registered merged object.

### OpenTUI

```ts
import { createDesignCss, createCx } from "pandwind/opentui";
import { examplePreset } from "./pandwind.preset";

// Lengths quantize to terminal cells: round(px / cellSize), cellSize 4 by
// default ("20px" -> 5 cells); override with { cellSize: 8 }. Hex colors
// pass through. CSS border shorthands expand to { border: true } +
// borderColor — OpenTUI borders are boolean, one cell thick.
const dcss = createDesignCss(examplePreset);
const cx = createCx();

const panel = dcss({
	$frame: { fill: "$gray-900", corners: "lg", pad: [1, 2] },
});
// <box style={panel}>…</box>
```

Same skeleton, same registry guarantees, same `cx` merge semantics as RN;
only the value/unit policy differs. Terminals own fonts, so typography-shape
props (`fontSize`, `fontFamily`, …) refuse loudly instead of emitting dead
styles.

## Condition policy (strict)

Conditions are preset-declared (`_hover`, `_dark`, …) and flattened into IR
keys before any backend sees them. On object backends a condition only applies
if you provide a resolver:

```ts
createDesignCss(preset, { dark: () => scheme === "dark" });
```

- `_dark` participates when the resolver returns `true`; re-resolve when the
  scheme changes and the object updates.
- Any condition without a resolver **throws at resolve time**
  (`condition "_hover" is not supported by this target`). No build-time
  folding in v1. Loud beats silently dead.

The web css backend is unchanged: conditions stay in class names and the
stylesheet handles them natively.

## What stays web-only

- `tw()` — its semantics are class-string-shaped by definition; faking that
  on other targets is someone else's pain.
- Runtime theme switching via CSS custom properties — vars are a stylesheet
  concept. Non-web targets share tokens through the same DTCG preset instead.

## Guarantees

- **Zero churn for existing web apps**: nothing changes unless you import a
  new subpath. The runtime-size budget test keeps watching the core.
- **No new packages, no new dependencies**: object backends emit plain
  structurally-typed objects and never import `react-native` or `@opentui/*`.
- **Parity is tested**: cross-backend merge/token/condition-policy parity in
  `tests/backends-parity.test.ts`; each backend's value policy pinned in
  `tests/backends-react-native.test.ts`, `tests/backends-opentui.test.ts`,
  `tests/backends-object.test.ts`.
- **E2E is real, per target** — each backend has a sandbox app that consumes
  it and asserts rendered output on a genuine host (`nub run test` inside each):

  | App                    | Host                                                                      | Proves                                                                                                                          |
  | ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `apps/css-example`     | vite + real Chromium (playwright-core)                                    | computed styles from atomic classes, cx conflict resolution, atom dedup                                                         |
  | `apps/rn-example`      | react-native-web + real Chromium                                          | emitted RN style objects processed by a real RN-semantics host: per-side shorthand expansion, `_dark` runtime toggle round-trip |
  | `apps/opentui-example` | real `@opentui/core` renderer (bun), headless span assertions + PTY smoke | exact token colors in rendered spans, border glyphs, `_dark` swap, cell insets                                                  |

Canvas remains deferred (plan 021 step 5): draw-call styling has no layout and
paint-state semantics — it gets built when something actually needs it.
