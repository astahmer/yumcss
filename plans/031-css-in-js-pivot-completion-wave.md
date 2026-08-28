# CSS-in-JS pivot completion wave

**Status: COMPLETE for this wave.** The extension mechanism, shared scanner,
validator registry, external adapter families, semantic metadata, and
differential corpus landed. New ecosystems continue through the same plugin
contract and are not a reason to reopen the completed core wave.

## Goal

Make Pandwind a practical pivot boundary for migrating between independent
CSS-in-JS ecosystems, while keeping the flat `SwapIR` fast path and the small
runtime authoring API intact.

## Completed in this wave

- Added `pandwind.style-adapter-plugin/1` with explicit registration and async
  package discovery. Discovery accepts injected loaders for deterministic CLI,
  bundler, and test behavior.
- Moved adapter migration orchestration into `adapter-migration.ts`; concrete
  adapter definitions remain separate from the route runner. Panda migration
  is exposed through a staged `PandaMigrationPipeline` domain.
- Promoted source scanning and parser selection to the `pandwind/source`
  package export. Codemod delegates to it, and Vite/analyze/Panda validation
  paths use the same parser helper.
- Added `pandwind.style-validator/1` with canonical CSS and residual
  validators. Differential fixtures may register additional browser, SSR,
  hydration, or framework validators without changing the runner.
- Added independently owned Fela, Goober, and Aphrodite adapters and a
  representative differential corpus covering cross-adapter and round-trip
  cases.
- Extended StyleProgram v3 with theme bindings, composition edges, runtime
  context, plugin transforms, framework provenance, and dynamic expression
  dependencies. Capability requirements now reject unsupported semantics
  explicitly.

## Validation

- Codemod: 21 files / 198 tests pass.
- Workspace typecheck passes.
- Existing Vite and runtime lanes remain covered by their package tests; the
  bundle-heavy full pandwind suite should be run separately when CI capacity is
  available.

## Remaining ecosystem work

This wave creates the extension mechanism; it does not make every library
losslessly representable. Each new adapter still needs capability declarations,
fixtures, and real-project validation for its runtime, theme, composition, and
framework semantics.
