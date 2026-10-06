# Effect 4 tooling boundary

## Decision

Use Effect 4 as an optional implementation detail for long-running YumCSS
tooling workflows only. The shipped runtime, Vite transform hot path, pure
`StyleProgram` transformations, backend renderers, and public adapter
contracts remain independent of Effect.

Effect is useful here for the work that is genuinely effectful and
orchestrated: reading/writing reference workspaces, running bounded batches of
migrations, cancellation, and collecting typed failures. It is not a reason to
replace the existing synchronous ports or to make `effect` a runtime
dependency of `yumcss`.

## Ports and ownership

Existing YumCSS ports remain the boundary:

- `SourceWorkspaceFileSystem` owns source workspace I/O.
- `ProjectModuleLoader` owns host-project package loading.
- migration and proof runners own their domain operations.

The Effect implementation adapts these ports and is composed by scripts. It
does not expose Effect types from package APIs and does not move ecosystem
policy into a generic runner.

## Initial implementation

1. Add `effect@4` as a root development dependency, pinned to an exact beta.
2. Add a small Effect task runner with bounded `Effect.forEach`, interruption,
   and typed task failures.
3. Add an Effect-backed reference-workspace filesystem adapter using the
   official Effect 4 `FileSystem` and `Path` services where those services are
   available; keep a deterministic Node adapter for synchronous ports.
4. Use the runner for repository-proof preparation and reference migration
   batches, preserving output ordering by input reference.
5. Add substitution tests proving the same workflow can use the default
   implementation or the Effect implementation, including cancellation and a
   failed task.

## Guardrails

- No import from `effect` may be reachable from `packages/yumcss/src` runtime
  entry points or browser bundles.
- No `effect/unstable/*` import is allowed; Effect 4 beta APIs outside the
  unstable namespace are the only supported surface.
- Effect remains a tooling-only dependency. If its API or bundle footprint
  becomes a problem, the adapter can be replaced without changing callers.
- Parallel work must be bounded and deterministic; a failure must identify the
  reference/task and never be silently swallowed.

## Completion gates

- root typecheck, lint, format, and Knip pass;
- Effect adapter unit tests cover success, failure, cancellation, and bounded
  concurrency;
- reference preparation/proof scripts use the shared runner;
- a static import audit confirms the shipped runtime has no Effect path;
- the existing fast path and full repository tests remain unchanged and pass.
