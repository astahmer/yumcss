# Plan 015 — Multi-theme architecture

**Status: COMPLETE.** L1/L2 theme scopes and the L3 component-scope tier are
implemented, tested against real Tailwind compilation, and documented in
`docs/src/content/docs/api/theming.md`.

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

The initial implementation gate was satisfied after the Kumo/8bitcn corpus
work. The remaining theme work is ordinary ecosystem expansion, not an
unimplemented architecture decision.

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

### L3 component tier — historical design sketch

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

## Outcomes — L3 component tier IMPLEMENTED (2026-08-24, model A)

Scope-override model A as approved. `buildComponentScopes` in
src/tw/generate-theme.ts + `resolveComponents` in codegen-theme-input.ts:

- Authoring: `components: { button: { primary: "$color-brand" } }` on the
  tokens module. Key mapping (documented, no guessing beyond these):
  `--verbatim` keys pass through; dotted keys keep their group
  (`text.muted` -> `--text-muted`); plain keys land in the color namespace
  (`primary` -> `--color-primary`), matching the brief's example.
- Values: raw strings or `$refs` into the vars bridged THIS run (unknown
  refs / self-cycles warn+skip). Condition-bound values resolve via preset
  conditions; a failed variant drops only that variant (no dead-utility
  risk — the semantic variable always exists; differs from splitTokens'
  whole-token skip by documented necessity).
- Emission: sorted `.pwc-<component> { --var: value; }` blocks appended to
  the bridge; condition variants render as chained selectors
  (`.pwc-button:hover`, `.pwc-button.dark`) with at-rule wrapping.
  Byte-stable when no components declared.
- Proofs (tests/component-scopes.test.ts, real Tailwind): override rule +
  var()-referencing utility both compile; `[data-theme]` scopes coexist;
  values never leak outside their binding; determinism; loud skips for
  unknown refs/cycles/invalid names (7 tests).
- analyze --css reports `.pwc-*` scope-rule count.

Design notes vs the earlier sketch: the "explicit opt-in class" open
question resolved to the generated `.pwc-<name>` class (namespaced, no
user-selector injection); variant support (`button.bg_hover`) IS included
via condition-bound authoring rather than deferred.

### Native preset component-token contracts (2026-09-11)

The native preset lane now has a separate third-layer contract from the
codegen component-scope model above. A `component` token group may contain
string aliases such as `component.card.bg: "semantic.bg.primary"`. A typed
`createCss(preset)`/`createDesignCss(preset)` call accepts those component
paths directly, and the compiler emits the component variable as a reference
to the semantic variable. Theme switching therefore rebinds the semantic
value without changing JSX, props, or component styles.

These are intentionally separate authoring patterns:

- native component-token refs are the canonical no-runtime-map contract;
- `components` exports remain build-time `.pwc-*` scope overrides for the
  Tailwind bridge; and
- an imported JavaScript identifier map is an optional composition helper,
  not the component-token layer itself.
