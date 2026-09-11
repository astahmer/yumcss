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
| keep Tailwind and add autocomplete        | generated tw()          |
| write CSS objects and extract atomic CSS  | createCss(preset)       |
| give components a small design vocabulary | createDesignCss(preset) |
| combine styles from several sources       | cx()                    |

The [repository README](../../README.md) has the five-minute setup. The
[documentation directory](../../docs/) has the complete guides and API
reference.

## A small example

```ts
import { createCss } from "pandwind/css";
import { preset } from "./preset";

const css = createCss(preset);

export const card = css.class({
	backgroundColor: "$surface",
	color: "$ink",
	padding: "4",
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

- [Build your first app](../../docs/src/content/docs/guides/basic.md)
- [The css() API](../../docs/src/content/docs/api/css.md)
- [Design-system styles](../../docs/src/content/docs/api/design-css.md)
- [Runtime and SSR boundaries](../../docs/src/content/docs/guides/component-library.md)
