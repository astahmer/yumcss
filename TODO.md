# What we have

## `tw()` — typed Tailwind classes

- Codegen from your real `tailwind.css` (`@tailwindcss/node`): one key per
  utility with literal value unions, opacity modifiers (`bg-red-500/50`),
  recursive variant nesting and the open-ended `(string & {})` escape hatch.
- Deterministic typegen tests, tstyche type tests and integration tests on
  the generated runtime (`pnpm test`).
- Generated conflict map (per-property, variant-scoped, compose-aware) —
  tailwind-merge semantics without a hand-maintained config.
- `tw:scan` — oxc-based scanner emitting a Tailwind safelist.
- `pandwindVite()` — statically inlines literal `tw()` calls before Tailwind's
  scanner (runtime cost zero, tree-shakable), with the same conflict merge at
  compile time.

## `css()` — atomic CSS-in-JS

- panda+stylex mix of hashed atomic classes, DTCG-style token groups,
  property-priority merging, condition/selector nesting, `$input` dynamics.
- `createDesignCss(preset)` — the Figma-inspector surface: `$frame` /
  `$layout` / `$text` (~30 props), strict token typings ("wrong is a type
  error"), `$raw` escape hatch.
- `pandwindCssVite()` — filesystem scanner resolving literal `css()` calls
  into a generated stylesheet served as a virtual module (`pandwind:css`).

## Tooling

- All deps pinned to exact latest versions (no `^`).
- oxc-based parsing everywhere a scanner or static transform exists.
- `src` uses `.ts` import specifiers, so vite's native config loader (and
  Node's type stripping) work without a bundler step.
- CSS identifiers (class names, custom properties) are escaped, so hashes
  that start with a digit are valid CSS.

# What we want

- **Split overloaded utilities** — Tailwind puts size, color and alignment
  under one key (`text`). Generate semantic sub-keys (`textColor`, `textSize`,
  `textAlign`) with a key-to-utility mapping so `{ textSize: "2xl",
textColor: "gray-900" }` works without arrays.
- **DTCG design-token integration for `tw()`** — tokens -> `@theme` ->
  generated types, so autocomplete is your design system, not all of
  Tailwind. (The css() side already resolves tokens from preset groups.)
- **Safelist-free mode** — a custom Tailwind extractor that understands
  `tw()` objects, or first-class `@source inline` guidance; today the inliner
  already makes literal calls visible, and `tw:scan` covers the rest.
- **Publish to JSR / pkg.pr.new** once the API settles.

# What we deliberately don't do (and why)

- **No chakra/emotion-style runtime CSS-in-JS.** A mini runtime that resolves
  styles at runtime is exactly the perf and caching cost we're avoiding.
- **No panda-style PostCSS pipeline or mini runtime.** Tailwind compiles once,
  statically; `tw()` output is plain class strings. `css()` output is
  extracted at build time by `pandwindCssVite`.
- **No cva/sva, no config files.** Panda's recipe/slot API and config-driven
  pipeline are exactly the surface we don't want to repeat. A minimalist API
  you can hold in your head; codegen stays plain scripts.
- **No hand-maintained tailwind-merge config.** Conflict rules are generated
  from the real engine, so they can't drift from what Tailwind compiles.
- **No 500-prop CSS API.** The design surface is ~30 Figma-inspector props;
  everything else goes through `$raw` on purpose.
- **No runtime stylesheet accumulation.** The css() stylesheet is generated
  from literal calls at build time; dynamic values are the documented escape
  hatch, not the default.
