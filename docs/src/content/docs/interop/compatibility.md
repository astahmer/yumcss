---
title: Tailwind compatibility — proven, not assumed
description: Every claim checked against the real tailwindcss compiler with postcss as an independent parsing oracle.
sidebar:
  order: 2
---

Every claim below is checked against the real `tailwindcss` compiler, with
postcss as an independent parsing oracle — never against pandwind's own output
parsers. The suites in
`packages/pandwind/tests/tw-tailwind-parity.test.ts` and
`packages/pandwind/tests/css-tw-parity.test.ts` are the proof:

- **Every `tw()` candidate is a real Tailwind class.** All ~23,000 utilities
  in `getClassList()` compile through `@tailwindcss/node`; nothing fails.
- **The conflict map predicts exactly what Tailwind emits.** For every
  candidate, the committed generated map (after canonicalization) predicts
  precisely the standard properties Tailwind's compiled CSS sets — no
  sampling, every candidate.
- **`cx()` output still compiles to the survivors' rules only.** Last-wins,
  variant-scoped and compose merges are recompiled by real Tailwind and only
  the surviving classes produce rules.
- **`css()` and `tw()` emit the same resolved CSS for the same intent.** The
  atomic engine's hashed classes and Tailwind's literal utilities can never
  share a class name; what is proven is that for the same logical style both
  engines resolve to byte-identical `(property, value)` declarations, with the
  same pseudo-class on variants.
- **A committed snapshot of real Tailwind output** —
  `packages/pandwind/tests/snapshots/tw-tailwind-compiled.css.snap` — pins the
  compiler output the corpus relies on, so an engine upgrade that changes
  emitted CSS is visible in review.

What is deliberately _not_ asserted:

- Tailwind's internal `--tw-*` custom properties, `@property` blocks and
  keyframes (implementation details, not authored styles);
- media-query syntax: Tailwind v4 emits range queries, presets write
  `(min-width: …)` — semantically equivalent, documented in the test header,
  not byte-compared.

Byte-identical class names between `css()` and `tw()` _are_ asserted — that is
exactly what the [tailwind adapter](/interop/tailwind-adapter/) does, proven
against real Tailwind output in `tests/tw-adapter.test.ts`.

Non-happy paths are covered too:
`packages/pandwind/tests/robustness.test.ts` throws empty/nullish/unknown/
weird inputs at `tw()`, `css()`, `cx()`, the adapter and the static extractors
and asserts three invariants — nothing crashes, nothing is silently dropped,
and every emitted class still compiles through real Tailwind.

## Container queries

Container-query variants work through the whole stack, proven in
`packages/pandwind/tests/container-variants.test.ts`: nested keys emit the
escaped classes (`{"@md": { p: "4" }}` -> `@md\:p-4`), `cx()` scopes them
distinctly from base (a later base `bg` never kills an `@md:` override and
vice versa), and real Tailwind compiles them inside `@container (...)`
at-rules. Typegen exposes the functional forms (`@`, `@min`, `@max`) as
variant keys; concrete sizes like `@md` ride the open escape hatch. Mark the
parent with Tailwind's `@container` class as usual.
