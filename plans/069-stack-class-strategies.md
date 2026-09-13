# Plan 069 — Strategy-aware Stack bindings

## Problem

The original `Stack` spike emitted Tailwind utility strings directly. That is
valid for a Tailwind project, but it made the default renderer look universal
even though it bypassed Pandwind's configured class-name strategy, preset, and
namespace boundary.

## Decision

- Bare `Stack` remains the explicit Tailwind-compatible fast path. Its
  `stackClasses` output is unchanged and is only correct when Tailwind (or an
  equivalent utility compiler) owns those classes.
- Each JavaScript renderer exposes `createStack(css)`. The factory maps Stack
  props to ordinary CSS declarations and delegates to the supplied `.class`
  projection. The supplied CSS compiler therefore owns its class strategy and
  any class prefix; Pandwind's `namespace` option continues to scope dynamic
  carriers, not static class names.
- `gap` and `padding` accept CSS strings or numbers in the factory lane. A
  number follows the CSS compiler's property-aware normalization (`4` becomes
  `4px`); a string is not guessed as a framework spacing token. Use the
  source compiler's documented token spelling or a resolved CSS value.
- `stackFoldVite()` keeps the Tailwind lane. `stackFoldVite({ engine })` is the
  explicit configured lane and must share that engine with
  `pandwindCssVite`. The engine records prepared declarations per source, so
  sheet-backed strategies get the exact CSS for folded classes.
- `classAttribute: "class"` selects Solid/Vue-style output; the default
  `"className"` covers React/Preact. The fold pass stays conservative when a
  strategy refuses a declaration.

Automatic detection of `const Stack = createStack(css)` is intentionally not
part of this change: after aliasing and re-exporting, a JSX tag does not carry
reliable runtime ownership metadata. The build lane is therefore selected by
the explicitly shared engine configuration.

## Shape

```text
StackProps ── stackStyle() ──┬─ createStack(css) ── css.class() ── configured classes
                             └─ stackClasses() ─── Tailwind utility fast path

stackFoldVite({ engine }) ── engine.foldLiteralStyle(source)
                         └─ pandwindCssVite({ engine }) ── prepared CSS rules
```

## Proof

Focused tests cover the shared style mapping, all four renderer factories,
Tailwind compatibility, refusal/conservative folding, numeric normalization,
the `class` attribute spelling, and generated CSS for a sheet-backed strategy.
