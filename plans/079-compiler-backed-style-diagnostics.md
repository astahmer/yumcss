# Compiler-backed style diagnostics plan

Status: complete

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

## Completion findings

- The Arena preset uses properties: { $all: true, ...pandaProperties } and
  strict: false. Its padingBlock is an allowed arbitrary property; "acent" is
  an ordinary string value rather than a verified token reference.
- The exact values are rejected by finite createCss typing, and retained by
  the open preset test. No compiler diagnostic or guessed token vocabulary is
  appropriate for the Arena's explicitly open configuration.
- no-dynamic-values now consumes the compiler's cached module-constant scope.
  Its finite conditional regression uses the same source case as the core Vite
  extraction test. Oxlint remains independent of full compiler execution.
- A targeted Oxlint run reproduced a stack-growth crash when the compiler's
  static-scope walker followed parser `parent` pointers. The shared walker now
  skips metadata/back-links, tracks visited objects, and uses an iterative
  stack without spread. A cyclic-parent regression test passes; rebuilt Pandwind and
  lint-plugin artifacts let targeted Oxlint complete on all four affected TS
  files.
- Validation: lint-plugin tests passed 44/44; core cx-inline passed 64/64;
  core Vite CSS passed 78/78; source-binding passed 10/10; and TSTyche passed
  168 tests / 377 assertions. Pandwind and lint-plugin package typechecks and
  focused Oxlint passed. The current core test stage passed 93 files / 1,016
  tests.
- Timing gates remain inconclusive under host load: runtime `css.default.raw`
  and `css.merge` throughput fell below their recorded bands, while four TSC
  check-time scenarios narrowly exceeded limits without instantiation-count
  failures. Host load averaged 17.33, then 12.85; do not update baselines from
  these readings. Root `pnpm typecheck` still has unrelated
  `packages/devtools/src/plugin.ts` errors. Root lint was stopped after 19
  minutes at about 3.9 GB RSS; a scoped 348-file Oxlint scan was stopped after
  more than 6 minutes at about 2.4 GB RSS. Full-repository lint latency remains
  unproven despite the isolated lint-plugin scaling test passing.

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

| Choice                                  | Decision                                                          | Rationale                                                                      |
| --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Add a new public API                    | No                                                                | Public authoring surface is frozen; fix declarations or internal diagnostics   |
| Duplicate property/token tables in lint | No                                                                | They will drift from compiler and configured preset semantics                  |
| Run the full compiler inside Oxlint     | No                                                                | Share pure semantic predicates and verified policy input only                  |
| Token allow-list                        | No                                                                | Use active preset/generated metadata; incomplete metadata cannot prove absence |
| Invalid literal handling                | Fail with a source-located diagnostic when the contract is finite | Static errors should not silently emit invalid or unintended CSS               |

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

1. [x] Add exact-input type cases for padingBlock and acent in finite and open
       preset configurations.
2. [x] Classify each case as an intentional open-contract path or a finite
       property/token validation gap.
3. [x] Keep invalid finite properties and verified token references rejected
       by the existing typed CSS contract; no additional compiler diagnostic is
       needed for values the open contract accepts.
4. [x] Preserve strict: false behavior and avoid inventing a token allow-list.
5. [x] Reuse compiler-owned cached static module analysis for lint binding
       scope while keeping source-shape reporting and policy in the lint rule.
6. [x] Cover finite conditionals with the same source case as the core Vite
       extraction test and retain raw, dynamic, custom, open, and missing-metadata
       cases.
7. [x] Re-run lint, compiler, type, Arena build, and Arena typecheck proofs;
       describe changes in focused JJ revisions.

## Resolved questions

1. "acent" is an ordinary string value under the Arena lane's open $all
   property catalog, not a token reference with a finite valid set.
2. padingBlock reaches an open strict: false preset. Finite createCss typing
   rejects it; the open preset intentionally accepts arbitrary CSS property
   names.

## Acceptance criteria

- [x] Exact Arena examples have regression coverage in finite and open preset
      configurations.
- [x] `padingBlock` is rejected by finite typed createCss; the Arena's open
      $all contract intentionally accepts it.
- [x] `acent` is rejected only by finite token metadata; open string values do
      not cause guessed diagnostics.
- [x] Lint uses compiler-owned cached static-scope analysis and shares the
      core finite-conditional fixture without running the compiler in Oxlint.
- [x] Valid, custom-token, raw, dynamic, conditional, open, and missing
      metadata cases retain their documented behavior.
- [x] No public API was added, and Arena type/build evidence matches the
      documented open-lane outcome.

## Decisions log

| Date       | Decision                                                                 | Rationale                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-24 | Split diagnostics from output-size work                                  | Type/config semantics need different owners and acceptance tests than browser-byte optimization                                           |
| 2026-09-24 | Preserve Arena's open CSS contract and enforce typos on finite presets   | The exact typos fail when the preset proves a finite property/token set; Arena deliberately allows arbitrary properties and string values |
| 2026-09-24 | Share compiler static-scope collection with lint, not compiler execution | This removes repeated lint-only declaration walks while keeping Oxlint side-effect-free and core Vite conditional behavior authoritative  |
