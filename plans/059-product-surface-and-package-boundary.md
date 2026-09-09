# Product surface and package boundary plan

## Context

Pandwind currently presents a small root authoring API, but the repository also
ships a large collection of runtime, code-generation, bundler, backend,
adapter, analyzer, Studio, DevTools, Playground, and MCP surfaces. The
`pandwind` package declares 52 export paths and hard-depends on tooling such as
Tailwind's Node engine, Oxc, PostCSS, Unplugin, and CAC even when a consumer
only needs the runtime.

The current product story is therefore difficult to explain and the install
boundary does not match the runtime boundary. The candid review is recorded in
`docs/src/content/docs/reference/current-limitations-and-criticism.md`.

Related constraints:

- The root authoring API (`tw()`, `css()`, `cx()`, presets, and
  `ClassNameStrategy`) is frozen.
- Generated project artifacts are part of the existing Tailwind contract.
- Pre-launch cleanup may remove obsolete or transitional paths directly.
- Existing runtime, Vite, codegen, and adapter behavior must remain covered at
  each step.

## Goal

Make Pandwind understandable and inexpensive to adopt by separating runtime,
build-time, and optional tooling responsibilities while preserving the frozen
authoring APIs and their documented subpaths.

The result should make the common web runtime path small and stable, make the
build-time requirements explicit, and classify experimental surfaces without
pretending they have the same maturity as the core.

## What

This plan covers:

- an inventory and ownership map for every public export and package
  dependency;
- a runtime-versus-build-time dependency boundary;
- removal or relocation of internal `_runtime` exports from the public package
  surface where no external consumer requires them;
- package metadata corrections;
- an explicit maturity classification for design CSS, non-web backends,
  adapters, MCP, DevTools, Studio, and Playground;
- generated-artifact lifecycle documentation and stale-artifact diagnostics;
- package and documentation checks that prevent the public surface from growing
  accidentally.

This plan does not redesign `tw()`, `css()`, `cx()`, presets, or the semantic
IR, and it does not delete a surface solely because it is not part of the
default web lane. Low-use features should first move behind clear optional
boundaries and evidence requirements.

## Why

The current shape makes users pay the conceptual and installation cost of a
large platform before they know which lane they need. It also makes future
compatibility harder because build tools and optional ecosystem packages share
the same release boundary as the runtime.

A clean boundary improves:

- install size and package-manager resolution;
- browser bundle predictability;
- release compatibility when Tailwind or bundlers change;
- documentation and support load;
- the ability to remove or replace optional tooling without touching runtime
  callers.

## How

### Conceptual model

```text
                         +----------------------+
                         | pandwind runtime     |
                         | tw / css / cx / host |
                         +----------+-----------+
                                    |
                         stable semantic contracts
                                    |
       +----------------------------+----------------------------+
       |                            |                            |
+------+-------+            +-------+------+             +-------+-------+
| build layer  |            | integration  |             | tooling layer |
| codegen      |            | Vite/unplugin|             | codemod       |
| Tailwind     |            | framework    |             | analyze/MCP   |
| CSS bridge   |            | backends     |             | Studio/DevTools|
+--------------+            +--------------+             +---------------+
```

The runtime package owns stable execution and types. Build-time packages own
parsing, Tailwind loading, code generation, and extraction. Tooling packages
own filesystem, project loading, migration, reporting, and host validation.
No runtime entry should import a build or tooling implementation.

### Operations / behavior

1. Enumerate every package export, dependency, generated artifact, and import
   path used by tests, examples, docs, and external-package smoke tests.
2. Classify each item as stable runtime, build-time, optional integration,
   experimental tooling, or test-only.
3. Move build-only dependencies behind the smallest package boundary that can
   preserve the existing documented entry points without importing them into
   runtime bundles.
4. Remove public exports that are implementation details and have no verified
   external consumer. Keep intentional narrow subpaths documented.
5. Add a package-surface check that fails when an internal path or dependency is
   exposed without an ownership note.
6. Add a generated-artifact check that reports the exact command and source
   inputs needed to refresh stale `tw.ts`, declarations, bridge, theme, and
   interop artifacts.
7. Correct repository metadata and make all user-facing CLI examples agree on
   the current command shape.
8. Add a maturity table to the docs with evidence requirements for stable,
   experimental, and research surfaces.

### Tech choices

| Choice            | Decision                                                                         | Rationale                                                                                 |
| ----------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Package split     | Prefer physical ownership boundaries over one universal package                  | Consumers should not install or reason about every Pandwind subsystem                     |
| Existing subpaths | Preserve only verified user-facing subpaths                                      | The frozen API is valuable; internal implementation paths are not compatibility contracts |
| Build integration | Keep Tailwind/Oxc/PostCSS dependencies with codegen or build integration         | These are not runtime requirements                                                        |
| Optional tooling  | Keep MCP, Studio, DevTools, and analyzer dependencies out of the runtime package | Tooling can evolve independently and may need host-specific dependencies                  |
| Maturity labels   | Stable / experimental / research                                                 | Broad support must not look equivalent to production proof                                |
| Compatibility     | No deprecated aliases or compatibility projections                               | Pre-launch cleanup permits one coherent boundary                                          |

