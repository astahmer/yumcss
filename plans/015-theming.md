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
