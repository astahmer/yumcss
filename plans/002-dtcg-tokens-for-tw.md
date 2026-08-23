# Plan 002 — DTCG design-token integration for `tw()`

## Goal

Today `css()` resolves DTCG-style token groups from the preset (`src/css/tokens.ts`,
`src/preset/tokens.ts`) but `tw()` autocomplete is "all of Tailwind". Make tokens flow
into `tw()` so autocomplete is your **design system first**:

- generated `@theme` CSS variables from the preset token groups (so Tailwind itself
  compiles token-based utilities);
- generated types surface token-derived values for relevant keys, while raw
  Tailwind values remain valid (escape hatch stays open — same philosophy as the
  `(string & {})` hole).

Example intent: with a preset defining `colors.fg.muted`, both
`tw({ textColor: "$fg-muted" })` (or whatever token spelling you choose) and
`tw({ textColor: "gray-900" })` typecheck; the token form compiles to a
`var(--...)` utility via `@theme`.

## Approach

1. Study how css() token resolution works (`src/css/tokens.ts`, `createTokenResolver`)
   and how tw types are generated (`src/tw/generate-types.ts`, `src/tw/theme.ts`).
2. Decide + document the token spelling convention for tw values (mirror the css()
   one if possible — consistency wins).
3. Codegen: emit `@theme` block (CSS vars) alongside the existing generated runtime,
   and weave token unions into the generated key types. Deterministic output — extend
   `tests/typegen-determinism.test.ts`.
4. Runtime: token-valued utilities resolve to the var-based class exactly like
   Tailwind theme utilities would (`bg-$fg-muted` style or arbitrary-value class —
   pick what real Tailwind accepts and prove it through real Tailwind compilation,
   reusing the parity-suite machinery).
5. Keep the whole thing opt-in via the preset: no tokens → zero change in generated
   output (snapshot must prove byte-identical codegen when no token groups are used).

## Files (territory)

- `src/tw/generate-types.ts`, `src/tw/theme.ts`, maybe `src/preset/tokens.ts`
- tests: `tests/tw-typegen.test.ts`, `tests/tw-tailwind-parity.test.ts`,
  `tests/tw-output.test.ts`, `tests/typegen-determinism.test.ts`
- Do NOT restructure overloaded keys (`text` splitting) — another agent owns that.

## Gates

- Full gate green: `pnpm test`, typecheck, tstyche, oxlint, oxfmt.
- Real-Tailwind proof: every new token-emitted class compiles through actual
  tailwindcss (extend the existing parity test).
- No-token presets produce byte-identical generated files (determinism test).

## jj discipline

Work only inside your workspace dir. Split/describe logical revisions. Never touch
`/Users/astahmer/dev/pandwind`.

## Outcomes

- Token spelling decision: tw() values stay plain Tailwind names; token
  semantics arrive as **theme utilities derived from the tokens themselves**
  (`--color-success` -> `bg-success`, `text-error`, ...). A `$group-name`
  spelling inside tw() would require a runtime value resolver fighting real
  Tailwind compilation — the @theme route makes the actual compiler the
  source of truth instead.
- Pipeline: preset DTCG groups -> `buildThemeBlock` (generate-theme.ts, only
  genuine v4 namespaces; spacing deliberately skipped) -> written as
  `pandwind-theme.css` artifact + injected into typegen -> token-derived
  utilities appear in the generated literal unions automatically.
- Drift killed: the example app's hand-mirrored `@theme` block is replaced by
  `@import "./pandwind-theme.css"`; regenerating the bridge also surfaced and
  fixed real drift in bridge.ts (font-family entries missing, radii.full
  mapping).
- CLI: `tw:codegen [css] [outDir] --tokens <module>` — module may default-
  export groups or export any object carrying `.tokens` (full presets work);
  relative @imports now resolve against the CSS entry's directory.
- No-token path byte-identical (covered by tests); determinism covered.
- Deliberately out of scope: a `$token` spelling for tw(), per-namespace
  prefixing of token names, bridging condition-bound semantic tokens
  (defineSemanticTokens with conditions) — revisit when a real consumer needs them.
