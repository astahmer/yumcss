---
title: css() — atomic CSS-in-JS
description: Write typed CSS objects, extract atomic classes, and keep runtime values explicit.
sidebar:
  order: 1
---

> **Primary styling lane — when to use this:** you want typed CSS objects,
> atomic extraction, design tokens, and priority merging. This is the default
> starting point for new Pandwind code. Use [tw()](/api/tw/) when Tailwind
> already owns your stylesheet or you specifically want its utility ecosystem;
> use [design css()](/api/design-css/) for the ~30-prop Figma vocabulary on top
> of this same engine.

`createCss(preset)` returns the preferred typed `css()` that flattens a style
object into hashed atomic classes, with design tokens, property-priority
merging, variant conditions and a `$input` escape hatch for dynamic values.
`createCss()` remains available as an intentionally loose convenience form.

```ts
import { createCss } from "pandwind/css";
import { definePreset, defineTokens, type StandardProperties } from "pandwind/preset";

const tokens = defineTokens({
	colors: { "$brand-500": "#2563eb" },
	spacing: { 4: "1rem" },
});

const preset = definePreset(
	{ config: {} as StandardProperties, tokens },
	{
		strict: true,
		conditions: { _hover: "&:hover" },
		properties: {
			$all: true,
			backgroundColor: { $tokens: "colors" },
			padding: { $tokens: "spacing" },
		},
	},
);

const css = createCss(preset);
const className = css.class({ backgroundColor: "$brand-500", padding: 4 });
```

This lane is for ordinary CSS properties with a small production path:
literal calls can be extracted at build time, while dynamic values can use
inline custom properties or an explicit runtime sheet. The
[design-system guide](/guides/design-system/) shows how to share the preset
across components.

## The everyday loop

Create one preset for the application, bind one css function to it, and use
css.class() for elements. Literal calls are extracted by the Vite plugin;
runtime values use css.vars() and keep their changing data in inline custom
properties.

```ts
const card = css.class({
	backgroundColor: "$surface",
	color: "$ink",
	padding: "4",
});
```

Most applications only need css.class(), css.vars(), and occasionally
css.props(). The other return shapes are useful when building a component
library or an integration.

### Optional property shorthands

The CSS lane preserves authored property names by default. If an application
uses aliases such as `bg`, `px`, or `rounded`, opt into the separate catalog:

```ts
import { createCss } from "pandwind/css";
import { cssShorthands } from "pandwind/css/shorthands";

const css = createCss({ propertyAliases: cssShorthands });
const card = css.class({ bg: "red", px: 4 });
```

The same `propertyAliases` map must be passed to `pandwindCssVite()` when
static extraction is enabled. Spread `cssShorthands` with application-specific
aliases when needed; applications that do not import this entry point do not
ship its alias table.

### Host stylesheet precedence

Generated CSS keeps ordinary selectors by default. If a host runtime injects
one-class rules that must not override Pandwind, opt into the StyleX-like
specificity strategy:

```ts
const css = createCss(preset, { cascade: "specificity" });

// vite.config.ts
pandwindCssVite(preset, { cascade: "specificity" });
```

This adds `:not(#\\#)` priority markers to generated selectors. The markers
raise Pandwind's specificity by priority band, while class names and `cx()`
semantics stay unchanged. The strategy is intentionally opt-in because it
makes generated selectors stronger; a host rule with equal or higher
specificity, or `!important`, can still win.

For an application that coordinates all of its CSS with native cascade layers,
use the Panda-style layer strategy:

```css
@layer reset, base, pandwind, app;
```

```ts
const css = createCss(preset, { cascade: "layers" });

// vite.config.ts
pandwindCssVite(preset, { cascade: "layers" });
```

Pandwind wraps its generated tokens, atomic rules, and variable rules in
`@layer pandwind`. Declare the layer order before those rules are imported and
place host layers around it as needed. Native layers are not an override for
ordinary unlayered host declarations: unlayered normal CSS has higher cascade
priority than normal layered CSS.

The runtime lane accepts the same option. Use `createRuntimeCss(preset, {
cascade: "specificity" })` or `{ cascade: "layers" }`; when supplying an
explicit `sheet`, configure the cascade on `createRuntimeSheet()` itself so
the sheet and its CSS factory share one policy.

## Pick a return shape

All seven methods take the same style object and compile the same atoms;
they differ only in what they hand back:

