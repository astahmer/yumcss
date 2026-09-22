---
title: Vite plugins
description: pandwindVite() folds tw()/cx() at build time; pandwindCssVite() extracts css() atoms into a generated stylesheet.
sidebar:
  order: 2
---

Two vite plugins do the build-time work. They run _before_ Tailwind's scanner
so folded output is found naturally.

## `pandwindVite()` — tw/cx folding

Statically inlines literal `tw({ ... })` calls with literal arguments into
plain class strings before Tailwind's scanner sees them:

- the runtime cost becomes zero for static calls;
- the generated runtime entry and metadata tree-shake out of the bundle (the
  generated `tw.ts` is marked `@__PURE__`);
- an optional generated `bridge.ts` is not pulled into the bundle unless the
  project explicitly imports its `twAdapter` as a Tailwind class strategy;
- dynamic calls keep working through the runtime;
- conflict merging happens at compile time too, so bundled class strings are
  already conflict-free;
- `cx(...)` calls over statically-known operands fold to their final string —
  byte-identical to the runtime merge by construction (proven differentially
  in `tests/vite-cx-inline.test.ts`).

```ts
import { pandwindVite } from "pandwind/vite";

plugins: [pandwindVite({ preset })];
```

## `pandwindCssVite()` — css() extraction

Scans source files for literal `css(...)` / `css.class(...)` calls, resolves
them through the design layer, rewrites the statically representable calls to
their final class carriers, and serves the deduped stylesheet as a virtual
module. This means the `createCss` runtime is not shipped when a module only
contains static calls. Dynamic values and unsupported helpers stay on the
runtime fallback path:

```ts
import { createCss } from "pandwind/css";
import { pandwindCssVite } from "pandwind/vite";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

plugins: [pandwindCssVite(css)];
```

The Vite runtime transform also specializes the JavaScript runtime when a
module keeps a runtime CSS call. It recognizes `createCss`, generated CSS
facades, `createDesignCss`, and `createUnsafeCss`, then serves a virtual
module containing only the projections used by that module (`class`, `vars`,
`raw`, `props`, `group`, `input`, or `keyframes`; `group` includes its `vars`
dependency). This rewrite changes only the runtime import specifier, so the
full TypeScript `CssFn`/generated facade contract remains available to the
typechecker. Re-exports, dynamic member access, and other escaped factories
stay on the complete runtime because their consumers are not locally provable.
`firstThatWorks` remains part of the small callable core: its encoded fallback
values must be understood by ordinary `css()` and `.class()` compilation.

The compiler makes this decision per call site. A fully static call becomes a
literal class string and its factory can disappear. A dynamic call with known
flat scalar properties is emitted as a direct host carrier, so it pays only for
the value checks, normalization, structural classes, and token aliases that
the carrier needs. Preset-bound carriers keep token resolution; unsafe CSS
factories do not inject preset metadata. Literal token values can be projected
to individual entries; a dynamic value keeps its whole token group because its
runtime spelling is unknowable at build time. Dynamic object shape, computed
keys, spreads, escaped factories, and non-serializable preset data use the
conservative runtime instead.

```ts
// main.tsx
import "pandwind:css";
```

### Consuming a published component-library artifact

A library can publish `pandwind.lib.json` and expose it from its package. Add
the package specifier to the host extractor so its pre-extracted rules are
loaded without scanning library source:

```ts
plugins: [
	pandwindCssVite(css, {
		libraries: ["@acme/ui"],
	}),
];
```

The artifact is checked against the active preset, namespace, cascade mode and
layer, and default class strategy. A malformed, stale, or incompatible artifact
fails closed with the fields that differ. Leave `libraries` unset for ordinary
local source extraction.

`lib build` and runtime pruning cover different distribution boundaries. The
artifact supplies the host with pre-extracted CSS rules, variable-carrier rules,
used token declarations, and source hashes; it does not describe which
JavaScript runtime methods a consumer will call. The Vite runtime transform
therefore still analyzes source in the current bundle. Registered library
packages are excluded from that source transform by default: a library that
wants its own JavaScript runtime specialized should run its library build
through `pandwindCssVite` (or use `runtime generate` for a non-Vite build),
while the consuming application registers the `pandwind.lib.json` only for CSS.
This keeps the JSON artifact small and reusable instead of coupling it to one
consumer's runtime usage.

### `Stack` bindings and build-time folding

The bare `Stack` renderer and `stackFoldVite()` are an explicit
Tailwind-compatible fast path. Use them only when Tailwind, or another
compiler that owns the same utility classes, generates the stylesheet.

When the app uses a Pandwind class-name strategy, bind the renderer to the
same CSS compiler and pass the same engine to both build plugins:

```ts
import { createCss } from "pandwind/css";
import { createNamedAtomsStrategy } from "pandwind/css/named";
import { createStack } from "pandwind/stack/react";
import { createPandwindEngineContext, pandwindCssVite, stackFoldVite } from "pandwind/vite";

const className = createNamedAtomsStrategy("app");
const engine = createPandwindEngineContext({ preset, className });
export const css = createCss(preset, { className });
export const Stack = createStack(css);

plugins: [stackFoldVite({ engine }), pandwindCssVite(css, { engine })];
```

