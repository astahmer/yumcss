---
title: Why yumcss exists
description: Decide whether YumCSS fits your team before learning its internals.
sidebar:
  order: 2
---

YumCSS exists for a common middle ground:

- raw class strings are easy to start with but easy to mistype;
- a large CSS-in-JS system can make every component depend on a runtime; and
- a design system needs a vocabulary that is smaller and more intentional than
  every CSS property in the browser.

YumCSS keeps the authoring surface small and lets the build system do the
work it can prove.

## You should try it if…

- you are writing new components and want typed CSS objects with extracted
  atomic output;
- your team already uses Tailwind and wants typed objects instead of long
  strings;
- you want atomic CSS-in-JS but still care about extraction, SSR, and a small
  runtime path;
- your components need semantic tokens and a design-oriented vocabulary; or
- you are moving between styling libraries and want a report instead of a
  blind rewrite.

## You probably do not need it if…

- plain CSS or ordinary Tailwind classes already solve the problem well;
- your project does not benefit from a shared token contract; or
- you want a framework-specific recipe system and do not need a typed CSS
  compiler or migration tool.

YumCSS is meant to fit beside existing CSS. It is not a requirement that
every rule in an application move into a YumCSS function.

## The decisions in plain language

### Keep the core small

`css()` is the default path for new code. Use `tw()` to add typed objects to an
existing Tailwind project, and use `createDesignCss()` when a component library
needs its own design vocabulary. `cx()` composes existing classes across those
workflows. You can adopt each supporting path only when the project needs it.
New convenience APIs are not added just to cover an edge case; the compiler
and tooling should improve behind the stable surface instead.

### Let the build handle known work

Literal styles can be turned into class strings or extracted atomic CSS before
the browser runs. This is the default path for production applications.

When a value is genuinely dynamic, YumCSS keeps it dynamic and makes the
boundary visible through `css.vars()`, a Tailwind safelist, or authored CSS.
There is no promise that user input, global browser behavior, or framework
runtime semantics can be compiled away.

### Use the real project as the type source

The Tailwind helper is generated from the project's Tailwind design system.
The atomic and design lanes use the project's preset. This avoids the most
frustrating kind of type safety: a beautiful list of values that is different
from what the build actually accepts.

### Keep browser-wide behavior in CSS

Broad globals, fonts, layers, and complex selectors belong naturally in
authored `.css` files. A preset can also own flat build-time selectors, named
keyframes, and typed font faces through the third `define.preset(theme, options, web)` argument; YumCSS
does not force every browser primitive through a TypeScript API. A
component-local animation remains available through `css.keyframes()`, which
emits a plain `@keyframes` rule.

### Be honest about migrations

The codemod has many adapters, but an adapter name is not a guarantee that an
arbitrary production app is losslessly portable. Migration Preview and the CLI
show route output, residuals, and proof status. The [API matrix](/interop/official-api-matrix/)
reports canonicality separately from project proof; unverified routes stay
unverified. Theme callbacks, recipes, framework behavior, runtime
interpolation, and other unsupported semantics need a human decision.

## The trade-off

YumCSS asks you to accept generated files and a build step in exchange for:

- editor feedback from your own tokens and utilities;
- conflict behavior derived from the actual CSS engine;
- extracted output for static styles;
- explicit runtime escape hatches; and
- analyzer and migration evidence you can inspect in CI.

If that trade is not useful for your project, ordinary CSS is a good answer.

## Where to go next

- [Getting started](/getting-started/) for the primary CSS path.
- [Tailwind component patterns](/guides/basic/) after generating the helper
  from your existing Tailwind stylesheet.
- [Build a design system](/guides/design-system/) for tokens and themes.
- [Tooling workflows](/tooling/workflows/) to see
  what each tool actually does.
- [Current limitations](/reference/current-limitations-and-criticism/) for a
  candid view of the unfinished or experimental parts.
