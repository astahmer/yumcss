# Panda inbound codemod (website-grade migration) plan

**Status: PLANNED 2026-08-26. Design discussed + approved direction; work
happens in jj workspace `/Users/astahmer/dev/pandwind-panda-codemod`.**

## Context

- The panda website (`~/dev/panda/website`) is the first real inbound-migration target. Current codemod state:
  - Default migrate mode (`--from=panda` in `packages/codemod/src/sources.ts`) handles only **pure-flat literal `css({...})`** with known properties; everything else gets a skip marker. Dry-run on the website: 143 files scanned, **1 call site converted**.
  - Plan 022 landed the swap pipeline: `SwapIR` (entries with `conditions[]` chains), parsers, emitters (`css.class` renders `_condition:` scopes inline, `design`, `tw`), outbound adapters, CLI.
  - The `tokens` subcommand (TokenSet IR) already imports panda.config / definePreset / @theme / DTCG and exports pandwind formats — reused for pass 1 below.
- Website scan results (2026-08-26):

| Shape | Count | Detail |
|---|---|---|
| Imports | 89 files | styled-system/css ×77 · jsx ×35 · patterns ×20 · recipes ×8 · tokens ×4 |
| `css({...})` calls | ~145 in ~67 files | 107 flat · 33 w/ condition scopes · 5 w/ responsive objects · **0 interpolations** |
| Shorthands | ~250 keys | bg 66, py 35, px 27, mt 24, rounded 20, maxW 17, w/h/mx/my/ms/me… |
| `<panda.*>` JSX | 86 elements | h 22, span 20, div 20, p 12, section 9 + misc; style props incl. object values |
| Pattern calls | 41 | hstack/stack/grid/flex/center/circle/square/wrap + `Stack`/`Box`/`Grid`… JSX components |
| `cva` / `sva` | 10 / 4 | nested per-prop conditionals, `!important` suffix ×5, CSS var decls ×2 |
| Theme recipes | 6 files | defineRecipe w/ anatomy parts, variants, compoundVariants (button, card, callout, navbar, code-tabs, nextra-tabs); consumed as ready-made components |
| Tokens | low volume | semantic (`fg.muted`, `bg.subtle`), `textStyle` ('sm'/'lg'/…), raw values, `tokens.*` ×3 |

- Related: plans/008 (inbound migrate codemod), plans/022 (bidirectional swap IR).

## Goal

One command migrates the panda website's styling to pandwind — css objects, pattern calls, panda JSX, cva/sva and recipe components. Shared styling definitions (recipes, patterns) are re-emitted as pandwind implementations in **dedicated output folders** mirroring the familiar `styled-system/` layout, so call sites only change their import specifier — with residuals flagged, never half-converted.

## What

Extend `packages/codemod`:

1. **`panda` becomes a swap source** (`--from=panda` in the `swap` subcommand). New parser `src/swap/parse-panda.ts`: literal `css({})`/`cva({})`/`sva({})` objects → SwapIR. **The old flat regex detector in `sources.ts` is deleted in the same change** — one panda path only.
2. **Two-pass token flow**:
   - Pass 1 (once, before code migration): `codemod tokens --from=panda-config panda.config.ts --to=@theme` lifts semanticTokens (+ liftable textStyles) into a pandwind preset. Values copied verbatim → no visual drift.
   - Pass 2 (per call site): token bridge maps `'fg.muted'` → **authored token ref** in css.class form. CSS-var fallback (`var(--colors-fg-muted)`) only for tokens that genuinely don't lift.
   - `textStyle` expands to its constituent declarations at codemod time (a textStyle is just bundled utilities) or maps to a lifted preset token — whichever round-trips cleaner.
3. **Condition translation**: `_hover`/`_focus`/`_dark`/`_first`/breakpoints → IR condition chains; per-property responsive objects fan out to one entry per branch; `!` important suffix and CSS-var declarations handled explicitly.
4. **Shorthand expansion**: `px`→`paddingX`, `rounded`→`borderRadius`, … (~250 keys on the site).
5. **Tiered variant strategy (cva/sva/recipes)** — no new pandwind API; everything is emitted output:
   - **Tier 0 — fold**: when the cva/recipe has exactly **one call site**, resolve variants at codemod time → plain `cx(css.class({...}), …)` inline. Duplication guard: never fold shared definitions.
   - **Tier 1 — dedicated module** (default): scan the whole codebase for every recipe/pattern actually used (via fn calls **and** JSX components), then emit each as a pandwind implementation — class-string data + ~15-line generated resolver — **one file per definition in dedicated output folders** (`pandwind/recipes/button.ts`, `pandwind/patterns/hstack.ts`, …), keeping identical export names. Call sites keep everything except the import specifier (`@/styled-system/recipes` → `pandwind/recipes`); migrating "the button" stays a one-file edit in the new folder. Unused definitions are never emitted (usage-driven, tree-shaking by construction).
     - `compoundVariants` → mechanical condition branches inside the generated resolver.
     - `sva` → same machine, resolver returns per-part records `{ root, label, … }`.
