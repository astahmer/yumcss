---
title: Reset stylesheets
description: Start an adopting project from the ecosystem's own baseline with pandwind/reset/<ecosystem>.
sidebar:
  order: 6
---

Every styling engine ships a baseline stylesheet that flattens the browser's
own defaults before authored CSS runs: Tailwind calls it Preflight, Panda calls
it preflight, and StyleX leaves it to the application. Pandwind publishes the
same baseline as a plain CSS asset per ecosystem, so a project that moved its
style objects to Pandwind does not keep a second engine, or a hand-written
normalize, only to keep that baseline.
For an engine that ships none, Pandwind publishes its own baseline instead.

A reset is a stylesheet, not a preset. It is copied into `dist/reset/` at build
time, so it adds CSS bytes to the stylesheet output and nothing to the
JavaScript runtime, and it does not touch `createCss`, its token resolution, or
any type.

| reset         | import                       | baseline                                                        |
| ------------- | ---------------------------- | --------------------------------------------------------------- |
| `tailwindcss` | `pandwind/reset/tailwindcss` | Tailwind v4's Preflight, ported from `tailwindcss@4.3.3`        |
| `panda`       | `pandwind/reset/panda`       | Panda CSS's preflight, ported from `@pandacss/generator@1.12.1` |
| `pandwind`    | `pandwind/reset/pandwind`    | Pandwind's own baseline, authored in this repository            |

```ts
import "pandwind/reset/tailwindcss";
```

Import the reset before the stylesheet that carries the authored application
CSS. A reset imported after authored rules wins the cascade for the
declarations it sets, which is the opposite of a baseline.

## What a reset expects from the project

A reset only flattens browser defaults. It installs no theme, no palette, and
no font scale, and it reads no Pandwind token: every value it needs is either a
literal in the stylesheet or an upstream global custom property with the same
fallback the engine itself would resolve. A Tailwind project that defines
`--default-font-family` keeps its own family; a project that defines nothing
gets Tailwind v4.3.3's own `--font-sans` and `--font-mono` stacks.

Panda resolves its baseline through the same escape hatches: `--global-*`
custom properties and `--*-fallback` expressions that a project sets from its
own `globalCss`. The ported Panda reset keeps both the property names and the
fallbacks, so a project that defines none of them resolves exactly what Panda
resolves, and a project that moved its `globalCss` values across keeps them.

Resets are independent of presets, and the two axes do not have to agree. A
project may import `pandwind/reset/tailwindcss` while authoring through
`defaultPreset`, a hand-written preset, or the Panda reset. Nothing in a reset
reads the preset that `createCss` was called with.

## Reset versus preset

The two names differ by one letter and describe unrelated layers, so the import
is the only thing that should decide which one a project reaches for:

- A **preset** (`pandwind/preset/<ecosystem>`) is the typed vocabulary
  `createCss(preset)` resolves: token groups, property bindings, conditions,
  and strictness. It ships as JavaScript and changes what a style object may
  say.
- A **reset** (`pandwind/reset/<ecosystem>`) is a stylesheet that runs before
  the author's CSS and flattens what the browser already applies. It ships as
  CSS and changes nothing about what a style object may say.
- A **prose** stylesheet (`pandwind/prose/<ecosystem>`) styles a subtree the
  author marks with a class, which is what rendered markdown needs: headings,
  lists, tables, and code blocks nobody authored by hand. It ships as CSS and
  adds no property binding. See [Prose stylesheets](/api/prose/).

A project that imports both is not pairing them; it is picking a vocabulary
and a baseline, one at a time.

## When the engine ships no baseline

StyleX is the clearest case: it ships no reset of its own, and its
[installation guide](https://stylexjs.com/docs/learn/installation/vite/) leaves
the baseline to the application's global stylesheet. A project in that position
imports `pandwind/reset/pandwind`, the one reset here that is authored in this
repository instead of ported, and therefore the one with no upstream to diff
against. It covers the box model Pandwind's own bindings address and nothing
else:

- the declarations `borderWidth`, `borderStyle`, and `borderColor` depend on,
  because Pandwind emits them as three independent properties and a bare
  `borderWidth: 2` stays invisible until something supplies
  `border-style: solid`
- the box model itself: `border-box` sizing, the user-agent margins on body and
  the block elements that carry them, replaced media as blocks that fit their
  container, form controls that inherit the surrounding type, and collapsed
  table borders

It declares no font stack, no color, and no custom property, so it composes
with any preset. It also leaves typography and list markers alone, because
heading sizes and bullet indents are design decisions the project has already
made; a project that wants a flattened typographic baseline wants one of the
ports instead.

## Cascade layers

Every shipped reset wraps its rules in `@layer reset`, and the ported header
records which upstream layer it replaced. On Pandwind's default
`specificity` cascade nothing has to be declared, because unlayered rules
beat layered ones and the reset therefore sorts before every generated rule.

A project that opts into `cascade: "layers"` declares the order once, ahead of
both stylesheets:

```css
@layer reset, pandwind;
```

Layer order is fixed by the first time a layer name appears, so an import
order that puts the generated stylesheet first would otherwise sort `reset`
after `pandwind`.

## Typing the import

The reset path resolves to a `.css` file, so the import type comes from the
bundler. A Vite project that already references `vite/client` in its
`tsconfig` types has it. Everywhere else, declare the module once:

```ts
declare module "pandwind/reset/tailwindcss";
```

## Provenance and license

Each reset carries a header that names where its rules come from: the upstream
file and pinned revision for a port, this repository for Pandwind's own. The
header repeats the license notice and lists every deliberate difference from
upstream. A ported reset is never a verbatim copy.

| reset         | upstream                                    | license                                   |
| ------------- | ------------------------------------------- | ----------------------------------------- |
| `tailwindcss` | `tailwindcss@4.3.3` `preflight.css`         | MIT, Copyright (c) Tailwind Labs, Inc.    |
| `panda`       | `@pandacss/generator@1.12.1` `reset-css.ts` | MIT, Copyright (c) 2023 Segun Adebayo     |
| `pandwind`    | none, authored here (StyleX ships no reset) | MIT, Copyright (c) 2026 Alexandre Stahmer |
