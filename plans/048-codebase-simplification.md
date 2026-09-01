# Codebase simplification plan

Status: complete

## Goal

Reduce incidental complexity while preserving Pandwind's hexagonal boundaries,
the frozen user-facing API, semantic `StyleProgram`, flat `SwapIR` fast path,
and proven migration behavior.

The standard for each change is ownership, not line count. A module should be
split only when a policy has an independent implementation, lifecycle, or
substitution test. A module should be merged or deleted when it only forwards,
duplicates, or preserves an obsolete compatibility shape.

## Audit findings

- `runtime-pruner.ts` exposes an internal enum that has no public consumer.
- `swap/sources.ts` and `swap/source-pass-utils.ts` duplicate generic source
  editing, block matching, and excluded-range logic.
- `swap/emit.ts` retains a private token-reference alias with no independent
  meaning.
- The large semantic IR, migration runner, Panda pipeline, and concrete
  adapters are legitimate deeper domains, but their next changes must move
  policy behind existing ports rather than create more façade-only files.
- Knip production analysis is clean; the full analysis currently identifies
  only the unused internal enum above.

## Execution slices

1. Remove dead exports and private compatibility aliases.
2. Establish one owner for source-pass primitives and update all callers.
3. Inspect the deepest migration domains by call shape. Keep the semantic IR,
   adapter migration, and Panda pipeline cohesive for now: their current
   boundaries already own complete lifecycles, and a line-count-only split
   would add indirection without a replaceable policy or useful substitution
   test.
4. Record the completed boundaries in the architecture guide.
5. Run focused package tests, typechecks, formatting, Knip, and repository
   status checks. The full codemod suite is intentionally deferred unless
   explicitly requested.

## Non-goals

- No public API compatibility aliases.
- No broad line-count-driven rewrite.
- No change to migration semantics merely to make files smaller.
- No changes to concurrent workspaces or external repository corpora.

## Definition of done

- No dead internal exports or duplicate source-pass implementations remain.
- Every retained façade delegates to named ports with an injectable default
  where the policy is independently replaceable.
- Architecture documentation describes the final ownership.
- Focused tests, typechecks, formatter, and Knip pass with a clean JJ working
  copy.

## Completed evidence

- `SourcePass` owns all shared source-pass mechanics; callers no longer import
  editing or balanced-block helpers from `migrate.ts` or `sources.ts`.
- The unused `CssRuntimeMethodTag` export and private token-reference alias
  were removed.
- The focused codemod boundary tests pass: 183 tests across source, swap,
  migration-matrix, and template-parser coverage.
- Knip and production Knip pass. Full codemod execution remains intentionally
  deferred while the fast focused workflow is used.
