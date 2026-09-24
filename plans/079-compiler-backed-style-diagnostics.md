# Compiler-backed style diagnostics plan

## Context

- The 2026-09-23 Arena Pandwind lane accepted a misspelled CSS property,
  `padingBlock`, and a misspelled token, `acent`, through both its TypeScript
  check and build. Bamboo and Panda reject the property typo; StyleX catches
  the token typo. No engine catches both in that fixture.
- This is a correctness signal from one benchmark fixture, not yet proof that
  every Pandwind authoring path promises finite property or token validation.
  First identify whether the fixture uses the typed API, an open `$all` preset,
  `$raw`, a dynamic value, or an untyped benchmark helper.
- `plans/073-generated-css-types.md` defines an opt-in generated style catalog
  and explicitly preserves open fallback behavior where metadata is not
  finite. The user-facing API is frozen. The Oxlint plugin is a source-shape
  guard and must not guess project configuration or token vocabularies.

## Goal

Make invalid static CSS properties and verified token references fail clearly
on the supported typed/compiler path, and keep lint findings aligned with the
same compiler semantics without rejecting intentional raw or dynamic styles.

## What

- Reproduce each Arena typo in the exact lane source and trace its route through
  TypeScript declarations, compiler analysis, and lint rules.
- For static property names covered by the active CSS contract, report
  `padingBlock` at the authored location before invalid CSS is emitted.
- For token references, reject `acent` only when the active preset or generated
  style catalog supplies complete, verified token metadata. Preserve open or
  unresolved token cases when the contract cannot prove the token set.
- Share small pure semantic validation helpers between the compiler and lint
  where they have identical meaning. Keep project-specific configuration
  resolution in its owning adapter/type-generation path.

## Why

A compile-time styling system should not silently accept static mistakes that
its peers reject, especially when output can become inert or differ from the
author's intent. Reusing compiler-owned semantics prevents lint/compiler drift
while keeping lint independent of a full compiler run.

## How

### Conceptual model

```text
verified preset/type metadata ── static authored style ── shared semantic check
                                      │                          ├─ TS/compiler diagnostic
                                      │                          └─ lint diagnostic when provable
                                      └─ raw/dynamic/open metadata ── preserve existing escape contract
```

### Operations / behavior

1. Extract the exact Arena examples and determine their active API and metadata
   completeness. Add the source-specific regression fixture before changing
   behavior.
2. Trace property validation to the public `CssFn` declarations and compiler
   lowering. Decide whether a type correction alone closes the case or whether
   the compiler needs a diagnostic for source that bypasses declarations.
3. Trace token validation to actual preset/generated-catalog evidence. Do not
   create a hardcoded token allow-list or infer a project token set from a
   benchmark fixture.
4. If lint needs the same predicate, extract or reuse the narrow pure helper
   from compiler analysis. Lint should report only when the target API and
   metadata are statically identified; unresolved calls and dynamic values
   remain conservative.
5. Test accepted neighboring cases: valid property/token, custom verified
   token, `$raw`, runtime value, conditional value, open `$all` metadata, and
   missing metadata. Ensure emitted CSS and source preservation remain correct
   for supported escape paths.

### Tech choices

| Choice | Decision | Rationale |
| --- | --- | --- |
| Add a new public API | No | Public authoring surface is frozen; fix declarations or internal diagnostics |
| Duplicate property/token tables in lint | No | They will drift from compiler and configured preset semantics |
| Run the full compiler inside Oxlint | No | Share pure semantic predicates and verified policy input only |
| Token allow-list | No | Use active preset/generated metadata; incomplete metadata cannot prove absence |
| Invalid literal handling | Fail with a source-located diagnostic when the contract is finite | Static errors should not silently emit invalid or unintended CSS |

### Architecture

The compiler and lint layers consume the same small validation predicate where
their inputs and policy are identical. The compiler owns lowering and final
diagnostics; TypeScript owns its declaration contract; lint resolves Pandwind
API bindings and reports only facts it can prove from source and supplied
metadata.

## What this allows

- Correct static property and verified-token diagnostics with tests shared
  across TypeScript, compiler, and lint behavior.
- Explicitly supported `$raw`, dynamic-value, and open-metadata escape paths.
- A future stricter generated catalog for projects that opt into the existing
  generated-types contract.

## What this does not allow

- New public styling APIs or silent changes to dynamic/raw behavior.
- Hardcoded ecosystem or project token vocabularies in the lint plugin.
- A lint rule claiming configuration-dependent certainty without verified
  policy input.
- Updating only snapshots or expected messages without ordinary assertions
  that prove rejection, source location, and preservation behavior.

## UI & UX

No end-user UI change. Compiler, TypeScript, and lint diagnostics should name
the invalid property/token and point to the authored source expression.

## Data model

No persisted or runtime data model change. Any validation input is derived from
existing preset metadata or generated type/catalog artifacts.

## Implementation steps

1. Add minimal exact-input tests for `padingBlock` and `acent` in the Arena
   lane's real Pandwind API shape; assert current behavior before editing.
2. Classify each case as a declaration gap, compiler-analysis gap, benchmark
   escape hatch, or incomplete metadata case. Record the supported contract.
3. Fix the property case at the narrowest correct boundary, preferring the
   existing typed CSS contract; add a compiler diagnostic only if invalid
   source can legitimately bypass that contract.
4. Fix the token case only when active metadata proves the valid token set;
   otherwise make the fixture use the verified generated/preset path or record
   the intentional open boundary rather than guessing.
5. Reuse the pure semantic helper in lint only where identical inputs and
   outcomes are available. Cover aliases/namespaces and ignore unrelated local
   functions as required by the lint plugin contract.
6. Add positive and negative matrices for valid, invalid, custom, raw, dynamic,
   conditional, open, and missing-metadata cases; assert compiler output and
   lint findings independently against the shared semantic cases.
7. Re-run the Arena typecheck/build proof and report whether both misspellings
   are rejected in the supported lane. Describe the fix in a focused JJ
   revision.

## Open questions

1. Does the Arena token typo occur in a typed token reference, or in a string
   value intentionally accepted by the benchmark's open CSS value contract?
2. Does the property typo reach compiler extraction through a typed `css()`
   call, an explicit raw escape, or an untyped helper?

## Acceptance criteria

- [ ] Exact Arena examples have regression coverage before implementation.
- [ ] `padingBlock` is rejected by the supported static typed/compiler path
      with a useful source location.
- [ ] `acent` is rejected only when complete active token metadata proves it
      invalid; incomplete or open metadata does not cause guessed diagnostics.
- [ ] Compiler and lint agree on shared static semantic cases through the same
      pure helper, with no full compiler execution in Oxlint.
- [ ] Valid, custom-token, raw, dynamic, conditional, open, and missing-metadata
      cases retain their documented behavior and do not gain false positives.
- [ ] No public API surface is added, and the Arena lane's typecheck/build
      evidence matches the published correctness table.

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-24 | Split diagnostics from output-size work | Type/config semantics need different owners and acceptance tests than browser-byte optimization |
