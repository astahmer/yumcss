# Panda inbound codemod (website-grade migration) plan

## Context

- The panda website (`~/dev/panda/website`) is the first real inbound-migration target. Current codemod state:
  - Default migrate mode (`--from=panda` in `packages/codemod/src/sources.ts`) handles only **pure-flat literal `css({...})`** with known properties; everything else (conditions, shorthands, token refs, missing pandwind binding) gets a skip marker. Dry-run on the website: 143 files scanned, **1 call site converted**.
  - Plan 022 landed the swap pipeline: `SwapIR` (entries with `conditions[]` chains), parsers, emitters (`css.class` renders `_condition:` scopes inline, `design`, `tw`), outbound adapters, CLI.
- Website scan results (2026-08-26):

| Shape              | Count             | Detail                                                                                   |
| ------------------ | ----------------- | ---------------------------------------------------------------------------------------- |
| Imports            | 89 files          | styled-system/css ×77 · jsx ×35 · patterns ×20 · recipes ×8 · tokens ×4                  |
| `css({...})` calls | ~145 in ~67 files | 107 flat · 33 w/ condition scopes · 5 w/ responsive objects · **0 interpolations**       |
| Shorthands         | ~250 keys         | bg 66, py 35, px 27, mt 24, rounded 20, maxW 17, w/h/mx/my/ms/me…                        |
| `<panda.*>` JSX    | 86 elements       | h 22, span 20, div 20, p 12, section 9 + misc; style props incl. object values           |
| Pattern calls      | 41                | hstack/stack/grid/flex/center/circle/square/wrap + `Stack`/`Box`/`Grid`… JSX components  |
| `cva` / `sva`      | 10 / 4            | nested per-prop conditionals, `!important` suffix ×5, CSS var decls ×2                   |
| Theme recipes      | 6                 | defineRecipe w/ anatomy parts, variants, compoundVariants (button, card, navbar…)        |
| Tokens             | low volume        | semantic (`fg.muted`, `bg.subtle`), `textStyle` ('sm'/'lg'/…), raw values, `tokens.*` ×3 |

- Related: plans/008 (inbound migrate codemod), plans/022 (bidirectional swap IR).

## Goal

One command migrates the panda website's styling to pandwind: every statically-analyzable styling construct (css objects, pattern calls, panda JSX, cva/sva) parses into the plan-022 IR and emits to the chosen target, with residuals flagged — never half-converted.

## What

Extend `packages/codemod`:

1. **`panda` becomes a swap source** (`--from=panda` in the `swap` subcommand, alongside `auto|tw|css|design`). New parser `src/swap/parse-panda.ts`: literal `css({})`/`cva({})`/`sva({})` objects → SwapIR, replacing the flat-only detector in `sources.ts`.
2. **Condition translation table**: panda conditions (`_hover`, `_focus`, `_dark`, `_first`, breakpoints `sm`/`md`/`lg` as responsive-object keys) → IR condition chains. Per-property responsive objects (`mt: { base: '6', _first: '0' }`) fan out into one entry per condition branch.
3. **Shorthand expansion**: panda shorthand keys → canonical properties (`px` → `paddingX`, `rounded` → `borderRadius`, `bg` → `backgroundColor`…) before IR entry creation.
4. **Pattern expanders**: built-in definitions for panda's built-in patterns (stack, hstack, vstack, grid, flex, center, circle, square, wrap) translating their props to declarations, reusing the same converter. Same table drives JSX layout components.
5. **JSX transform**: `<panda.div px="6">` → `<div className={css.class({ paddingX: '6' })}>`; `<Stack gap="4">` → element + expanded pattern classes. oxc-parser based (already a dependency).
6. **Token bridge**: generated mapping from the site's `panda.config.ts` semanticTokens/textStyles to pandwind preset tokens; unmapped values stay verbatim + residual entry.
7. **CLI ergonomics**: `swap --from=panda --to=<target> <site-globs>` works end-to-end on an external repo (patterns resolve outside the pandwind repo root — already fixed today).

## Why

- The website is the dogfood target: 1/145 conversion rate today means "codemod can't help". After this plan the mechanical share should cover the overwhelming majority of call sites (all 145 css calls are interpolation-free).
- Routing through the 022 IR means every future emitter (and outbound panda export) inherits the same fidelity for free, instead of maintaining two divergent converters.

## How

### Conceptual model

```
panda constructs                    parse layer                IR                emit
─────────────────                   ────────────               ──                ────
css({ ... })            ─┐
cva/sva base+variants    ├────►  parse-panda.ts   ─────►  SwapIR  ─────►  css.class | design | tw
hstack()/grid()/...      ┤        (shorthands,
<panda.div px="6">       ┤         conditions,
<Stack gap="4">          ┘         patterns,
                                   token bridge)
theme/*.recipe.ts  ──► residual marker only (phase-out of scope)
```

