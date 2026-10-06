---
name: pandwind
description: Work with Pandwind's typed styling APIs in this repository. Use when writing or changing tw(), css(), createDesignCss, presets, themes, tokens, or cx() calls, regenerating codegen artifacts, wiring Vite plugins, fixing missing CSS or safelist issues, or choosing between utility, atomic, and design-system styles.
---

# pandwind

## Rules

- Never hand-edit generated files: `types.d.ts`, `tw.ts`, the optional
  `bridge.ts`, `pandwind.interop.json`, `pandwind.generated.json`,
  `pandwind.agents.json`, the safelist (`pandwind.safelist.css`), and
  `pandwind-theme.css`. They are outputs of codegen or editor tooling. Change
  the preset, `tailwind.css`, source token contract, or call sites, then
  regenerate.
- The compiler is the contract: if a value doesn't autocomplete or fails the
  typecheck, it is not part of the design system. Do not silence the error
  with `as any` or string casts — extend the preset instead.
- Keep property configuration and token references in the typed source
  contract. Use `define.preset`, `define.theme`, `define.tokens`, and
  `tokens.defineSemanticTokens` with `createCss` or `createDesignCss`; fix the
  contract instead of weakening a call site with a cast.
- Run the consuming package's generation script after changing a Tailwind
  preset, `tailwind.css`, or generated `tw()` surface. In this repository,
  `examples/example` uses `pnpm run tw:generate && pnpm run tw:scan`, while
  `apps/playground` uses `pnpm run editor:types && pnpm run tw:generate`.
  `tw:scan` is for dynamically discoverable Tailwind candidates; native
  `css()` and design `css()` lanes do not need Tailwind scanning.
- Prefer static, literal arguments. Literal `tw()`/`css()`/`cx()` calls fold
  at build time via the vite plugins. Dynamic values keep the runtime but
  must be covered by the scan/safelist.
- Compose authored CSS style objects with `css()` and `css.props()`. The
  declaration map preserves property-level, last-wins composition; avoid
  `css.props(css.class(...), ...)` because `css.class()` has already collapsed
  the styles to an opaque class string that `css.props()` can only concatenate.
  A component that accepts caller-authored overrides can expose an
  `xcss?: ReturnType<typeof css>` prop and compose `css.props(base, xcss)`.
- Use `cx()` when inputs are genuinely mixed or opaque class strings from
  `tw()`, CSS modules, or another styling system need conflict resolution.
  Keep it off the path for already-authored Pandwind style maps; never
  concatenate class strings manually.
- Pick the right css() return shape (all methods take the same style object,
  differ only in what they return):
  - `css.class({ ... })` -> joined class string. Use when the host directly
    needs one final class string.
  - `css({ ... })` -> `{ prop: className }` per-declaration map. Use when
    authored styles or an `xcss` override will be composed through `css.props()`.
  - `css.vars({ ... })` -> `{ class, style }`. The ONLY path for
    runtime-dynamic values; nothing enters the generated stylesheet.
  - `css.raw({ ... })` -> plain style object, skips atoms/extraction. For
    inline-style targets (RN/opentui) or extractor-invisible calls.
  - `css.props` / `css.group` / `css.input`: host-prop composer, named-group,
    and `$input` marker for dynamic groups.
- For overloaded utilities prefer the semantic sub-keys (`textSize`,
  `textColor`, `textAlign`) over array spellings when the intent is single-
  concern.
- Non-web targets import different subpaths (`pandwind/react-native`,
  `pandwind/opentui`); never mix targets in one module graph, and never fake
  `tw()` outside the web target.

## Standard flow

1. Locate the source contract and decide whether the module uses native
   `css()`/design styles or the Tailwind-compatible `tw()` lane. Look for the
   preset, `tailwind.css`, package scripts, and generated artifacts.
2. Make style changes through the typed APIs; keep plain `className` strings
   working alongside them where the host still owns those classes.
3. Regenerate only the affected generated lane. Re-run the scanner when new
   dynamic Tailwind candidates need to become discoverable.
4. Typecheck. Wrong utility values must surface as TypeScript errors — that is
   the feature, not friction.
5. If CSS is missing at runtime for a dynamically composed Tailwind class, fix
   the scanner/safelist or `@source inline` input, not the generated files and
   not by duplicating styles.

## Generated-file facts

- `types.d.ts` — one key per utility with literal value unions, opacity
  modifiers, recursive variant nesting, `(string & {})` escape hatch.
- `tw.ts` — the typed `tw` instance wired with variants, the conflict map and
  composing utilities; marked `@__PURE__`.
- `bridge.ts` — an optional generated Tailwind compatibility artifact. It is
  build-time metadata unless the application explicitly selects its
  `twAdapter` for a design/CSS output strategy.
- `pandwind-theme.css` — DTCG tokens bridged into a Tailwind v4 `@theme`
  block; import from `tailwind.css`.
- `pandwind.interop.json` — the versioned metadata artifact consumed by
  migration and build tooling when a generated bridge exists.
- `pandwind.generated.json` — freshness manifest for generated inputs and
  outputs, used by `tw verify`.
- `pandwind.agents.json` — optional machine-readable capability file with
  utility unions, conflict families, and verify commands. Read it before
  inventing class names.
- `pandwind.safelist.css` — scanner output for Tailwind candidates that cannot
  be discovered from static source alone.

## Useful docs

- `docs/src/content/docs/getting-started.md`
- `docs/src/content/docs/api/tw.md`
- `docs/src/content/docs/api/css.md` / `api/design-css.md` / `api/cx.md`
- `docs/src/content/docs/api/presets.md` / `api/theming.md`
- `docs/src/content/docs/tooling/codegen.md`
- `docs/src/content/docs/tooling/vite-plugins.md`
