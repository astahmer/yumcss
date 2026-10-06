---
title: Prose stylesheets
description: Style rendered markdown with yumcss/prose/tailwindcss, the Tailwind Typography scale as a plain CSS asset.
sidebar:
  order: 7
---

Documentation sites, changelogs, and blog posts render HTML nobody authored by
hand: headings, paragraphs, lists, blockquotes, tables, and code blocks come out
of a markdown pipeline. Tailwind answers that with its Typography plugin, one
`.prose` class on a container plus a `--tw-prose-*` custom-property layer for
theming. A project that moves its style objects to YumCSS would lose the whole
scale, so YumCSS publishes the same family as a plain CSS asset.

| prose         | import                     | family                                                              |
| ------------- | -------------------------- | ------------------------------------------------------------------- |
| `tailwindcss` | `yumcss/prose/tailwindcss` | Tailwind Typography, compiled from `@tailwindcss/typography@0.5.20` |

```ts
import "yumcss/prose/tailwindcss";
```

```html
<article class="prose prose-invert">
	<!-- rendered markdown -->
</article>
```

A prose stylesheet is a stylesheet, not a preset. It is copied into
`dist/prose/` at build time, so it adds CSS bytes to the stylesheet output and
nothing to the JavaScript runtime, and it does not touch `createCss`, its token
resolution, or any type.

## What the asset ships

The asset is the compiled output of the plugin, so it ships every modifier a
Tailwind project could have used rather than only the ones a build referenced:

- `.prose`, the base scale, including `max-width: 65ch`
- `.prose-sm`, `.prose-lg`, `.prose-xl`, and `.prose-2xl`
- `.prose-invert`, the dark-mode switch
- the 22 color themes, `.prose-slate` through `.prose-rose`
- `.not-prose`, the escape hatch for a subtree the scale should leave alone

The class names are upstream's, so a project's existing markup, its
`prose prose-invert` utility strings, and its `--tw-prose-*` overrides keep
working without an edit.

## Variable contract

Every rule reads its color from an upstream custom property, so restyling the
scale does not mean fighting the asset. Each role below has a light and an
invert spelling, and the pairs are why `.prose-invert` is a one-class switch:

| role            | base                       | invert twin                       |
| --------------- | -------------------------- | --------------------------------- |
| body text       | `--tw-prose-body`          | `--tw-prose-invert-body`          |
| headings        | `--tw-prose-headings`      | `--tw-prose-invert-headings`      |
| lead paragraphs | `--tw-prose-lead`          | `--tw-prose-invert-lead`          |
| links           | `--tw-prose-links`         | `--tw-prose-invert-links`         |
| bold text       | `--tw-prose-bold`          | `--tw-prose-invert-bold`          |
| list counters   | `--tw-prose-counters`      | `--tw-prose-invert-counters`      |
| list bullets    | `--tw-prose-bullets`       | `--tw-prose-invert-bullets`       |
| blockquotes     | `--tw-prose-quotes`        | `--tw-prose-invert-quotes`        |
| quote borders   | `--tw-prose-quote-borders` | `--tw-prose-invert-quote-borders` |
| captions        | `--tw-prose-captions`      | `--tw-prose-invert-captions`      |
| keyboard text   | `--tw-prose-kbd`           | `--tw-prose-invert-kbd`           |
| keyboard shadow | `--tw-prose-kbd-shadows`   | `--tw-prose-invert-kbd-shadows`   |
| inline code     | `--tw-prose-code`          | `--tw-prose-invert-code`          |
| code in pre     | `--tw-prose-pre-code`      | `--tw-prose-invert-pre-code`      |
| pre background  | `--tw-prose-pre-bg`        | `--tw-prose-invert-pre-bg`        |
| rules           | `--tw-prose-hr`            | `--tw-prose-invert-hr`            |
| table borders   | `--tw-prose-th-borders`    | `--tw-prose-invert-th-borders`    |
| table dividers  | `--tw-prose-td-borders`    | `--tw-prose-invert-td-borders`    |

