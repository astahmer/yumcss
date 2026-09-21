# Generated CSS typings

Status: complete

## Goal

Make the measured generated-types optimization an explicit opt-in path for
large Pandwind applications. Keep ordinary `createCss(preset)` inference as
the zero-setup default while letting codegen replace expensive preset-derived
type evaluation with a concrete local style catalog.

## Design

- Expose `createGeneratedCss<TStyles, TDynamicStyles>(preset)` from
  `pandwind/css/generated`. It uses the same runtime implementation as `createCss`, but
  accepts the generated style contract explicitly so the preset type is not
  re-evaluated at every consumer call site.
- Expose a `pandwind-codemod css generate` command and the corresponding
  `pandwind-codemod/css` module API. It loads a project preset, emits a
  deterministic `css.generated.ts` facade, and supports `--check` for CI.
- Generate flat property, token, palette, condition, and dynamic-value types
  that implement the existing `CssFn` surface. The generated facade exports
  the concrete types and a runtime `css` binding; it does not add a second CSS
  compiler.
- Preserve newer `CssFn` additions such as `firstThatWorks` values and
  `keyframes`, and allow the generated factory to select authored token
  custom-property names explicitly while retaining hashed names by default.
- Preserve the runtime contract by delegating to the existing CSS factory.
  Generated output must support the callable API and every existing
  projection: `class`, `vars`, `raw`, `props`, `group`, `input`, and `keyframes`.
- Keep the feature opt-in and version-tied. Generated files are checked in by
  applications, and stale output must be visible through `--check`.

## Non-goals

- Do not change the inferred `createCss(preset)` API or its default behavior.
- Do not generate browser JavaScript beyond the normal CSS runtime already
  required by the application.
- Do not generate recipes, patterns, JSX factories, or a styled-system layer.
- Do not promise strict finite keyword validation when a preset exposes only
  `$all: true` type-only CSS metadata that is unavailable at runtime; preserve
  explicit property/token mappings and use an open fallback for that boundary.

## Acceptance criteria

- [x] Public generated factory and codemod entry are documented.
- [x] Generated output is deterministic and has a freshness check.
- [x] Generated output has tstyche coverage for accepted and rejected
      property, token, condition, palette, dynamic, group, and projection use.
- [x] Generated output has runtime parity coverage against `createCss` for all
      `CssFn` projections.
- [x] The generated-types benchmark remains a regression gate for minimal,
      medium, large, and huge workloads.
