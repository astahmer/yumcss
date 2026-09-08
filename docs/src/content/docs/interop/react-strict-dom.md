---
title: React Strict DOM integration
description: Use Pandwind style artifacts with React Strict DOM on web and native, or migrate RSD styles through the codemod.
sidebar:
  order: 4
---

[React Strict DOM](https://github.com/react/react-strict-dom) is a cross-platform
React host API. Its documented style shape is `css.create(...)` plus `style`
on `html.*` elements; the same source model is compiled for web and resolved
into React Native style objects for native.

Pandwind supports that style boundary without bundling React Strict DOM,
StyleX, React Native, or either platform compiler. React Strict DOM remains the
owner of `html.*`, host props, events, and platform compatibility. Pandwind
provides the style artifact and the migration adapter.

## Use Pandwind styles with React Strict DOM

The `pandwind/react-strict-dom` entry point has the same named-map shape as
RSD's `css.create`:

```tsx
import { html } from "react-strict-dom";
import { createCss } from "pandwind/react-strict-dom";

const css = createCss();
const styles = css.create({
	card: { color: "red", padding: "1rem", borderRadius: "8px" },
	active: { backgroundColor: "blue" },
});

export function Card({ active }: { active: boolean }) {
	return <html.div style={[styles.card, active && styles.active]} />;
}
```

On web, `createCss()` returns a StyleX-compatible compiled map with the `$$css`
marker and atomic class values expected by React Strict DOM's web style
carrier. The corresponding stylesheet must still be extracted or served by
the Pandwind CSS pipeline; the style map does not inject CSS by itself.

For static web maps, connect the existing Pandwind CSS plugin to the same
StyleX class-name strategy. The plugin recognizes `createCss()` imported from
`pandwind/react-strict-dom`, extracts each literal entry in `css.create(...)`,
and leaves the RSD source API intact:

```ts
import { createStyleXAdapter } from "pandwind/css/stylex";
import { pandwindCssVite } from "pandwind/vite";
import { examplePreset } from "@pandwind/example-preset";

export default {
	plugins: [
		pandwindCssVite(examplePreset, {
			className: createStyleXAdapter({ conditions: examplePreset.conditions }),
		}),
	],
};
```

Pass the same condition metadata to `createCss({ conditions })` when the
source uses conditional styles. Dynamic RSD style functions remain on RSD's
compiler/runtime path; Pandwind does not guess CSS for an unbounded value.
Explicit native `createCss({ platform: ReactStrictDomPlatform.Native })`
bindings are ignored by this web stylesheet scanner.

For native, select the native backend explicitly:

```tsx
import { html } from "react-strict-dom";
import { createCss, ReactStrictDomPlatform } from "pandwind/react-strict-dom";

const css = createCss({ platform: ReactStrictDomPlatform.Native });
const styles = css.create({ card: { padding: "1rem", borderRadius: "4px 8px" } });

export function NativeCard() {
	return <html.div style={styles.card} />;
}
```

The native artifact is a plain React Native style object. Lengths and CSS
shorthands use the same conversion policy as `pandwind/react-native`, so
`1rem` becomes `16` and a two-value radius expands to its four corners.
`createCx()` merges compiled artifacts with the selected platform's semantics.

When a project already has a typed Pandwind preset, use the design surface to
keep its vocabulary and token resolution:

```ts
import { createDesignCss } from "pandwind/react-strict-dom";
import { examplePreset } from "@pandwind/example-preset";

const css = createDesignCss(examplePreset);
const card = css({ $frame: { fill: "$blue-500", pad: 4 } });
```

The target project still owns the preset and host setup. Pandwind does not
turn RSD's compiler configuration or theme context into a guessed runtime
default.

## Migrate RSD source

The codemod recognizes the documented static forms and uses the real target
carriers in both directions:

```sh
pandwind-codemod migrate --from react-strict-dom --to pandwind src
pandwind-codemod migrate --from pandwind --to react-strict-dom src
```

The supported static path includes:

- `css.create` named style maps;
- `html.*` intrinsic hosts with `style`;
- style arrays that can be represented by `cx` on the Pandwind side;
- `css.keyframes` and `css.defineVars` as Pandwind semantic rules;
- Pandwind class carriers emitted as `css.create(...)` plus `html.* style`.
- static Tailwind and UnoCSS class carriers on intrinsic hosts projected to
  `html.* style` when the source adapter can prove the host shape;

The adapter preserves source code with a typed residual when the meaning is
owned by RSD's host/compiler layer. This includes `css.createTheme`,
`compat.native`, `css.props`, provider/compiler configuration, dynamic host
components such as Chakra `Box`, and non-React host syntax. A residual is
intentional: removing those APIs would claim a migration that Pandwind cannot
prove equivalent.

The executable API evidence lives in
[`official-api-matrix.test.ts`](https://github.com/astahmer/pandwind/blob/main/packages/codemod/tests/official-adapter-api-matrix.test.ts),
[`official-adapter-api-families.test.ts`](https://github.com/astahmer/pandwind/blob/main/packages/codemod/tests/official-adapter-api-families.test.ts),
and [`react-strict-dom-adapter.test.ts`](https://github.com/astahmer/pandwind/blob/main/packages/codemod/tests/react-strict-dom-adapter.test.ts).

See the [React Strict DOM repository](https://github.com/react/react-strict-dom)
and its [package README](https://github.com/react/react-strict-dom/blob/main/packages/react-strict-dom/README.md)
for the host and compiler setup that remains outside Pandwind.
