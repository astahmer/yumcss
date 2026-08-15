# Plan 001 — Split overloaded utilities (semantic sub-keys), keeping `text`

## Goal
Tailwind overloads one key for several CSS concerns (`text` = size + color + align +
decoration). Generate **additive semantic sub-keys** so this works:

```ts
tw({ textSize: "2xl", textColor: "gray-900" }) // "text-2xl text-gray-900"
```

**Hard constraint:** the existing overloaded keys keep working exactly as today —
`tw({ text: "2xl" })` must remain valid and emit identical output. Pandwind stays
close to Tailwind's surface; sub-keys are pure sugar. No removals, no renames.

## Approach
1. Extend the typegen pipeline (`src/tw/generate-types.ts`, `src/tw/compile.ts`) to
   derive, per overloaded key, a `key -> utility` mapping table (e.g. `textSize ->
   font-size utilities`, `textColor -> color utilities`). Derive it from data you
   already generate (the per-utility property/value unions), do not hand-maintain it.
2. Runtime (`src/tw/runtime.ts`) resolves sub-keys by rewriting them onto the same
   underlying utilities — identical output strings as if the user had used `text`.
3. Types expose both spellings; conflicts between two sub-keys of the same key
   (e.g. `textSize` + `text` both set) follow the same last-wins/compose semantics
   the generated conflict map already uses.
4. Cover: `text` (size/color/align/decoration) and audit other overloaded TW keys
   (`bg`? `border`? `p`?) — split what is genuinely multi-property, skip what is not.

## Files (territory)
- `src/tw/generate-types.ts`, `src/tw/compile.ts`, `src/tw/runtime.ts`
- tests: `tests/tw-output.test.ts`, `tests/tw-typegen.test.ts`,
  `tests/tw-tailwind-parity.test.ts`, tstyche typings

## Gates
- Full gate green: `pnpm test`, `pnpm typecheck`, `pnpm test:types`, oxlint, oxfmt.
- Byte-identical output proven for old spellings (snapshot/parity suites).
- If runtime size grows beyond tolerance, refresh via `pnpm test:size -u` and note why.

## jj discipline
Work only inside your workspace dir. Split/describe logical revisions
(feat / docs / test separately). Never touch `/Users/astahmer/dev/pandwind`.