| call                          | returns                                                                             | use when                                                                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `css({ ... })`                | `{ color: "color__red" }` — one atom class **per declaration**, keyed by style prop | you need to address individual declarations afterwards (conditional composition, tooling, tests)                                                     |
| `css.class({ ... })`          | `"color__red"` — declarations fused into one class string                           | styling an element directly (the default choice; ~all app code)                                                                                      |
| `css.vars({ ... })`           | `{ class, style }` — classes plus inline custom properties                          | **runtime-dynamic values**: the value never enters a generated stylesheet (see below)                                                                |
| `css.raw({ ... })`            | `{ color: "red" }` — plain style object, untouched                                  | escape hatch _out_ of the atomic pipeline: inline-`style` targets (React Native, opentui), or forcing a call to stay invisible to the vite extractor |
| `css.props(...)`              | `{ className, style }` — spread onto an element                                     | combining compiled maps with `vars()` outputs in one shot                                                                                            |
| `css.group({ btn: { ... } })` | named map of compiled outputs                                                       | pre-compiling a set of related styles behind one name                                                                                                |
| `css.input(name)`             | `"input>$name"` marker                                                              | referencing a `$input` value inside a dynamic group; the Vite extractor emits its structural `var(...)` rule                                         |

Notes that hold for all of them:

- Same compilation pipeline, same hashed classes, same stylesheet output —
  zero behavioral difference between `css()` and `css.class()` beyond the
  return shape. Both also accept multiple style objects and merge them
  last-wins (`css(a, b)`).
- `createDesignCss(preset)` mirrors this exact surface: it resolves the
  `$frame` / `$layout` / `$text` vocabulary first, then delegates to the same
  engine methods. Everything in the table applies unchanged.

### css() vs css.class() by example

```ts
// css.class — the 90% case: "I just want a className"
<h1 className={css.class({ $text: { size: "3xl", weight: "bold" } })} />

// mixing class sources through cx() — cx resolves css atoms via the
// registry, so conflicts merge properly instead of fighting in the DOM:
cx(tw({ bg: "red-500" }), "px-4", css.class({ color: "blue" }))
// -> "px-4 bg-blue-500 color__blue"  (bg-red-500 lost, last-wins)

// css — the per-declaration map, for when you need individual pieces later
const base = css({ color: "$gray-900", pad: [4, 8] });
className={cx(base.color, isActive && base.pad)} // drop just the padding part
```

With `css.class()` the declarations are fused into one string — you cannot
drop a single declaration out of it afterwards. That fusion is exactly what
you want for elements, and exactly what you don't want for composition.

### Dynamic values (`css.vars`) and the escape hatches

Literal values are extracted at build time; values only known at runtime go
through `css.vars()`. The value is delivered as an inline custom property
and never enters any generated stylesheet — no safelisting needed:

```tsx
const { class: widthClass, style } = css.vars({ w: value }); // value = runtime number/string
<div class={widthClass} style={style} />;
```

`cx()` understands `vars()` outputs natively (they carry their atoms via an
internal symbol), so they merge with everything else last-wins.

`css.vars()` is SSR-safe data, not a DOM side effect: both `class` and `style`
are ordinary serializable values that can be rendered on the server and
hydrated unchanged on the client. String values and finite numbers become
custom properties; booleans, empty strings, non-finite numbers, and other
unsupported runtime values are omitted. The generated toggle rule always falls
back from the most
specific condition to the base custom property, so transitions and other
browser CSS can consume the same property normally.

### Isolating multiple Pandwind instances

Dynamic carriers use a small Pandwind-owned namespace. The default is `pw`:

```ts
const css = createCss(preset, { namespace: "checkout" });
const output = css.vars({ color: runtimeColor });

// output.class: "checkout-color"
// output.style: { "--checkout-c-color": runtimeColor }
```

Use this when multiple independently configured Pandwind instances share a
document, such as a microfrontend host. Keep the value a CSS identifier
fragment (`checkout`, `billing-v2`, and similar). The option only controls
Pandwind-owned dynamic carriers; hashed atomic classes and names returned by a
custom `ClassNameStrategy` remain under their existing contracts.

When using static extraction, pass the same namespace to
`pandwindCssVite` (or `pandwindUnpluginCss`) so its var rules and critical
markers match the factory:

```ts
const css = createCss(preset, { namespace: "checkout" });

// vite.config.ts
pandwindCssVite(preset, { namespace: "checkout" });
```

### At-rules: local conditions versus global CSS

Pandwind has two deliberately different at-rule lanes. Use a typed style
condition when the rule belongs to an element; use authored CSS or the
explicit runtime sheet when it changes the stylesheet itself:

| Need                                                      | Use                                                       | What happens                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Viewport, container, or feature conditions on a component | `@media`, `@container`, or `@supports` in a style object  | The condition is emitted around the component's extracted atomic rule.                                       |
| Browser-global registration and definitions               | Authored CSS                                              | The host CSS toolchain owns `@property`, `@font-face`, `@keyframes`, `@layer`, resets, and global selectors. |
| A rule is created at runtime or collected during SSR      | `createRuntimeCss()` plus `sheet.registerSemanticRules()` | The runtime sheet serializes an explicit semantic rule and can mount, snapshot, or hydrate it.               |

For example, `@container` is a normal typed condition on a local class:

```ts
const card = css.class({
	"@container (min-width: 28rem)": {
		backgroundColor: "$blue-500",
	},
});
```

The Tailwind-compatible lane uses the same engine with container variants:

```ts
const card = tw({
	"@container": true,
	"@md": { backgroundColor: "blue-500" },
});
```

