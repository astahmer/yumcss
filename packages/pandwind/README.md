# pandwind

Typed style objects for teams that want build-time CSS without giving up
ordinary CSS or a clear runtime escape hatch.

## Start here

Install the package:

```sh
pnpm add pandwind
```

Then choose the smallest API that matches the job:

| You want to…                              | Use                     |
| ----------------------------------------- | ----------------------- |
| write CSS objects and extract atomic CSS  | createCss(preset)       |
| give components a small design vocabulary | createDesignCss(preset) |
| keep Tailwind and add autocomplete        | generated tw()          |
| combine styles from several sources       | cx()                    |

Start with `createCss(preset)` for new Pandwind code. The generated `tw()`
helper is the compatibility lane for applications that already use Tailwind
or specifically want its utility ecosystem.

The [repository README](../../README.md) has the five-minute setup. The
[documentation directory](../../docs/) has the complete guides and API
reference.

## Preset layers

Pandwind ships two small built-in preset layers:

- `csstypePreset` from `pandwind/preset/csstype` provides structural CSS properties
  and conditions without opinionated token scales.
- `defaultPreset` from `pandwind/preset/default` provides the ready-to-use
  Pandwind property and stock scale mappings.

The repository's `@pandwind/example-preset` is intentionally separate: it is a
rich semantic-token and color-palette showcase, not an implicit dependency of
the default app path.

## A small example

```ts
import { createCss } from "pandwind/css";
import { defaultPreset } from "pandwind/preset/default";

const css = createCss(defaultPreset);

export const card = css.class({
	backgroundColor: "white",
	color: "black",
	padding: 4,
	borderRadius: "lg",
});
```

The preset is the type boundary: tokens, conditions, and allowed values come
from your project instead of a second hand-maintained vocabulary.

## Build integration

Use pandwindCssVite() (or the equivalent bundler adapter) so literal calls
are extracted during the build. Use css.vars() or css.input() when a value is
genuinely known only at runtime. Keep browser-wide concerns such as fonts,
keyframes, and global selectors in authored CSS.

## Learn more

- [Getting started](../../docs/src/content/docs/getting-started.md)
- [Build your first Tailwind app](../../docs/src/content/docs/guides/basic.md)
- [The css() API](../../docs/src/content/docs/api/css.md)
- [Design-system styles](../../docs/src/content/docs/api/design-css.md)
- [Runtime and SSR boundaries](../../docs/src/content/docs/guides/component-library.md)
