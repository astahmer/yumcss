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