### Operations / behavior

- Dry-run by default; `--diff` prints unified diffs; `--write` applies; `--report` aggregates residuals by kind/file.
- Residual kinds (existing convention): `dynamic` (non-literal), `unknown-prop`, `unrepresentable` (recipe anatomy, compoundVariant logic) — each inserted as `pandwind:migrate-skip (<reason>)`.
- Idempotency: converted output must not re-match any panda detector.

### Tech choices

| Choice                                                | Decision                                         | Rationale                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Extend `sources.ts` regex detector vs new swap parser | New swap parser                                  | Conditions/shorthands/fan-out need AST-level work; 022 IR already models them; avoids two converters |
| Regex scanning vs oxc-parser for JSX                  | oxc-parser                                       | Attribute values include object expressions; already a dep                                           |
| Pattern definitions                                   | Hardcoded tables mirroring panda's built-ins     | Deterministic, small; custom user patterns → residual                                                |
| Token mapping                                         | Generated at meta-load from site config + preset | Keeps with "nothing hand-maintained" rule of plan 008                                                |

### Architecture

Same pipeline as plan 022; new files: `src/swap/parse-panda.ts`, `src/swap/patterns.ts`, `src/swap/jsx-panda.ts`; edits to `index.ts` (source list, dispatch), `token-set.ts`/meta loader (panda.config ingestion).

## What this allows

- One-command bootstrap migration of the panda website (and any panda-css app) into pandwind.
- Round-trip parity tests: panda → pandwind → panda (022 outbound) ≈ identity on static inputs.
- Residual report doubles as the manual-migration checklist.

## What this does not allow

- No new user-facing pandwind API (AGENTS.md policy untouched): targets remain `css.class | design | tw | tailwind | panda | stylex`.
- No conversion of `defineRecipe` variant logic, ark-ui anatomy wiring, or runtime-conditional styles — those are residuals by design.
- Custom (user-defined) panda patterns are not expanded.

## Implementation steps

1. `parse-panda.ts`: css/cva/sva literal objects → IR. Shorthand table + condition table + per-property responsive fan-out + `!` important + CSS-var passthrough. Unit tests against real snippets from the website scan.
2. Token bridge: ingest `panda.config.ts` (semanticTokens, textStyles) at meta load; map to pandwind preset via existing inverse indexes; unmapped → verbatim value + residual.
3. Wire `--from=panda` into `swap` dispatch (incl. `auto` detection via `@pandacss`/`styled-system` imports). Delete/deprecate the `sources.ts` panda path once green.
4. `patterns.ts`: built-in pattern prop tables → declaration lists; apply to both function-call form and JSX component form.
5. `jsx-panda.ts`: `<panda.x …>` and layout-component JSX rewrite via oxc-parser walk; className insertion/composition with existing `cx()` when className already present.
6. End-to-end: run against `~/dev/panda/website` (dry-run → diff review → `--write` on a branch), record conversion stats + residual inventory; fix long-tail detectors.
7. Docs: update packages/codemod README + plans/008 status pointer.

## Open questions

1. Default target for the website run: `css.class` or `design` vocabulary? (Plan assumes `css.class`.)
2. Unmapped semantic tokens: keep verbatim string (breaks visually until tokens exist) vs drop to raw CSS value from panda's generated CSS vars (`var(--colors-fg-muted)`)? Plan assumes the latter as safer default.
3. cva/sva: emit mechanical `cx()`-based variant helpers, or residual-flag all of them for hand-migration? Plan assumes cx-helper emission with compoundVariants flagged.
4. Should the old flat `--from=panda` path in the default migrate mode be deleted in step 3, or kept one release for compat?

## Acceptance criteria

- [ ] All 145 `css({})` sites on the website parse: ≥90% emit to target, remainder carry actionable skip markers (no silent drops).
- [ ] 86 `<panda.*>` elements and 41 pattern calls handled by steps 4–5 with the same bar.
- [ ] Round-trip test: panda → IR → panda emitter reproduces input semantics on the fixture corpus (whitespace-insensitive).
- [ ] Idempotency: second run reports zero changes.
- [ ] Full codemod suite green; new tests cover shorthands, conditions fan-out, responsive objects, important suffix, CSS vars, patterns, JSX.
- [ ] Dry-run report on `~/dev/panda/website` committed alongside the plan as baseline evidence.

## Decisions log

| Date       | Decision                                                               | Rationale                                                                        |
| ---------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 2026-08-26 | Route panda inbound through 022 SwapIR instead of extending sources.ts | One converter; scopes/shorthands modeled already; scan showed 100% static inputs |
