# Stack framework adapters plan

## Context

Pandwind already exposes a renderer-neutral `pandwind/stack` style mapper and
a React renderer at `pandwind/stack/react`. The mapper emits the same class
contract used by the static Stack fold pass, while the renderer owns the
framework's element and attribute conventions.

The public shape now makes the same component family available to supported
JavaScript and native host frameworks. The host registry distinguishes
`className` from `class`, so keeping that policy inside each adapter avoids
weakening the pivot architecture.

## Goal

Expose independently replaceable Stack renderers for the supported component
frameworks while preserving one shared style contract and one static-fold
implementation.

## What

- Keep `pandwind/stack` as the renderer-neutral core.
- Keep `pandwind/stack/react` as the React renderer.
- Add `pandwind/stack/solid`, `pandwind/stack/vue`, and `pandwind/stack/preact`.
- Add native `pandwind/stack/svelte` and `pandwind/stack/astro` component-file
  adapters.
- Make each renderer own only its framework import, component type, attribute
  spelling, children handling, and prop forwarding.
- Preserve `stackClasses` and the no-engine Vite fold output byte-for-byte;
  configured CSS lanes may use `createStack(css)` through the shared engine.
- Add package export and typecheck coverage for every renderer.

## Why

`Stack` is a component-family API, so its framework variants belong under the
family namespace. This keeps the import discoverable, avoids top-level
framework namespace collisions, and lets future families add their own
renderers without changing the root API.

## How

```text
                    ┌─ stack/react.tsx  ── React className + children
StackProps ─────────┼─ stack/solid.tsx  ── Solid class + reactive props
stackClasses() ────┼─ stack/vue.ts     ── Vue class + attrs/slots
                    ├─ stack/preact.tsx ─ Preact className + children
                    ├─ Stack.svelte    ── native class + rest props + slot
                    └─ Stack.astro     ── native class + attrs + slot
                         │
                         └─ static Stack fold uses stackClasses() directly
```

Framework packages remain optional peer dependencies. The neutral mapper has
no framework dependency, so users of static folding do not pay for a renderer
they do not use.

## What this allows

- `import { Stack } from "pandwind/stack/react"`
- `import { Stack } from "pandwind/stack/solid"`
- `import { Stack } from "pandwind/stack/vue"`
- `import { Stack } from "pandwind/stack/preact"`
- `import Stack from "pandwind/stack/svelte"`
- `import Stack from "pandwind/stack/astro"`
- framework-native attributes and children without leaking renderer policy
  into the core or Vite plugin.
- configured class-name strategies through `createStack(css)`; namespace
  behavior remains owned by the CSS compiler, and the matching engine is used
  when folding static JSX.

## What this does not allow

- It does not add a second style vocabulary or a second Stack implementation.
- It does not force a framework dependency into the neutral `pandwind/stack`
  entry.

## Implementation steps

1. Factor the shared Stack component class merge contract without changing
   `stackClasses` or the static fold. **Done:** all renderers consume the
   existing mapper directly.
2. Correct React prop forwarding while retaining its existing class order.
   **Done:** unknown HTML attributes are forwarded after style props are
   removed.
3. Add Solid, Vue, and Preact renderers with optional peer dependencies.
   **Done:** each renderer has its own entry and optional peer declaration.
4. Add native Svelte and Astro component-file adapters with optional peer
   dependencies and package-file copying. **Done:** both adapters consume the
   shared mapper, forward native attributes, support responsive props, and
   participate in the opt-in Vite static fold.
5. Add export-resolution, inline-snapshot, native-file, and type-level contract tests.
   **Done:** package exports, SSR/VNode snapshots, assertions, and tstyche
   coverage are present.
6. Build/typecheck the package and run focused Stack tests. **Done.**
7. Record the completed boundary in the Stack plans and Vite tooling
   documentation. **Done.**

## Acceptance criteria

- All six renderer entry points resolve through package exports, including the
  native Svelte and Astro source files.
- Each renderer maps the same props to the same class string.
- Each renderer forwards framework-native attributes and children.
- Static Stack folding remains renderer-neutral; its default output is
  unchanged, configured folding consumes the shared engine instead of a
  renderer implementation, and native Svelte/Astro markup is folded before
  the host compiler runs.
- Dynamic framework props remain dynamic and type-safe.
- Optional renderer dependencies are not included in the neutral core path.
- Focused tests, package typecheck, formatting, and export checks pass.

## Decisions log

- Use `pandwind/stack/{framework}` rather than `pandwind/{framework}`: the
  namespace represents a component family, not a framework-wide API bucket.
- Add React, Solid, Vue, and Preact as JavaScript renderer entry points, and
  ship Svelte/Astro as native source-file adapters so each host compiler owns
  its component semantics.
- Keep the flat class mapper as the fast path; framework renderers are only
  runtime carriers for values the compiler cannot erase.

## Status

Complete for JavaScript component renderers and native component-file
adapters: React, Solid, Vue, Preact, Svelte, and Astro.