6. **Pattern modules**: built-in patterns (stack/hstack/vstack/grid/flex/center/circle/square/wrap) expand to declaration lists; function-call form folds inline when single-use, but each used pattern also emits **one module per pattern into the dedicated patterns folder** (`pandwind/patterns/hstack.ts` exporting `hstack()`) so reuse + tree-shaking survive — mirroring the tier-1 recipe treatment. Same for the JSX layout components (`Stack`, `Box`, `Grid`…): emitted into `pandwind/jsx/` as thin wrappers over the pattern modules.
7. **Custom patterns**: evaluated, not hardcoded — dynamically import the site's `panda.config.ts` (same mechanism the tokens subcommand uses for definePreset modules), run user pattern fns with literal props found at call sites, feed resulting declarations into the IR. Residual only when props are non-literal.
8. **JSX transform**: `<panda.div px="6">` → `<div className={css.class({...})}>`; `<Stack gap="4">` → element + pattern-module class; recipe-derived components keep their component boundary via tier-1 wrappers (`const Button = ({tone, size, ...rest}) => <button className={resolver(...)} {...rest}/>`).

## Why

- The website is the dogfood target: 1/145 conversion rate today means "codemod can't help". All 145 css sites are interpolation-free statics → mechanically convertible.
- Preserving module boundaries means the diff is reviewable and downstream call sites are untouched — migration without churn.
- Routing through the 022 IR means every emitter (incl. outbound panda export) inherits the same fidelity; one converter, not two.

## How

### Conceptual model

```
panda constructs                 parse layer                IR                emit
────────────────                 ────────────               ──                ────
css({ ... })            ─┐
cva/sva/recipes         ─┤       parse-panda.ts   ─────►  SwapIR ─────►  css.class (+ cx folding
hstack()/grid()/...     ─┤        (shorthands,                     or resolvers in dedicated
<panda.div px="6">      ─┤         conditions,                      pandwind/{recipes,patterns,jsx}/
<Stack gap="4">         ─┘         patterns,                         modules; call-site imports
                                   token bridge)                     rewritten to new specifier)
theme/*.recipe.ts  ──►  tier-1 module emission into pandwind/recipes/ (variants stay data + resolver)
custom patterns    ──►  config eval → declarations → IR
```

### Output layout (mirrors styled-system for familiarity)

```
src/
  pandwind/
    recipes/button.ts      // was theme/recipes/button.recipe.ts (+ component wrapper)
    recipes/callout.ts
    patterns/hstack.ts     // was hstack() from styled-system/patterns
    patterns/grid.ts
    jsx/index.ts           // Stack, Box, Grid… wrappers over pattern modules
    tokens.css|preset.ts   // pass-1 lifted semanticTokens/textStyles
```

### Operations / behavior

- Dry-run by default; `--diff` prints unified diffs; `--write` applies; `--report` aggregates residuals by kind/file.
- Residual kinds (existing convention): `dynamic` (non-literal props/args), `unknown-prop`, `unrepresentable` — inserted as `pandwind:migrate-skip (<reason>)`.
- Idempotency: converted output must not re-match any panda detector.

### Tech choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Extend `sources.ts` detector vs new swap parser | New swap parser, delete old | Conditions/shorthands/fan-out need AST-level work; 022 IR already models them; one converter |
| Unmapped tokens | Lift via `tokens` subcommand first; CSS-var fallback only for stragglers | No permanent panda stylesheet dependency; authored refs beat vars |
| Variant systems (cva/sva/recipes) | Tier 0 single-call-site fold; Tier 1 dedicated-folder module + generated resolver | No API surface growth; familiar folder layout; button stays editable in one file |
| Built-in pattern tables vs config eval | Tables for built-ins (fast path), config eval for custom ones | Determinism where known, generality where not |
| Regex scanning vs oxc-parser for JSX | oxc-parser | Attribute values include object expressions; already a dep |
| Import-alias resolution | package.json#imports first; else declared aliases from next.config.ts / vite (+vite-tsconfig-paths) / shadcn components.json / tsconfig paths | Emitted modules must be imported the way the host app already imports things |
| asChild support in emitted wrappers | Plain wrapper by default; per-call-site detection: if any call site of an emitted wrapper passes `asChild`, use an already-installed slot lib's `Slot` (@radix-ui/react-slot, base-ui, ark-ui); only if none installed, emit a local ~20-line cloneElement Slot | No speculative complexity, no new dependencies; website case: all 5 asChild usages sit on ark-ui Triggers (their own prop), so plain wrappers suffice |

## What this allows

- One-command bootstrap migration of the panda website (and any panda-css app) into pandwind.
- Familiar post-migration layout: `pandwind/{recipes,patterns,jsx}/` mirrors `styled-system/*`, so the team navigates it like before; shared definitions stay single-source and tree-shakeable.
- Round-trip parity tests: panda → pandwind → panda ≈ identity on static inputs.
- Residual report doubles as the manual-migration checklist.

## What this does not allow

