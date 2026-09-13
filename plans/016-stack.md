# Plan 016 — Erasable `<Stack>` layout primitive

Approved additive exception to the API-freeze policy (AGENTS.md): lives behind
a NEW subpath export `pandwind/stack`; frozen core APIs (`tw`/`css`/`cx`,
strategies, codegen entries) are untouched.

## Props surface (closed, typed)

| prop        | values                                                            | classes                   |
| ----------- | ----------------------------------------------------------------- | ------------------------- |
| `direction` | `row` \| `column` \| `row-reverse` \| `column-reverse`            | `flex-row`, `flex-col`, … |
| `gap`       | string/number (`"4"` → `gap-4` in the default lane; CSS value in a factory) | `gap-*` or `gap` |
| `padding`   | string/number (`"6"` → `p-6` in the default lane; CSS value in a factory)   | `p-*` or `padding` |
| `align`     | `start` \| `center` \| `end` \| `stretch` \| `baseline`           | `items-*`                 |
| `justify`   | `start` \| `center` \| `end` \| `between` \| `around` \| `evenly` | `justify-*`               |

Every result starts with `flex` (display). Mapping order is deterministic
(flex → direction → gap → padding → align → justify) so folded output is
byte-stable. Unknown keys are a type error; unknown VALUES pass through
verbatim after the utility prefix (`gap-3.5` works) — closeness to TW beats
validation here, and the generated unions can tighten later without an API
change.

## Erasure mechanics

The vite fold pass (`stackFoldVite()`, opt-in plugin) rewrites literal-prop
JSX at build time:

    <Stack direction="column" gap={4}>…</Stack>
    → <div className="flex flex-col gap-4">…</Stack→div>

- All-present-literal rule: if ANY known prop carries a dynamic expression
  (`gap={x}`) or spread, the whole element stays runtime — no partial folds
  for v1 (conservative, matches "when in doubt nothing is dropped").
- Unknown attributes (`onClick`, `data-*`, extra className) are copied
  through onto the `div` verbatim — they are valid on any element.
- When a file's last `<Stack>` is erased, the now-unused
  `import { Stack } from "pandwind/stack"` is removed.
- Self-closing forms fold too.

## Renderer-agnostic core

`src/stack/index.ts` exports pure renderer-neutral helpers,
`stackClasses(props): string`, `stackStyle(props)`, and
`createStackClassName(css)` — zero React, zero DOM. Framework adapters wrap
these helpers; the default vite fold pass uses `stackClasses`, while the
configured fold shares the CSS compiler context used by `createStack(css)`.

## Runtime component

`pandwind/stack/react` exports the Tailwind-compatible `<Stack>` plus
`createStack(css)` = `<div className={css.class(stackStyle(p))}>`, with
passthrough attrs and an optional user `className` appended. React is an
OPTIONAL peer dependency (`peerDependenciesMeta.optional`) — apps that only
fold never install it, and the package has no build step (exports point at
source), so consumer bundlers compile the single `.tsx` with their own JSX
runtime.

## Escape hatch for dynamic props

Dynamic usage keeps the runtime component and passes values as props:

    <Stack gap={dynamicGap}>…</Stack>   // gap={x} → NOT folded, renders at runtime

Because the runtime component calls the same pure mapper per render, runtime
and folded paths stay semantically identical by construction. Truly hybrid
cases (`cx(stackClasses({ gap: "4" }), dynClass)` also work via the exported
pure function.

## Non-goals

- No `as`/polymorphic rendering (a div is the contract).
- No responsive/variant prefixes on stack props in v1 — compose with `tw()`
  inside `className` instead.
- No recipes/variants system (explicitly rejected in TODO.md).

## Outcomes (2026-08-23, spike landed)

Implemented exactly per the design:

- `src/stack/index.ts` — pure `stackClasses(props)` mapper (renderer-agnostic,
  deterministic order flex → direction → gap → padding → align → justify;
  unknown values pass through verbatim after the prefix).
- `src/stack/react.tsx` — optional-peer React component (`pandwind/stack/react`),
  thin div wrapper appending an optional user className.
- `src/vite/stack-fold.ts` — `stackFoldVite()` opt-in plugin: literal-prop
  \`<Stack>\` elements fold to \`<div className="…">\`; any dynamic/spread
  prop keeps the WHOLE element runtime; unknown attributes pass through onto
  the div; self-closing forms fold; unused pandwind/stack import removed when
  the last Stack in the file is erased.
- Exports: ./stack + ./stack/react added; react optional peer (+@types/react dev).
- Tests (11): mapping table, differential vs hand-written class strings,
  fold fixtures (static/dynamic/mixed/passthrough/self-closing/import removal).
- Gates: format/lint/typecheck green; 391 tests / 37 files.

Follow-ups: responsive/variant prefixes on stack props; solid adapter on the
shared mapper; wire stackFoldVite into the example app dogfood.

## Strategy-aware evolution (2026-09-13)

Plan 069 extends the completed spike without changing the default utility
output. The renderer subpaths now expose `createStack(css)` for configured
Pandwind class-name strategies, and `stackFoldVite({ engine })` shares those
classes plus their prepared declarations with `pandwindCssVite`. The no-engine
fold remains the explicit Tailwind lane.
