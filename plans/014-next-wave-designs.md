# Plan 014 — Next-wave designs (var-inline, per-page split, multi-theme, debug)

Decisions and design sketches agreed 2026-08-23. Nothing here is built yet.

## 1. Var-inline strategy (APPROVED — spike first)

**Goal:** delete the last reason to ship the css runtime: truly dynamic
values compile to `{ class, style }` pairs + a static toggle-rule sheet
instead of falling back to runtime css() (user-framed as "swap the engine
for a minimal alternative" — the minimal alternative is NO engine).

**Shape:**

- New entry `css.vars({ color: $c })` returning `{ class, style }` — separate
  from `css()` so return types stay clean. Dynamic values are `$identifier`
  marked; keys stay fully typed.
- Sheet: one toggle rule per property×condition actually used:
  `.pw-color { color: var(--pw-c-color); }`
  `.pw-hover\:color:hover { color: var(--pw-c-color_hover, var(--pw-c-color)); }`
  Fallback chains make variants optional at the call site.
- cx() gains an input variant threading style objects; conflict merging is
  nearly free — signatureFromCssKey works off the flattened KEY, not values.
- Size: replaces 2.35KB-min css runtime with a ~200–400 byte stub for apps
  whose only dynamic usage is vars.

**Scope freeze:** dynamic VALUES only (no dynamic property sets/keys).
**Spike checklist before building:** condition encodings verified against
real Tailwind compilation (house standard), cx threading type design,
vite-pass detection rules, sheet-growth bounds on a real corpus.

## 2. Per-page CSS splitting (APPROVED — opt-in, NOT default)

**Default stays one global virtual module**: correctness first (cross-route
class sharing is invisible at build time), Tailwind-parity mental model, no
config surface. Splitting becomes an opt-in when apps need an initial-CSS
diet.

**Sketch:** `pandwindCssVite(preset, { splitByRoute: ["src/routes/**"] })` —
collect pass tags each atom/candidate with the route files that use it;
shared atoms go to a common chunk, route-only atoms to per-route virtual
modules (`pandwind:css?route=foo`) wired via a small runtime manifest.
Tailwind-side candidates keep using the safelist (Tailwind emits per-page CSS
naturally when each page imports its own entry). Needs a real-app measurement
before committing.

## 3. Multi-theme architecture (PLANNING DOC FIRST — no code)

Problem space: theme switching (light/dark/custom brands) across three
layers — raw tokens, semantic tokens (`$surface`), component tokens.
Direction to evaluate in the doc:

- var-swapping layers (CSS custom properties re-bound under `[data-theme]`,
  `.dark`, media queries) vs re-generated sheets per theme;
- which tier owns conditions (semantic layer) so components never branch;
- interplay with the DTCG → @theme bridge and with var-inline's fallback
  chains (they solve adjacent problems — unify or explicitly don't);
- size accounting: per-theme delta vs duplicated full sheets.
  Deliverable: `plans/015-theming.md` with a decision, then implement behind
  the preset API without new user-facing surface (per AGENTS.md policy).

## 4. Dev debug annotations (APPROVED — small)

Dev-build only (`pandwindVite({ debug: true })`): emitted rules carry
`data-pw-origin="<file>:<line>"` (or a comment in the generated stylesheet),
and dev overlay helper lists the origin of classes under the cursor. Steal:
panda debug / stylex devtools. No prod cost — flag off by default, zero code
in the shipped path.
