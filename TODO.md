# Roadmap

## High value

- **Vite plugin** — statically inline `tw()` calls into literal class strings
  at build time and drop the `tw:scan` safelist step entirely. The transform
  runs before Tailwind's scanner, so used classes are found naturally and the
  runtime cost becomes zero.
- **Split overloaded utilities** — Tailwind puts size, color and alignment
  under one key (`text`). Generate semantic sub-keys (`textColor`, `textSize`,
  `textAlign`) with a key-to-utility mapping so `{ textSize: "2xl", textColor:
  "gray-900" }` works without arrays.
- **Recipes / slots** — Panda-style `cva`/`sva` for Tailwind classes, so the
  multi-part wrapper pattern from Chakra-land ports directly.

## Correctness & DX

- Generate a safelist-free mode when a custom Tailwind extractor is available,
  or document `@source inline` as an alternative.
- Include completion modifiers in the value unions (opacity steps like
  `bg-red-500/50`).
- Deterministic tests pinning the typegen output across Tailwind minor
  upgrades.
- `tailwind-merge`-style conflict resolution for composed class strings.
- Negative and arbitrary value polish (type-level `-` keys already work).

## Project

- Publish to JSR / pkg.pr.new once the API settles.
- DTCG design-token integration: tokens -> `@theme` -> generated types, so
  autocomplete is your design system, not all of Tailwind.
- No config, composition over configuration; keep the codegen as plain
  scripts instead of a CLI.
