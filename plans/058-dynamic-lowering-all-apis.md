# 058 — Dynamic value lowering for every Pandwind API

Status: open

## Context

Plan 057 proved the dynamic-value pattern for `tw()`: finite-value discovery,
candidate registration, exact-match verification, and partial lowering. The
same discipline is missing for the other frozen APIs. Today:

- `css()` / `css.class()` / `css.group()` — only mixed literal/dynamic
  objects in JSX positions get partial lowering (T5 carrier). A call whose
  dynamic position has a FINITE value set (ternary, union-typed const, array
  member) is skipped entirely even though every possible output is knowable
  at build time.
- `dcss()` (design CSS) — literal styles resolve statically; any dynamic
  member skips the call. No finite discovery, no carrier.
- `cx()` — dynamic args are runtime class selection (different semantics:
  no values to lower, but candidate UNION registration for the scanner lane
  is possible when args are finite sets of literals).

Goal: every API follows the same static-first decision table:

```
fully literal            -> fold at build time (existing paths)
dynamic + finite set     -> register every possible output / emit carrier
dynamic + unbounded      -> runtime fallback + explicit coverage diagnostic
```

## Tasks

- [ ] T1 - Shared finite-value evaluator. Extract plan-057's
      `evalLiteralValues` usage in `src/vite/inline.ts` into the shared
      literal module (`src/tw/literal.ts`) so css/design/cx evaluators
      consume the same ternary/union/array/constant-scope discovery instead
      of duplicating it. Behavior-preserving; inline snapshots pin tw
      behavior before/after.
- [ ] T2 - Finite discovery for `css()`/`css.class()`/`css.group()` in
      `StaticCssCallRewriter`: when a dynamic position has a finite value
      set, compile one artifact per combination (cap 256/call, beyond cap ->
      residual diagnostic) and register candidates for the scanner lane.
      Unbounded values keep the existing css.vars/css.props carrier or the
      runtime fallback. Issue-driven fixtures first: mixed ternary color,
      union-typed size map, constant array index.
- [ ] T3 - Finite discovery for `dcss()`: same policy through
      `resolveDesignStyle` — one resolved design style per value
      combination, candidates registered through the design token catalog.
      Token values outside the catalog produce residuals (same
      exact-match-only rule as T6 of plan 057).
- [ ] T4 - `cx()` candidate union: when a dynamic cx() argument is a finite
      set of literal classes, register the union so the Tailwind scanner
      emits CSS for classes that only appear at runtime. Never fold the
      call itself — selection stays runtime. Unbounded args stay untouched.
- [ ] T5 - Candidate plumbing unification: extend the plugin's candidate
      collection (`@source inline` emission + `pandwind-tw scan` module
      mode) to accept candidates from css/design/cx lanes, not only tw.
      Deduplicate across lanes.
- [ ] T6 - Verification gates: every registered candidate must pass the
      same exact-match conflict-map verification as plan 057 (reuse
      `tokenHasExactCss`); unresolvable members surface via `onUnresolved`,
      never silently dropped.
- [ ] T7 - Docs: update the dynamic-values sections in
      `docs/src/content/docs/api/css.md`, `design-css.md`, `cx` docs, and
      the technical overview decision table to cover all four lanes.

## Definition of done

Every frozen API (`tw`, `css`, `css.class`, `css.group`, `dcss`, `cx`)
handles bounded dynamic values build-time-first: finite sets register all
possible outputs, static subsets fold, only genuinely unbounded values hit
the runtime, and every unregistered/unresolvable value produces an explicit
diagnostic or residual. Inline snapshots cover happy, non-happy, and edge
cases per lane; focused test files run green and typecheck passes.

## Sequencing

`T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7`. T1 is behavior-preserving
infrastructure; T2/T3 are the per-API lowering waves; T4/T5 wire the
scanner; T6/T7 close correctness and docs. One focused JJ revision per
task.
