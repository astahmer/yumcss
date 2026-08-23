# Plan 015 — Multi-theme architecture (planning doc, no code yet)

## Problem

Theme switching (light/dark, brand variants) across three token tiers — raw,
semantic (`$surface`), component — without runtime CSS injection or
duplicated full sheets.

## Candidate architectures

**A. Var-swapping layers (recommended starting point).** Semantic tokens are
CSS custom properties re-bound under switch scopes:

    :root { --color-surface: white; }
    [data-theme="dark"] { --color-surface: #0b0b10; }

Utilities/atoms reference `var(--color-surface)` once; switching re-binds
vars, no second stylesheet. Cost: one rule per changed token per theme
(scales with THEME DELTA, not sheet size). This is what the condition-bound
@theme bridge already generates for `_dark` — generalize it from a fixed
condition set to user-declared theme scopes.

**B. Regenerated sheets per theme.** Compile once per theme, swap `<link>`.
Correct but doubles/triples CSS bytes and complicates the virtual module.
Reject unless A hits a wall (e.g. themes differing in structure, not values).

## Design constraints (from house rules)

- No new user-facing API surface: themes come from the preset/DTCG tokens
  (`defineSemanticTokens` groups), switched by a data-attribute convention.
- Prove-not-assume: every theme-scoped override verified through real
  Tailwind compilation like the parity suites.
- Interplay with var-inline (014): var-inline's fallback chains and theming
  both bind custom properties at different scopes — the theming doc must
  define the layering (theme scope sets the var; inline style may override
  per-element) so they compose instead of collide.
- Size accounting required: report per-theme byte delta in `analyze --css`.

## Deliverables

1. Extend the DTCG bridge to emit `[data-theme]` scope blocks from declared
   theme groups (reuses createConditionResolver mechanics).
2. `analyze --css` gains per-theme delta reporting.
3. Docs: README theming section after proof tests land.

## Status

Planning. Implementation only after kumo/8bitcn ports land (they provide the
real-world corpus to validate against).

## Status update (2026-08-23) — L1+L2+theme scopes IMPLEMENTED

- `buildThemeScopes` / `resolveThemes`: tokens modules may declare
  `themes: { <scope>: { "--var": value } }`; codegen emits sorted, warning-on-invalid
  `[data-theme="…"]` override blocks appended to the bridge. Byte-stable when absent.
- Real-Tailwind proofs in tests/theme-scopes.test.ts: utility keeps its var()
  reference; scope block survives compilation AFTER the @theme :root default;
  presets without themes unchanged.
- analyze --css reports per-scope delta bytes.

### Layering with var-inline (composition contract)

Scopes bind custom properties at SELECTOR scope; var-inline binds at ELEMENT
scope via inline style. CSS cascade rules make these compose without any
coordination: element inline style beats every selector-scoped binding, so a
`css.vars({ color: $c })` call always wins over whatever `[data-theme]`
sets for that element, while non-inline siblings keep following the active
theme. No fallback-chain changes needed.

### L3 component tier — designed follow-up (not yet implemented)

Data model: component-scope alias blocks re-binding semantic vars at class
scope — `.button { --sm-button-bg: var(--color-primary); }`. Author names map
dotted->dashed under an explicit namespace (`button.bg` -> `--sm-button-bg`)
to avoid Tailwind namespace collisions. Emission reuses the same deterministic
block mechanics (sorted, warn+skip invalid/unresolvable refs, cycle-detect
recursive aliases). Utilities keep referencing only L1/L2; restyling a
component never touches theme or utilities.
Open questions before building: (1) do component classes opt in explicitly
(`class="pandwind-component button"`) or does the alias block attach to a
user-chosen selector string? (2) do aliases need variant support
(`button.bg_hover`) or is flat enough for v1? (3) where do alias declarations
live — preset module alongside themes?
