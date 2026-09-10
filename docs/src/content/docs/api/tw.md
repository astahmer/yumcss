---
title: tw() — typed Tailwind classes
description: Replace fragile Tailwind class strings with typed objects backed by the theme your project actually uses.
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

## The everyday loop

1. Generate a helper from the Tailwind stylesheet your app already uses.
2. Write an object and let the editor complete keys and values.
3. Run the normal Vite build; literal calls become ordinary class strings.
4. Scan only the genuinely dynamic class choices.

```sh
pnpm exec pandwind-codemod tw generate ./src/tailwind.css ./src
```

You own the generated helper and can inspect it like any other source file.
Pandwind does not hide a second Tailwind theme behind it.

## What gets generated

- **`pandwind-codemod tw generate`** — loads your `tailwind.css` through Tailwind's own design
  system (`@tailwindcss/node`) and generates two files next to it:
  - `types.d.ts` — one key per utility with literal value unions (including
    opacity modifiers like `bg-red-500/50`), recursive variant nesting, and
    the open-ended `(string & {})` escape hatch for arbitrary values.
  - `tw.ts` — the typed `tw` instance, wired with the variant metadata, the
    utility **conflict map**, and the list of **composing** utilities. Pandwind
    does not import this generated module automatically; a project only pays
    for it when its source imports `tw()` or its generated conflict metadata.
  - `bridge.ts` when `--bridge` is enabled — an optional build-time and
    migration artifact for the Tailwind `ClassNameStrategy`. Pandwind does not
    import it automatically; it enters the runtime graph only when the project
    explicitly selects its generated `twAdapter`.
- **`tw()` runtime** — a few dozen lines that walk the style object and
  compose class strings: camelCase keys, array values
  (`ring: ["1", "gray-900/5"]`), negative utilities (`"-translateX": "1/2"`),
  compound bases (`flex: "col"` -> `flex flex-col`) and arbitrarily deep
  variant stacks.
- **`pandwind-codemod tw scan`** — Tailwind v4 scans source files for literal candidates, so
  dynamically composed classes are invisible to it. The scanner statically
  evaluates every `tw({ ... })` call through the same runtime and writes a
  safelist file that Tailwind generates CSS for. Finite dynamic arguments —
  ternaries, unions, arrays, literal `cx()` conditionals over known constants —
  register **every possible class** they may produce, so runtime selection
  still has CSS. Only design-system-verified classes enter the safelist:
  every token must compile through the generated conflict map. An
  unresolvable token (`bg-nope-999`, a class from a plugin Tailwind never
  saw) is never invented; it is reported with its source line in
  `TwScanResult.unresolvedTokens` and printed per-token by the CLI as a
  warning.
- **`pandwindVite()`** — statically inlines literal `tw({ ... })` calls with
  literal arguments into plain class strings before Tailwind's scanner sees
  them. The runtime cost becomes zero and the whole runtime + conflict map
  tree-shake out of the bundle (the generated `tw.ts` is marked `@__PURE__`).
  Dynamic calls keep working through the runtime, with the same
  verification-gate behavior: finite candidates are collected for the
  scanner, unverified tokens surface through the plugin's `onUnresolved`
  lane instead of silently disappearing.

## For CI and automation

Run codegen with `--agents` and pandwind also emits `pandwind.agents.json`: a
versioned machine-readable capability file — every utility key with its
literal value union (capped, with counts), the variant set, conflict families,
compose list, theme scopes and semantic tokens — plus the exact commands an
agent runs to verify its own output (`typecheck`, `analyze --json`, the
missing-css gate). Generic conventions describe intent and can drift from
reality; this file is _derived from the compiled design system on every run_,
contains only what provably exists, and wrong classes are caught as TypeScript
errors before an agent ever ships.

## Dynamic values and token preservation

Dynamic `tw()` values follow one static-first policy. When a value is
provably finite (a ternary, union, array, or set of known constants), the
scanner and the Vite plugin compile **every possible class** the call may
produce and register them for Tailwind, so runtime selection still has CSS.
The runtime call itself is never rewritten.

When a finite dynamic value is a raw value that your configured tokens also
produce (for example `tw({ bg: theme === "dark" ? "#3b82f6" : "#111827" })`
where `blue-500` and `gray-900` resolve to exactly those values), the
generated artifact carries a value-to-token catalog built by
`pandwind-codemod tw generate`. Candidates then reference the token spelling
(`bg-blue-500`, `bg-gray-900`) instead of arbitrary values, so they merge,
conflict, and theme like hand-written classes. The remap is exact-match and
provenance-backed only: a value the catalog cannot prove stays an arbitrary
value (`bg-[#00ff00]`), opacity-modified values stay raw, and a missing
catalog keeps raw candidates.

Diagnostics are structured, never guessed: candidates the design system
cannot verify surface through the scanner's `unresolvedTokens` (CLI) or the
plugin's `onUnresolved` lane (Vite), with the call site attached.
Unbounded expressions (helpers, unknown spreads) keep their runtime behavior
and produce an explicit coverage diagnostic instead of a silent CSS gap.

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
engines. `pandwind-codemod tw generate --tokens <preset-module>` bridges them into a Tailwind v4
`@theme {}` block (only real theme namespaces: color, radius, text, leading,
font-weight, font, tracking) and injects it while generating types:

- the generated `pandwind-theme.css` artifact is imported from your
  `tailwind.css`, so Tailwind compiles token-backed utilities (`bg-success`,
  `text-error`) with zero hand-mirroring;
- token-derived values appear in the generated literal unions next to raw
  Tailwind values — autocomplete is driven by your design system;
- no `--tokens` flag = byte-identical generated output as before.

```sh
pnpm exec pandwind-codemod tw generate ./src/tailwind.css ./src --tokens ./src/preset.ts
```

The generator accepts any module that default-exports groups or exports an
object carrying `.tokens` (a full preset works). Deterministic: sorted
groups/names, hex lower-cased, byte-identical output for identical inputs.
