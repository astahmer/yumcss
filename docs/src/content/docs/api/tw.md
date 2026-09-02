---
title: tw() — typed Tailwind classes
description: A Panda-like object typed against your real Tailwind design system that returns a class string.
sidebar:
  order: 1
---

`tw()` takes a Panda-like object, types it against your real Tailwind design
system, and returns a class string. Tailwind stays the single CSS engine: no
PostCSS config or runtime CSS injection.

> **Lane 1 of 3 — when to use this:** you already run Tailwind (or want its
> ecosystem) and want typed, merge-safe utility objects instead of raw class
> strings. Pick [engine css()](/api/css/) for atomic CSS-in-JS without
> Tailwind, or [design css()](/api/design-css/) for the Figma-inspector
> vocabulary.

```ts
tw({ rounded: "xl", bg: "white", p: "6", hover: { bg: "gray-50" } });
// "rounded-xl bg-white p-6 hover:bg-gray-50"
```

## How it works

- **`tw:codegen`** — loads your `tailwind.css` through Tailwind's own design
  system (`@tailwindcss/node`) and generates two files next to it:
  - `types.d.ts` — one key per utility with literal value unions (including
    opacity modifiers like `bg-red-500/50`), recursive variant nesting, and
    the open-ended `(string & {})` escape hatch for arbitrary values.
  - `tw.ts` — the typed `tw` instance, wired with the variant metadata, the
    utility **conflict map**, and the list of **composing** utilities.
- **`tw()` runtime** — a few dozen lines that walk the style object and
  compose class strings: camelCase keys, array values
  (`ring: ["1", "gray-900/5"]`), negative utilities (`"-translateX": "1/2"`),
  compound bases (`flex: "col"` -> `flex flex-col`) and arbitrarily deep
  variant stacks.
- **`tw:scan`** — Tailwind v4 scans source files for literal candidates, so
  dynamically composed classes are invisible to it. The scanner statically
  evaluates every `tw({ ... })` call through the same runtime and writes a
  safelist file that Tailwind generates CSS for.
- **`pandwindVite()`** — statically inlines literal `tw({ ... })` calls with
  literal arguments into plain class strings before Tailwind's scanner sees
  them. The runtime cost becomes zero and the whole runtime + conflict map
  tree-shake out of the bundle (the generated `tw.ts` is marked `@__PURE__`).
  Dynamic calls keep working through the runtime.

## Agent-ready by construction

Run codegen with `--agents` and pandwind also emits `pandwind.agents.json`: a
versioned machine-readable capability file — every utility key with its
literal value union (capped, with counts), the variant set, conflict families,
compose list, theme scopes and semantic tokens — plus the exact commands an
agent runs to verify its own output (`typecheck`, `analyze --json`, the
missing-css gate). Generic conventions describe intent and can drift from
reality; this file is _derived from the compiled design system on every run_,
contains only what provably exists, and wrong classes are caught as TypeScript
errors before an agent ever ships.

## Semantic sub-keys for overloaded utilities

Tailwind overloads one class prefix for several CSS concerns (`text-2xl` size,
`text-gray-900` color, `text-center` alignment). pandwind adds narrower
spellings that resolve onto the same classes:

```ts
tw({ textSize: "2xl", textColor: "gray-900", textAlign: "center" });
// "text-2xl text-gray-900 text-center" — no arrays needed
```

Available sub-keys: `textSize`, `textColor`, `textAlign`, `textWrap`,
`textOverflow` (all resolve onto `text`). They are derived at codegen time by
partitioning the base utility's values on the CSS properties they compile to,
so their autocomplete unions contain only the relevant concern. Conflict
semantics are unchanged: `{ text: "sm", textSize: "lg" }` merges last-wins,
disjoint concerns compose. The plain overloaded spellings keep working exactly
as before.

## Variants

Nesting mirrors the class syntax: `{ dark: { hover: { ... } } }` becomes
`dark:hover:...`. Variants that require an argument are handled too:

```ts
tw({ group: { hover: { opacity: "100" } } }); // group-hover:opacity-100
tw({ max: { md: { bg: "red-500" } } }); // max-md:bg-red-500
tw({ aria: { checked: { bg: "sky-600" } } }); // aria-checked:bg-sky-600
tw({ "@": { md: { hover: { bg: "red-500" } } } }); // @md:hover:bg-red-500
```

The join separator (`:`, `-` or none) is detected at codegen time by compiling
sample candidates with Tailwind's own engine — whatever the variant's internal
shape is, the engine is the source of truth.

## Conflict resolution (tailwind-merge, but generated)

`tw({ px: "4", p: "6" })` emits `p-6`, not both classes. The conflict map is
**generated from the real engine**: every utility/value is compiled through
`candidatesToCss` and the CSS properties it sets (canonicalized longhands) are
recorded. Last key wins per property, variant-scoped classes never collide
with base ones, and overloaded utilities (`text-2xl` + `text-gray-900` +
`text-center` all coexist) stay precise.

Values that only set Tailwind custom properties (`ring-red-500`,
`shadow-red-500`) are recorded as setting nothing and never merge. Composing
families — `scale-x` + `scale-y`, `translate-x` + `translate-y`, `blur` +
`brightness` — merge only within the same key, never across.

The vite plugin performs the same merge at compile time for literal calls, so
the bundled class strings are already conflict-free.

## DTCG design tokens → `@theme`

Your preset's DTCG token groups are the single source of truth for both
engines. `tw:codegen --tokens <preset-module>` bridges them into a Tailwind v4
`@theme {}` block (only real theme namespaces: color, radius, text, leading,
font-weight, font, tracking) and injects it while generating types:

- the generated `pandwind-theme.css` artifact is imported from your
  `tailwind.css`, so Tailwind compiles token-backed utilities (`bg-success`,
  `text-error`) with zero hand-mirroring;
- token-derived values appear in the generated literal unions next to raw
  Tailwind values — autocomplete is driven by your design system;
- no `--tokens` flag = byte-identical generated output as before.

```sh
nub run tw:codegen -- ./src/tailwind.css ./src --tokens ../../packages/pandwind/src/preset/example-preset.ts
```

The generator accepts any module that default-exports groups or exports an
object carrying `.tokens` (a full preset works). Deterministic: sorted
groups/names, hex lower-cased, byte-identical output for identical inputs.