Static `<Stack>` props, including fully static responsive and variant objects,
become the strategy's class names and, for sheet-backed strategies, matching
generated CSS. With the Tailwind adapter, the same recipe feeds Tailwind's
scanner. Dynamic leaves stay on the runtime component. The engine is explicit because a JSX alias such as
`const Stack = createStack(css)` does not retain reliable compiler ownership
metadata for a Vite plugin to infer after re-exporting.

The native component-file adapters use the same renderer-neutral mapper and
are useful when the host compiler is Svelte or Astro:

```svelte
<script lang="ts">
  import Stack from "pandwind/stack/svelte";
</script>

<Stack direction={{ base: "column", md: "row" }} gap={{ base: 2, md: 4 }} class="demo">
  <div>Responsive content</div>
</Stack>
```

```astro
---
import Stack from "pandwind/stack/astro";
---

<Stack direction={{ base: "column", md: "row" }} gap={{ base: 2, md: 4 }} class="demo">
  <div>Responsive content</div>
</Stack>
```

These native files stay in the host framework's compilation lane and use the
default Tailwind-compatible classes. Use `class` for additional project
utilities; configured Pandwind class-name strategies remain available through
the JavaScript `createStack(css)` renderers above. `stackFoldVite()` also
recognizes static `<Stack>` usages in `.svelte` and `.astro` files, so place it
before the host framework plugin when those props should fold into generated
CSS. Dynamic native props remain runtime components.

### Composed CSS changes during Vite HMR

Pass the same composed CSS function that application modules use. During dev,
the extractor follows that module's Vite dependency graph and reloads the
composition when its source or imported theme changes. No preset path or
separate config file is needed:

```ts
// src/css.ts
import { createCss } from "pandwind/css";
import { preset } from "./theme";

export const css = createCss(preset);
```

```ts
// vite.config.ts
import { pandwindCssVite } from "pandwind/vite";
import { css } from "./src/css";

plugins: [pandwindCssVite(css)];
```

### Multiple presets or source lanes

Most applications need one `pandwindCssVite()` instance. Use more than one
when different source modules belong to different presets—for example, an
application shell with its own theme alongside a sandbox or component library
with a separate design system.

Give each instance a disjoint `cssSources` matcher, and give every additional
instance a unique `virtualId`:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { pandwindCssVite } from "pandwind/vite";
import { appCss } from "./src/app-css";
import { sandboxCss } from "./src/sandbox-css";

export default defineConfig({
	plugins: [
		pandwindCssVite(appCss, {
			cssSources: ["css"],
		}),
		pandwindCssVite(sandboxCss, {
			cssSources: ["sandbox-css"],
			virtualId: "pandwind:sandbox-css",
		}),
	],
});
```

The source modules must use the same presets as their extractor instances:

```ts
// src/app-css.ts
import { createCss } from "pandwind/css";
import { appPreset } from "./app-preset";

export const appCss = createCss(appPreset);
```

```ts
// src/sandbox-css.ts
import { createCss } from "pandwind/css";
import { sandboxPreset } from "./sandbox-preset";

export const sandboxCss = createCss(sandboxPreset);
```

If the CSS factory uses a custom namespace for dynamic carriers, repeat it on
the extractor. The build-time rules must use the same carrier names as the
runtime factory:

```ts
const css = createCss(appPreset, { namespace: "checkout" });

plugins: [pandwindCssVite(css, { namespace: "checkout" })];
```

The default namespace is `pw`. The option only changes Pandwind-owned
`css.vars()` carriers and critical-style marker attributes; custom
`ClassNameStrategy` output remains untouched.

Load every generated sheet from the application entry:

```ts
// main.tsx
import "pandwind:css";
import "pandwind:sandbox-css";
```

`cssSources` matches the import source used for the CSS factory, not a
filesystem glob. Keep those matchers separate; if two instances claim the
same source, both presets may try to extract it. Each instance also has its
own token resolution, class-name strategy, route-splitting configuration, and
virtual stylesheet. This pattern is useful for isolated design-system
boundaries, not for ordinary components that can share one preset.

### Mixed static/dynamic styles

Dynamic `css.class()` values can also be split at a safe JSX host boundary,
but this is opt-in because it changes a `className` attribute into a
`className`/`style` props spread:

```ts
pandwindCssVite(css, { transformDynamicClassName: true });
```

With the option enabled in the default or a sheet-backed class-name mode, this
source:

```tsx
<button
	className={css.class({
		color: props.color,
		padding: "2",
		opacity: props.opacity,
	})}
/>
```

becomes a direct host carrier (shown conceptually):

```tsx
<button
	{...{
		className: "<dynamic-color-class> <dynamic-opacity-class> <static-class>",
		style: {
			"--pw-c-color": props.color,
			"--pw-c-opacity": props.opacity,
		},
	}}
