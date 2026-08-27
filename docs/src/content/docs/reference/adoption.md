---
title: Adoption and migration patterns
description: How to combine pandwind with authored CSS and external variant composition, and how to migrate from common CSS-in-JS tools.
sidebar:
  order: 1
---

## Recommended architecture

Use each lane for the job it is good at:

| Need                                                        | Recommended lane              | Ownership                                |
| ----------------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| Typed local styles and variants already known at build time | `css()` / `createDesignCss()` | Pandwind extraction                      |
| Tailwind utilities or an existing Tailwind theme            | `tw()`                        | Tailwind compilation                     |
| Runtime values such as user-selected colors                 | `css.vars()`                  | Inline custom properties, host rendering |
| Globals, keyframes, fonts, layers, and complex selectors    | Explicit `.css` imports       | The web bundler                          |
| Variant selection and compound conditions                   | External CVA-style package    | Class-string selection                   |

This keeps the public Pandwind API small while making every output lane
visible in build output and tooling. See [Authored CSS on the web](/reference/authored-css/)
for the browser-global boundary.

## Variants without a Pandwind recipe API

`class-variance-authority` and similar packages can select strings returned by
Pandwind. Keep the map literal so every `css.class()` call is extractable:

```tsx
import { cva } from "class-variance-authority";
import { cx } from "pandwind/cx";
import { css } from "./design";

const button = cva(css.class({ $frame: { corners: "lg" } }), {
	variants: {
		size: {
			sm: css.class({ $frame: { pad: [8, 12] } }),
			lg: css.class({ $frame: { pad: [12, 20] } }),
		},
	},
	defaultVariants: { size: "sm" },
});

const className = cx(button({ size: "lg" }), css.class({ $text: { weight: "bold" } }));
```

Pandwind owns typing, extraction, and conflict-aware `cx()` composition; CVA
owns the variant decision. `css.vars()` is the escape hatch for values that
cannot be enumerated at build time.

## Package-library pattern

A component library can ship both lanes without a runtime registry:

```json
{
	"exports": {
		".": "./dist/index.js",
		"./styles.css": "./dist/styles.css"
	}
}
```

The library documents `import "@acme/components/styles.css"` for resets,
keyframes, fonts, and other authored rules. Its component modules use
Pandwind class strings. If authored CSS consumes design tokens, export a
token CSS entry containing stable `--pw-*` custom properties and reference
those variables from the authored stylesheet.

## Migration map

| From                        | First migration step                                                              | Important boundary                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tailwind                    | Move typed utility calls to `tw()`; keep the existing Tailwind theme              | Dynamic class construction still needs a static map or runtime CSS strategy                                 |
| Panda                       | Migrate local style objects to `css()` / `createDesignCss()`                      | Keep global CSS and recipes as explicit CSS/external composition until separately designed                  |
| StyleX                      | Map static declarations to `css.class()` and preserve authored CSS imports        | StyleX's compile-time constraints remain a useful discipline; use `css.vars()` only for true runtime values |
| Emotion / styled-components | Move static declarations to `css.class()` and remove runtime stylesheet insertion | Globals/keyframes/font-face move to ordinary CSS owned by the host bundler                                  |
| Linaria                     | Keep build-time static extraction, replacing generated calls with Pandwind calls  | Runtime values use serializable `css.vars()` output and host rendering                                      |

After migration, run `pandwind analyze` to find missing extraction, unsupported
constructs, and authored CSS import edges. The analyzer reports locations and
next actions instead of silently treating skipped code as extracted.
