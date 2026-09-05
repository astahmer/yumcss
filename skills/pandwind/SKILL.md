---
name: pandwind
description: Work with pandwind styling in this repository. Use when writing or changing tw(), css(), createDesignCss or cx() calls, regenerating typed codegen output, wiring the vite plugins, fixing missing-CSS/safelist issues, or choosing between Tailwind classes and atomic styles.
---

# pandwind

## Rules

- Never hand-edit generated files: `types.d.ts`, `tw.ts`, `bridge.ts`, the
  safelist (`pandwind.safelist.css`) and `pandwind-theme.css`. They are
  outputs of codegen. Change the preset / `tailwind.css` / call sites, then
  regenerate.
- The compiler is the contract: if a value doesn't autocomplete or fails the
  typecheck, it is not part of the design system. Do not silence the error
  with `as any` or string casts — extend the preset instead.
- Run codegen + scan after changing the preset, `tailwind.css`, or adding
  `tw()` calls with values not seen before:
  `pnpm tw:generate && pnpm tw:scan`.
- Prefer static, literal arguments. Literal `tw()`/`css()`/`cx()` calls fold
  at build time via the vite plugins. Dynamic values keep the runtime but
  must be covered by the scan/safelist.
- Use `cx()` to merge class sources (raw strings, `tw()`, css atoms) — never
  concatenate class strings manually.
- Pick the right css() return shape (all methods take the same style object,
  differ only in what they return):
  - `css.class({ ... })` -> joined class string. Default choice for styling
    an element.
  - `css({ ... })` -> `{ prop: className }` per-declaration map. Only when
    you need individual declarations later (conditional composition).
  - `css.vars({ ... })` -> `{ class, style }`. The ONLY path for
    runtime-dynamic values; nothing enters the generated stylesheet.
  - `css.raw({ ... })` -> plain style object, skips atoms/extraction. For
    inline-style targets (RN/opentui) or extractor-invisible calls.
  - `css.props` / `css.group` / `css.input`: spread-helper, named-group and
    `$input` marker for dynamic groups — rarely needed directly.
- For overloaded utilities prefer the semantic sub-keys (`textSize`,
  `textColor`, `textAlign`) over array spellings when the intent is single-
  concern.
- Non-web targets import different subpaths (`pandwind/react-native`,
  `pandwind/opentui`); never mix targets in one module graph, and never fake
  `tw()` outside the web target.

## Standard flow

1. Locate the preset module and generated files (look for `preset`,
   `tailwind.css`, `tw.ts`, `bridge.ts`).
2. Make style changes through the typed APIs; keep plain `className` strings
   working alongside.
3. Regenerate if the design system changed; re-run the scanner if new literal
   classes appeared.
4. Typecheck. Wrong utility values must surface as TypeScript errors — that
   is the feature, not friction.
5. If CSS is missing at runtime for a dynamically-composed class, fix it with
   the safelist/`@source inline`, not by duplicating styles.

## Generated-file facts

- `types.d.ts` — one key per utility with literal value unions, opacity
  modifiers, recursive variant nesting, `(string & {})` escape hatch.
- `tw.ts` — the typed `tw` instance wired with variants, the conflict map and
  composing utilities; marked `@__PURE__`.
- `bridge.ts` + `createTwAdapter({ preset, variants, bridge })` — makes
  `css()` emit real Tailwind classes so both APIs compile to one stylesheet.
- `pandwind-theme.css` — DTCG tokens bridged into a Tailwind v4 `@theme`
  block; import from `tailwind.css`.
- `--agents` on codegen additionally emits `pandwind.agents.json`: the
  machine-readable capability file (utility unions, conflict families,
  verify commands). Read it before inventing class names.

## Useful docs

- `docs/src/content/docs/getting-started.md`
- `docs/src/content/docs/api/tw.md`
- `docs/src/content/docs/api/css.md` / `api/design-css.md` / `api/cx.md`
- `docs/src/content/docs/tooling/codegen.md`
- `docs/src/content/docs/tooling/vite-plugins.md`