### Architecture

```text
Consumer import
  -> stable runtime export
      -> semantic program / backend

Project build
  -> codegen + official ecosystem loader
      -> generated artifact / bundler plugin
          -> stable runtime import

Agent or migration tool
  -> analyze / codemod / MCP port
      -> project context + adapter registry
          -> runtime/build artifacts
```

## What this allows

- Runtime-only consumers can install and bundle the runtime without pulling
  every code-generation and project-analysis dependency.
- Build failures identify stale or missing generated artifacts directly.
- Optional integrations can change release cadence and dependencies without
  destabilizing `tw()`, `css()`, or `cx()`.
- The documentation can explain one default adoption path and clearly label
  advanced surfaces.
- Knip, package-export, and release checks can enforce the intended boundary.

## What this does not allow

- It does not make every ecosystem adapter stable or lossless.
- It does not turn generated Tailwind metadata into a runtime-free requirement
  for every CSS-in-JS lane.
- It does not add another authoring API to compensate for packaging problems.
- It does not remove non-web or experimental implementations before their
  ownership and evidence are understood.
- It does not preserve internal aliases merely to avoid updating repository
  callers.

## UI & UX

### Desktop

The package and docs should present one primary path:

```text
Install Pandwind
  -> choose Tailwind or atomic CSS
  -> run one setup command
  -> import the stable API
  -> see the verification command
```

Advanced surfaces should appear under separate integration and tooling
sections, with a maturity label and the required host/build assumptions.

### Mobile

Not applicable to the package boundary. Documentation should still avoid
requiring readers to understand the whole repository before choosing a lane.

### Common interactions

| Action                  | Result                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| Install runtime lane    | No build-only dependency is required for runtime imports                     |
| Run code generation     | Generated files identify their source inputs and refresh command             |
| Import an internal path | The package either rejects it or documents it as a deliberate public subpath |
| Open advanced docs      | The page shows stability, host requirements, and evidence status             |

## Data model

```ts
interface PackageSurfaceRecord {
	readonly packageName: string;
	readonly exportPath: string;
	readonly owner: "runtime" | "build" | "integration" | "tooling" | "test";
	readonly maturity: "stable" | "experimental" | "research";
	readonly dependencies: readonly string[];
	readonly externalContract: boolean;
	readonly evidence: readonly string[];
}
```

The inventory is repository metadata used by checks and documentation. It is
not a new consumer-facing runtime API.

## Implementation steps

1. Inventory package exports, dependency imports, generated artifacts, package
   metadata, docs references, and external smoke tests.
2. Define the stable runtime/build/tooling ownership map and review every
   proposed move against the frozen API policy.
3. Correct package repository-directory metadata and add a package metadata
   test.
4. Separate build-only and tooling-only dependencies from runtime ownership;
   use a focused package split where dependency isolation cannot be achieved by
   entry-point ownership alone.
5. Remove or reclassify internal `_runtime` exports after import consumers are
   migrated.
6. Add generated-artifact freshness diagnostics and update Playground/editor
   setup to use the same check.
7. Add package export/dependency/maturity checks to CI and Knip configuration.
8. Rewrite the top-level and docs navigation around the primary web path, then
   label design, non-web, adapter, and tooling surfaces.
9. Run runtime size, package pack/import, type, integration, and workspace
   checks after each boundary change.

## Open questions

1. Should codegen remain a subpath of `pandwind`, or should it become a
   separately published package with a deliberately new name?
2. Which current subpaths have external consumers that cannot be migrated
   before the first public release?
3. Should React Native and OpenTUI remain in the main repository but move to
   separate packages, or remain experimental subpaths until a real consumer
   exists?
4. Is a single `pandwind setup` command worth adding, or can the existing
   codegen command be made reliable and discoverable without new API surface?

## Acceptance criteria

- [x] Runtime-only installation does not require build-only ecosystem packages.
- [x] Every published export has an owner, maturity, and evidence record.
- [x] Internal `_runtime` paths are either removed from the public export map or
      justified by a verified external contract.
- [x] Package repository metadata points at the actual workspace directories.
- [x] Generated-artifact freshness failures identify the stale file, source
      input, and exact refresh command.
- [x] Runtime size, pack/import, typecheck, and package tests pass after the
      boundary changes.
- [x] The primary adoption path fits in one short guide and does not require
      users to understand the codemod, MCP, or non-web backend architecture.
- [x] Documentation no longer presents experimental breadth as stable support.

Evidence: `pnpm --filter pandwind run test`, `pnpm run typecheck`, the package
pack/import smoke, `pnpm run generated:check`, and `pnpm run surface:check` pass.
The Basic mode guide is the short primary path; the current limitations page
now labels runtime, codegen, codemod, Playground, MCP, and non-web maturity.

## Decisions log

| Date       | Decision                                                                          | Rationale                                                              |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-09-07 | Split the review into product/package, migration-proof, and tooling/runtime plans | The current weaknesses have different owners and validation gates      |
| 2026-09-07 | Preserve the frozen authoring API while changing internal package ownership       | Adoption problems should not be solved by adding more user-facing APIs |