Because the names are upstream's, a project that already themes prose keeps its
values by declaring them again on the `.prose` container or on `:root`:

```css
.prose {
	--tw-prose-body: var(--color-gray-900);
	--tw-prose-headings: var(--color-gray-900);
}
```

That override is also the way to drive the scale from a YumCSS preset: the
preset's token custom properties are ordinary custom properties, so a color
theme is a handful of `var()` assignments, not a second copy of the ruleset.

## Cascade layers

The rules sit in `@layer prose`. On YumCSS's default `specificity` cascade
nothing has to be declared, because unlayered rules beat layered ones and an
atomic class therefore wins over every prose declaration for the same element.

A project that opts into `cascade: "layers"` declares the order once, ahead of
all three stylesheets:

```css
@layer reset, prose, yumcss;
```

For a named generated layer, replace `yumcss` with the configured layer path.

Layer order is fixed by the first time a layer name appears, so a declaration
that stops at `yumcss` sorts the whole prose scale after every generated atom
and prose would win the properties both set. If the application gives generated
rules a custom layer, use that name in the declaration instead. Tailwind emits
the same relationship inside `@layer utilities`, where the `.prose` rules come
first and the utility classes follow.

## Divergences from upstream

The asset is ported, not copied verbatim. Four differences, all mechanical:

1. The rules sit in `@layer prose` instead of Tailwind's `@layer utilities`,
   because YumCSS does not ship that layer and the project declares its order
   instead.
2. The `.not-prose` guard is written `.not-prose, .not-prose *` where upstream
   writes `[class~="not-prose"], [class~="not-prose"] *`. Both selectors sit
   inside `:where()`, so both contribute zero specificity and match the same
   elements; the class form is about 5.5 KB smaller across the guard chains.
3. The element variants (`prose-headings:`, `prose-a:`, `prose-img:`, ...) are
   absent. Upstream registers them as utilities, and a static asset has no
   utility engine to attach them to. Restyle those elements by targeting the
   tags directly, or with `css.class()` on the element itself.
4. The color themes are shipped whole rather than narrowed to the modifiers a
   build referenced. Every value is upstream's, so no project sees a different
   palette; it only pays for themes it may not use.

The divergence list is also the asset's header comment, together with the
upstream permalinks and the license notice, so the file explains itself where it
is read.

## Reset, preset, or prose

The three names are close and describe unrelated layers. The import is the only
thing that should decide which one a project reaches for:

| asset  | import                      | what it is                                                                                     |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------- |
| preset | `yumcss/preset/<ecosystem>` | the typed vocabulary `createCss(preset)` resolves: token groups, property bindings, conditions |
| reset  | `yumcss/reset/<ecosystem>`  | a baseline stylesheet that runs before authored CSS and flattens browser defaults              |
| prose  | `yumcss/prose/<ecosystem>`  | a stylesheet applied to a subtree the author marks, styling elements the author did not write  |

A project typically imports one preset and, at most, one asset from each
stylesheet family. See [Reset stylesheets](/api/resets/) for the baseline half
of that comparison.

## Typing the import

The path resolves to a `.css` file, so the import type comes from the bundler.
A Vite project that already references `vite/client` in its `tsconfig` types
has it. Anywhere else, declare the module once:

```ts
declare module "yumcss/prose/tailwindcss";
```

## Provenance and license

`scripts/promote-tailwind-prose.ts` compiles the asset from the pinned
`@tailwindcss/typography` and `tailwindcss` packages through
`@tailwindcss/node`, so a version bump is a `pnpm run prose:generate` run plus
a reviewed diff, and `pnpm run prose:check` fails when the checked-in bytes and
a fresh render disagree.

| prose         | upstream                                        | license                                |
| ------------- | ----------------------------------------------- | -------------------------------------- |
| `tailwindcss` | `@tailwindcss/typography@0.5.20` `src/index.js` | MIT, Copyright (c) Tailwind Labs, Inc. |
