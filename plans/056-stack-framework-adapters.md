# Stack framework adapters plan

## Context

Pandwind already exposes a renderer-neutral `pandwind/stack` style mapper and
a React renderer at `pandwind/stack/react`. The mapper emits the same class
contract used by the static Stack fold pass, while the renderer owns the
framework's element and attribute conventions.

The current public shape does not yet make the same component available to
other supported host frameworks. The host registry already distinguishes
`className` from `class`, so duplicating that policy in callers would weaken
the pivot architecture.

## Goal

Expose independently replaceable Stack renderers for the supported component
frameworks while preserving one shared style contract and one static-fold
implementation.

## What

- Keep `pandwind/stack` as the renderer-neutral core.
- Keep `pandwind/stack/react` as the React renderer.
- Add `pandwind/stack/solid`, `pandwind/stack/vue`, and `pandwind/stack/preact`.
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
                    └─ stack/preact.tsx ─ Preact className + children
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
- framework-native attributes and children without leaking renderer policy
  into the core or Vite plugin.
- configured class-name strategies through `createStack(css)`; namespace
  behavior remains owned by the CSS compiler, and the matching engine is used
  when folding static JSX.

## What this does not allow

- It does not pretend that Svelte/Astro can consume a JavaScript component
  export as if it were a native `.svelte` or `.astro` file. Those require
  framework-native source assets and compiler integration and remain a
  separate adapter decision.
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
4. Add export-resolution, inline-snapshot, and type-level contract tests.
   **Done:** package exports, SSR/VNode snapshots, assertions, and tstyche
   coverage are present.
5. Build/typecheck the package and run focused Stack tests. **Done.**
6. Record the completed boundary in the architecture documentation. **Done.**

## Acceptance criteria

- All four renderer entry points resolve through package exports.
- Each renderer maps the same props to the same class string.
- Each renderer forwards framework-native attributes and children.
- Static Stack folding remains renderer-neutral; its default output is
  unchanged, and configured folding consumes the shared engine instead of a
  renderer implementation.
- Dynamic framework props remain dynamic and type-safe.
- Optional renderer dependencies are not included in the neutral core path.
- Focused tests, package typecheck, formatting, and export checks pass.

## Decisions log

- Use `pandwind/stack/{framework}` rather than `pandwind/{framework}`: the
  namespace represents a component family, not a framework-wide API bucket.
- Add React, Solid, Vue, and Preact first because they have JavaScript
  component entry points and are already represented by Pandwind's host
  boundaries. Svelte/Astro need native source-file adapters instead.
- Keep the flat class mapper as the fast path; framework renderers are only
  runtime carriers for values the compiler cannot erase.

## Status

Complete for JavaScript component renderers: React, Solid, Vue, and Preact.
Native Svelte/Astro component adapters remain intentionally separate work.
