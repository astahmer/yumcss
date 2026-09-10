---
title: Why pandwind exists
description: Decide whether Pandwind fits your team before learning its internals.
sidebar:
  order: 2
---

Pandwind exists for a common middle ground:

- raw class strings are easy to start with but easy to mistype;
- a large CSS-in-JS system can make every component depend on a runtime; and
- a design system needs a vocabulary that is smaller and more intentional than
  every CSS property in the browser.

Pandwind keeps the authoring surface small and lets the build system do the
work it can prove.

## You should try it if…

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

Pandwind is meant to fit beside existing CSS. It is not a requirement that
every rule in an application move into a Pandwind function.

## The decisions in plain language

### Keep the core small

There are three authoring lanes — `tw()`, `css()`, and design `css()` — plus
`cx()` for composition. A project can use one lane without learning the other
two. New convenience APIs are not added just to cover an edge case; the
compiler and tooling should improve behind the stable surface instead.

### Let the build handle known work

Literal styles can be turned into class strings or extracted atomic CSS before
the browser runs. This is the default path for production applications.

When a value is genuinely dynamic, Pandwind keeps it dynamic and makes the
boundary visible through `css.vars()`, a Tailwind safelist, or authored CSS.
There is no promise that user input, global browser behavior, or framework
runtime semantics can be compiled away.

### Use the real project as the type source

The Tailwind helper is generated from the project's Tailwind design system.
The atomic and design lanes use the project's preset. This avoids the most
frustrating kind of type safety: a beautiful list of values that is different
from what the build actually accepts.

### Keep browser-wide behavior in CSS

Globals, fonts, keyframes, layers, and complex selectors belong naturally in
authored `.css` files. Pandwind can discover and report those files, but it
does not force every browser primitive through a TypeScript API.

### Be honest about migrations

The codemod has many adapters, but an adapter name is not a guarantee that an
arbitrary production app is losslessly portable. Studio and the CLI preserve
unsupported source and report residuals for theme callbacks, recipes,
framework behavior, runtime interpolation, and other semantics that need a
human decision.

## The trade-off

Pandwind asks you to accept generated files and a build step in exchange for:

- editor feedback from your own tokens and utilities;
- conflict behavior derived from the actual CSS engine;
- extracted output for static styles;
- explicit runtime escape hatches; and
- analyzer and migration evidence you can inspect in CI.

If that trade is not useful for your project, ordinary CSS is a good answer.

## Where to go next

- [Build your first app](/guides/basic/) for the shortest working path.
- [Build a design system](/guides/design-system/) for tokens and themes.
- [Playground, inspector, and Studio](/tooling/analyze-and-studio/) to see
  what each tool actually does.
- [Current limitations](/reference/current-limitations-and-criticism/) for a
  candid view of the unfinished or experimental parts.