`@property` is a stylesheet-global registration, so it is not a declaration
inside `css.class()`. For the uncommon case where that registration must be
created by a runtime or SSR integration, the runtime semantic-rule path is
explicit:

```ts
import { createRuntimeCss } from "pandwind/css/runtime";

const css = createRuntimeCss(preset);

css.sheet.registerSemanticRules([
	{
		kind: "property",
		name: "--progress",
		declarations: [
			{ property: "syntax", value: "<number>" },
			{ property: "inherits", value: false },
			{ property: "initial-value", value: 0 },
		],
	},
]);
```

This is an explicit runtime-sheet feature and therefore has a runtime cost.
For a normal application, keep the registration in an authored CSS entry and
use a typed `css.group()`/`css.input()` style for the changing value. See
[Authored CSS on the web](/reference/authored-css/) for that split and the
complete support boundary. `analyze` and the inspector record explicit CSS
imports, but do not scan arbitrary CSS and infer a Pandwind API from them.

Pandwind does not provide a recipe API. If you need variant selection, use an
external CVA-style package with the class strings returned by `css()` and
`cx()`; keep the variant map statically authored for extraction. See the
[authored CSS guide](/reference/authored-css/#external-variant-composition).

`css.raw()` is the opposite trade: it skips atom compilation entirely and
returns the style object as-is. Use it for targets whose components take
inline `style` objects instead of classes (React Native, opentui), or when
you explicitly want a call to stay invisible to `pandwindCssVite`. You lose
dedup/extraction but keep preset token resolution and typing.

### `createCss()` versus `createRuntimeCss()`

Use `createCss(preset)` by default. It owns the typed style compiler and returns
classes, declaration maps, and inline variable props, but it does not create a
style element or mutate a stylesheet. In a built web application,
`pandwindCssVite(preset)` or the equivalent unplugin extracts the structural
CSS. This includes the value-independent rules for `css.vars()` and
`css.input()` groups, while the changing values remain in the returned inline
custom properties.

```tsx
const css = createCss(preset);

const button = css.group({
	button: {
		$input: {} as { background: string },
		backgroundColor: css.input("background"),
		color: "$white",
	},
});

declare const runtimeColor: string;
const props = css.props(button.button({ background: runtimeColor }));
<button {...props} />;
```

`createRuntimeCss(preset)` from `pandwind/css/runtime` exposes the same
`CssFn` methods and adds a `RuntimeSheet`. It is an explicit runtime CSS
fallback, not a smaller or different style API: calls register their atomic
and variable rules in that sheet, which can auto-mount in a browser or be
serialized and hydrated by a host. Use it for runtime-only packages without a
build-time CSS entry, genuinely runtime-created class rules, or code that must
collect a sheet during SSR. It adds the sheet and its registration machinery to
the runtime bundle, so a normal Vite application should use `createCss` with
`css.vars()` / `css.input()` instead.

```ts
import { createRuntimeCss } from "pandwind/css/runtime";

const runtimeCss = createRuntimeCss(preset);
const className = runtimeCss.class({ color: getColorAtRuntime() });
const cssTextForSsr = runtimeCss.sheet.css();
```

Without either a generated stylesheet or a runtime sheet, `createCss()` still
returns the correct class and inline variable data, but a browser has no CSS
rule to apply. This is why `createRuntimeCss()` exists; it is not required for
dynamic values when the build extractor is present.

## Static extraction (`pandwindCssVite`)

The css() classes are hashed deterministically; the stylesheet is generated
from the _same_ literal calls at build time, so nothing is accumulated at
runtime:

```ts
// vite.config.ts
import { pandwindCssVite } from "pandwind/vite";
import { examplePreset } from "./src/preset";

plugins: [pandwindCssVite(examplePreset)];
```

```ts
// main.tsx — the generated CSS is served as a virtual module
import "pandwind:css";
```

The plugin scans source files (like Tailwind's own scanner) for literal
`css(...)` calls, resolves them through the design layer and serves the
deduped CSS — tokens plus atomic rules. `css.vars()` and `css.input()` groups
contribute their stable structural rules while their runtime values stay
inline. Unknown dynamic calls keep working at runtime but are not extracted
(same constraint as dynamic class names in plain Tailwind), with one refinement:
when a dynamic argument is provably **finite**
(a ternary, union, array, or set of known constants), the plugin registers
every possible class the call may produce, so runtime selection still has
CSS. Only verified classes are registered; anything the design system cannot
compile is reported through the plugin's `onUnresolved` lane rather than
silently missing.

## Design css() — the Figma-inspector vocabulary

`const dss = createDesignCss(preset)` (the `dss` name keeps design-lane instances
distinct from engine `css()` instances) returns the same `css()` surface, but
the style object uses the vocabulary designers already think in — borrowed from
the inspector panels of Figma, Framer and Sketch: ~30 props instead of ~500 CSS
properties, behind one function. See [Design css()](/api/design-css/).