- No new user-facing pandwind API (AGENTS.md policy untouched): targets remain `css.class | design | tw | tailwind | panda | stylex`; resolvers/helpers are emitted code, not API.
- No runtime dependency on panda's generated stylesheet after pass 2 completes (CSS-var fallback is transitional).
- Non-literal/dynamic style computation remains residual by design.

## Implementation steps

1. `parse-panda.ts`: css/cva/sva literal objects → IR. Shorthand table, condition table, responsive fan-out, `!` suffix, CSS-var passthrough, textStyle expansion. Unit tests against real snippets from the website scan corpus.
2. Token bridge: pass-1 lifting via the `tokens` subcommand (panda.config → @theme), then meta-load mapping semantic tokens/textStyles → authored refs; unmapped → CSS-var fallback + residual entry.
3. Wire `--from=panda` into `swap` dispatch (incl. `auto` detection via `@pandacss`/`styled-system` imports). Delete the `sources.ts` panda path in the same commit.
4. Usage scan: whole-codebase pass inventorying every recipe/pattern in use (fn calls + JSX components) → emission set; single-call-site analysis for Tier 0 fold eligibility.
5. Tier engine + module emitter: fold (cx) vs dedicated-folder emission (`pandwind/recipes/*`, `pandwind/patterns/*`, `pandwind/jsx/*`) with identical export names; generated resolver helper (compound variants, sva slots); component wrappers for recipe-valued and layout JSX; asChild detection per wrapper (plain → installed Slot → local Slot); call-site import-specifier rewrite using detected alias convention.
6. `patterns.ts`: built-in tables + per-pattern module emission; custom-pattern support via panda.config dynamic evaluation.
7. End-to-end: run both passes against `~/dev/panda/website` (dry-run → diff review → `--write` on this workspace), record conversion stats + residual inventory; fix long-tail detectors.
8. Docs: packages/codemod README + plans/008 status pointer; baseline report committed next to this plan.

## Acceptance criteria

- [ ] All 145 `css({})` sites parse: ≥90% emit to target, remainder carry actionable skip markers (no silent drops).
- [ ] 86 `<panda.*>` elements, 41 pattern calls, 14 cva/sva sites and 6 theme recipes handled with the same bar.
- [ ] After migration, zero imports of `styled-system/*` remain outside residuals; call sites import from `pandwind/{recipes,patterns,jsx}/`, which export the same names as before.
- [ ] Tier assignment verified: shared definitions land as modules (never folded), single-use definitions fold.
- [ ] Round-trip test: panda → IR → panda emitter reproduces input semantics on the fixture corpus (whitespace-insensitive).
- [ ] Idempotency: second run reports zero changes.
- [ ] Full codemod suite green; new tests cover shorthands, conditions fan-out, responsive objects, important suffix, CSS vars, textStyle expansion, tiers, patterns, JSX, alias resolution.
- [ ] Website renders identically post-migration (visual spot-check on key pages).

## Open questions

(none — resolved below in decisions log)

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-26 | Route panda inbound through 022 SwapIR instead of extending sources.ts | One converter; scopes/shorthands modeled already; scan showed 100% static inputs |
| 2026-08-26 | Target = `css.class` | User decision |
| 2026-08-26 | Two-pass tokens: lift config via `tokens` subcommand, map to authored refs; CSS-var fallback only for unliftable | User: "any way we could fix those unmapped tokens?" — yes, migrate the tokens themselves; avoids permanent panda stylesheet dependency |
| 2026-08-26 | textStyle = expandable utility bundle, expanded/mapped at codemod time | User observation: textStyles are just merged utilities |
| 2026-08-26 | Variants: Tier 0 fold only for single-call-site defs; Tier 1 same-boundary module + generated resolver for shared defs | User concern about duplication: folding shared buttons would scatter one edit across the codebase; keeping the import path/name stable makes migration zero-churn and the button still editable in one place |
| 2026-08-26 | compoundVariants + sva covered by generated resolver | Mechanical, no guessing |
| 2026-08-26 | Old flat `--from=panda` deleted in same change as new parser lands | User confirmed; one panda path only |
| 2026-08-26 | Patterns: one module per pattern (tree-shaking + reusability), like recipes | User request |
| 2026-08-26 | Tier-1 emission goes to dedicated folders (`pandwind/{recipes,patterns,jsx}/`), not in-place rewrites: scan codebase for used definitions, emit similar files there, rewrite call-site import specifiers | User request — transparent/familiar migration layout mirroring styled-system; usage-driven so unused defs are never emitted |
| 2026-08-26 | Alias resolution: package.json#imports preferred, else framework/config-declared aliases (next/vite+tsconfig-paths/components.json/tsconfig paths) | User decision; keeps emitted code idiomatic to the host app |
| 2026-08-26 | asChild: plain wrapper by default; escalate per-wrapper to installed Slot lib, local mini-Slot as last resort | User question + scan evidence: site's asChild usage is all ark-ui-native; avoid speculative Slot machinery and new deps |
| 2026-08-26 | Custom patterns via dynamic panda.config evaluation, not hardcoded tables | Same mechanism as tokens definePreset importer |