/>
```

The static declarations are compiled at build time; only dynamic declarations
need a carrier. For the supported flat scalar shape, the compiler emits a
direct `{ className, style }` expression with one evaluation per dynamic value,
safe-value filtering, numeric normalization, structural classes, and any
required preset token aliases. This removes both `css.props()` and `css.vars()`
from that call site. Unsupported shapes retain the public carrier so merge,
condition, and validation semantics stay exact.

A direct `className` rewrite is limited to a simple host with no existing
`style` or JSX spread prop. The compiler cannot use a props carrier in a plain
string expression without changing its return shape, so code such as
`const className = css.class({ color: dynamicColor, padding: "2" })` keeps the
runtime `class()` call. Use `css.props(css.vars(...), staticClass)` explicitly
when the surrounding API accepts host props. Use a relaxed or untyped CSS
binding if the raw dynamic value is intentionally outside a strict preset's
authored type.

The same static/dynamic partition also applies by default to mixed callable JSX
spreads:

```tsx
<div {...css({ color: "red", backgroundColor: shade, padding: 8 })} />
```

becomes a direct host carrier conceptually:

```tsx
<div
	{...{
		className: "<dynamic-structural-class> <static-class>",
		style: { "--pw-c-background-color": shade },
	}}
/>
```

The actual emitted expression is specialized so values are evaluated once and
invalid values are omitted exactly like `css.vars()`. Literal nested condition
objects are flattened into the same structural variable keys as the stylesheet
extractor. Literal or statically provable `const` values from module, function,
and block scope are expanded, including object spreads, and same-path
collisions use the JavaScript last-write winner while still evaluating
overwritten dynamic expressions for side effects.

Object-shaped `$raw` subtrees use the same partition: static raw declarations
join the static class and dynamic raw leaves use the direct variable carrier.
An unresolved `$raw` binding, dynamic raw spread, or unsafe raw shape remains
on the conservative `css.props(css.vars(...))` path.

The same lexical scope resolver is used by the rewriter, stylesheet extractor,
call-site scanner, diagnostics, and JSX pattern lane. This means a constant
declared inside a component or class method can feed a JSX carrier, a plain
`css()`/`css.class()` call, `css.keyframes()`, `css.group()`, or explicit
`css.props(css.vars(...))` composition without making the generated CSS and
JavaScript disagree. Parameters, `let`/`var`, shadowed names, and reads before
a `const` declaration stay dynamic to preserve JavaScript binding and TDZ
semantics.

The compiler keeps the conservative `css.props(css.vars(...))` carrier only
when the direct representation would change semantics: an unknown/dynamic
spread, an ancestor/descendant path collision, an unsupported array or
function-valued entry, a dynamic computed key, or a dynamic `firstThatWorks`
fallback. A statically known `firstThatWorks` alias can use the direct class
lane when the configured class strategy can emit its fallback declarations;
strategies that cannot represent those declarations keep the valid runtime
call.

The same lowering recognizes an explicit flat
`css.props(css.vars({...}), "static-class")` composition, even outside JSX.
It keeps the public composition untouched for non-string additional props,
fallback declarations, or any other shape whose merge semantics cannot be
proven equivalent. The same structural analyzer is available to
`@pandwind/lint-plugin`; enable
`pandwind-extraction/no-dynamic-carrier-fallback` at `error` severity to make
these remaining fallback shapes visible in the IDE. The Vite transform keeps
the runtime carrier because it is semantically valid; the lint rule is the
fail-fast authoring boundary and therefore does not require a build-breaking
exception for ordinary valid fallback code.

Enable `pandwind-extraction/no-dynamic-keyframes` as well. A
`css.keyframes()` body is a build-time-only contract: the extractor must prove
one static step object per call before it can emit the matching deterministic
`@keyframes` rule and replace the call with its name. The rule shares the Vite
literal evaluator and lexical scope resolver, so module, function, block, and
class-method `const` bodies remain valid while shadowed, dynamic, or malformed
bodies are reported at the source call site.

## Per-route CSS splitting (opt-in)

```ts
pandwindCssVite(css, {
	splitByRoute: [{ match: /\/routes\/admin\//, name: "admin" }],
});
```

Route-exclusive atoms are served from `pandwind:css?route=<name>` while shared
atoms and unmatched files stay in the global sheet; a virtual
`pandwind:css-manifest` module exports the route -> id map. Default remains
one global stylesheet.

## Critical-CSS inlining (opt-in)

Add `html` paths to your routes and `inlineCritical: true`: at build time each
entry's `<head>` gets the route's full stylesheet (common + exclusive chunks)
inlined as a marked `<style>` tag, so first paint needs zero stylesheet
requests. Capped per route (64 KB default) and skipped loudly on overflow; dev
mode untouched. Drop the matching `<link>` for fully-covered routes to avoid
duplicate delivery.
