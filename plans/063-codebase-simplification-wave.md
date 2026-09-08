# Codebase simplification wave plan

Status: proposed

## Context

The first simplification wave removed the duplicate fold-analysis ports and the
codemod adapter-route projection. The repository now has a sounder ownership
rule, but several older layers still expose the same policy through multiple
wrappers, registries, or compatibility-shaped facades.

The highest-confidence candidates are visible in the current implementation:

- General codemod migration has `runAdapterMigration*`, an
  `AdapterMigrationExecutor`, a `StyleMigrationUseCase`, and an
  `AdapterMigrationPipeline`. The generic pipeline contains one adapter
  migration stage and delegates directly to the use case; Panda's separate
  multi-stage pipeline is a real domain and is not the same problem.
- Catalog composition is split between the built-in Node catalog, the browser
  catalog, the catalog core, and a browser entrypoint that renames the browser
  factory to `createBuiltinCodemodCatalog`.
- `CollectionToolkit` is a static bag of unrelated collection, parser,
  diagnostic, CLI, and budget functions even though the same functions are
  already exported directly from the collect subpath.
- `createNodeStudioWorkspace` only calls `createStudioWorkspace()` and has no
  Node-specific policy of its own.
- The backend registry exposes both `plugins` and `factories`, while the
  built-in module exports identical `STYLE_BACKEND_FACTORIES` and
  `STYLE_BACKEND_PLUGINS` collections.
- Source scanning has a registry, a scanner service, a classifier port, and
  free classifier functions. Some of these are separate policies; others may
  only be forwarding projections and need an actual consumer audit.
- `packages/codemod/src/swap/index.ts` re-exports a very broad collection of
  implementation, proof, adapter, and migration symbols. Some are deliberate
  subpath contracts; unused forwarding exports should not remain solely for
  convenience.

Related work:

- [048-codebase-simplification.md](048-codebase-simplification.md) established
  the ownership and dead-code standard.
- [059-product-surface-and-package-boundary.md](059-product-surface-and-package-boundary.md)
  owns the larger runtime/build/tooling package split.
- [061-static-runtime-and-framework-boundaries.md](061-static-runtime-and-framework-boundaries.md)
  owns semantic execution-lane contracts.
- [062-tooling-trust-and-agent-surfaces.md](062-tooling-trust-and-agent-surfaces.md)
  owns evidence and host-proof semantics.

## Goal

Reduce duplicate orchestration and compatibility-shaped surfaces until every
retained domain has one clear owner, one default composition, and one focused
substitution test, while preserving migration semantics, the frozen Pandwind
authoring API, and the flat `SwapIR` fast path.

The result should be easier to navigate because a caller can identify the one
use-case port for a policy instead of choosing between wrappers that all call
the same implementation.

## What

This plan covers five simplification slices:

1. Collapse the generic codemod migration stack around one application port and
   default implementation. Keep `runAdapterMigration` and its async form only
   as thin convenience functions over that port if consumer evidence still
   requires them. Remove the generic one-stage pipeline and executor aliases
   from the public surface when no real caller needs their extra shape.
2. Make codemod catalog composition environment-aware through one assembler
   and explicit injected host capabilities. Node module loading, filesystem
   reads, and browser Tailwind resolution remain separate ports; adapter lists
   and route registries must not be duplicated between profiles.
3. Remove analyzer and Studio forwarding facades whose behavior is identical
   to an existing named export. Replace `CollectionToolkit` consumers with
   direct cohesive subpath imports and remove the no-op Node workspace alias.
4. Remove duplicate registry projections where the distinction is not
   semantic, starting with backend factories/plugins. Audit source-scanner
   classifier projections and keep only the resolver/service split that has an
   independent lifecycle or substitution test.
5. Audit the codemod barrel and package exports against real repository
   consumers, tests, docs, and published-package smoke imports. Delete unused
   implementation re-exports directly because the project is pre-release;
   coordinate larger package moves with plan 059 rather than duplicating that
   work here.

This plan is an internal architecture cleanup. It does not add authoring APIs,
new runtime contracts, or a second migration engine.

## Why

The current structure makes correct extension harder than it needs to be.
Someone adding a migration policy must understand which of the executor, use
case, pipeline, global singleton, or direct function is authoritative. The
same problem appears in catalog and analyzer surfaces: a facade looks like a
domain object but only forwards a collection of unrelated functions.

These layers also make tests less meaningful. A test can substitute one wrapper
while another global bypasses it, or can validate a browser catalog while the
Node catalog quietly assembles a different adapter list. Removing the duplicate
paths improves correctness and reduces the number of places where future
features can accidentally diverge.

## How

### Conceptual model

```text
caller (CLI / Vite / playground / MCP)
                  |
          one migration use-case port
                  |
       default adapter-migration engine
          /       |        \
       catalog  scanner   lowering
        profile  port      registry

analyzer / studio callers
                  |
       cohesive named domain exports
                  |
       independently replaceable ports only
```

The rule is structural rather than cosmetic: a wrapper survives only when it
adds a policy, lifecycle, environment boundary, or independently substitutable
implementation.

### Operations / behavior

#### 1. Establish the canonical migration application boundary

Inventory every import of `runAdapterMigration*`,
`createAdapterMigrationExecutor`, `STYLE_MIGRATION_USE_CASE`, and
`ADAPTER_MIGRATION_PIPELINE`. Define the canonical contract and classify each
existing symbol as one of:

- the application port;
- the default engine implementation;
- a thin convenience function that may remain;
- a compatibility wrapper with no remaining consumer.

The recommended shape is one `StyleMigrationUseCase` port with synchronous
and asynchronous operations, one default engine composition, and one test that
substitutes the port. The flat `SwapIR` path stays independent and fast.

#### 2. Unify catalog profiles without importing Node into browser code

Make one catalog assembler accept explicit environment capabilities. The Node
and browser entrypoints may remain tiny composition roots, but they must select
the same adapter plugin and registry construction rather than maintaining
renamed factories or separate adapter collections. Add a substitution test for
a minimal environment profile and a parity test proving that profiles expose
the same adapter identities when given equivalent resolvers.

#### 3. Delete analyzer and Studio bags and aliases

Update the inspector to import the small functions it uses from
`pandwind-analyze/collect`. Delete `CollectionToolkit` and its facade test once
the package export audit confirms no deliberate external contract depends on
it. Delete `createNodeStudioWorkspace` after updating the Studio CLI; keep
`createStudioWorkspace` with its injectable watcher and workspace ports.

#### 4. Normalize duplicate registry views

For each registry, write down the semantic distinction between its collections
and lookup methods. Remove identical views and empty subtype aliases where no
consumer relies on the distinction. Start with backend factories/plugins, then
review source-scanner classifier methods and the global classifier functions.
Do not merge registries that own different lifecycles, such as style backends,
host adapters, lowering policies, validators, and source-language plugins.

#### 5. Reduce the codemod export surface from evidence

Generate a consumer inventory from workspace imports, package subpath smoke
tests, docs, and the package export map. Remove only exports with no verified
consumer or documented contract. Keep typed identifiers, semantic IR, adapter
contracts, and route/catalog entrypoints that are intentionally public. Add a
surface test so a new internal implementation export requires an explicit
owner/evidence entry.

#### 6. Record the ownership map and proof

Update the architecture guide with the final migration, catalog, analyzer,
backend, and scanner owners. Add one substitution test per retained
orchestration port and one negative test per removed compatibility path where a
stale import should fail at typecheck or package-surface validation.

### Tech choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Generic migration pipeline | Remove the one-stage generic wrapper after consumer audit | Panda already has a real multi-stage pipeline; the generic wrapper currently adds no policy |
| Migration convenience functions | Keep only as thin calls over the canonical use case when evidence requires them | Convenience is acceptable when it cannot bypass orchestration |
| Catalog environments | One assembler with injected loader/resolver capabilities | Browser and Node need different effects, not different adapter catalogs |
| Collection API | Direct cohesive exports by subpath | A static bag of unrelated functions is not a domain abstraction |
| Studio workspace | One workspace factory with injectable watcher | The current Node alias does not add behavior |
| Backend registry | One canonical factory collection and lookup view | Identical plugin/factory projections create naming drift |
| Export cleanup | Consumer/evidence-driven deletion | Pre-launch code has no reason to retain unreferenced compatibility aliases |
| Testing | Substitution tests at each retained port plus package-surface checks | Passing behavior tests alone cannot prove ownership is singular |

### Architecture

```text
Composition roots:
  CLI      -> create default migration use case + Node catalog profile
  Vite     -> same migration use case + host-provided project context
  Browser  -> same migration use case + browser catalog profile
  MCP      -> same use case + explicit validation ports

Domain ports:
  StyleMigrationUseCase
  CodemodCatalog / StyleAdapterRegistry
  SourceScannerService
  StyleLoweringRegistry
  Analyzer policies that have independent replacement needs

Concrete modules implement ports; callers do not select parallel wrappers.
```

## What this allows

- A new caller can adopt the canonical migration use case without learning
  several equivalent wrappers.
- Browser and Node catalog behavior can be compared from one adapter identity
  source and explicit environment capabilities.
- Analyzer consumers can import the operation they need without depending on a
  pseudo-namespace class.
- Removed aliases become visible through typecheck and package-surface tests
  instead of surviving as undocumented maintenance obligations.
- Future simplification can be evaluated by ownership and substitution tests,
  not by line count alone.

## What this does not allow

- It does not collapse genuinely different domains into one mega-registry.
- It does not remove the semantic IR, adapter-owned policy, lowering registry,
  validator registry, or flat `SwapIR` fast path.
- It does not make browser tooling execute Node filesystem or module-loader
  behavior.
- It does not preserve unverified pre-release aliases merely because they are
  convenient inside the repository.
- It does not change migration output semantics or silently broaden adapter
  capabilities.
- It does not reopen the package split and maturity work owned by plan 059.

## UI & UX

### Desktop

No product UI change is required. The CLI, Playground, Studio, and MCP should
continue to show the same migration and evidence results while their internal
call graph becomes singular. If a removed public export is referenced by a
tool, the failure should name the replacement subpath or use case during the
development check.

### Mobile

Not applicable. The plan changes internal and package-tooling structure only.

### Common interactions

| Action | Result |
|--------|--------|
| Run a codemod migration | The CLI and virtual plugin use the same canonical use-case port |
| Create a browser catalog | The browser profile injects browser-safe capabilities into the shared assembler |
| Import collection helpers | Consumers import the named helper from the collect subpath; no static toolkit namespace is required |
| Add a backend | The backend registry exposes one factory contract and one lookup collection |
| Add an internal export | The surface check requires an owner and consumer evidence |

## Data model

No new consumer-facing runtime data model is needed. The implementation uses
existing adapter, scanner, lowering, and analyzer contracts.

The audit may use a temporary repository-only record while executing the plan:

```ts
interface SimplificationCandidate {
	readonly symbol: string;
	readonly owner: string;
	readonly kind: "port" | "default" | "projection" | "alias" | "facade";
	readonly consumers: readonly string[];
	readonly action: "keep" | "merge" | "delete";
	readonly substitutionTest?: string;
}
```

This record is evidence for the cleanup, not a new package API.

## Implementation steps

1. Create the candidate inventory from source imports, package exports, docs,
   tests, and generated entrypoints. Mark each candidate keep, merge, or
   delete before changing code.
2. Add the canonical migration-use-case substitution test and migrate CLI,
   unplugin, playground, and matrix callers to it.
3. Remove the generic one-stage migration pipeline and executor/use-case
   forwarding layers that have no independent consumer. Keep thin convenience
   calls only when the inventory proves they are useful.
4. Consolidate Node/browser catalog assembly behind one environment-aware
   composition boundary. Add adapter identity parity and browser-safety tests.
5. Delete `CollectionToolkit` and update inspector imports. Delete the no-op
   `createNodeStudioWorkspace` alias and update the Studio CLI and tests.
6. Simplify the backend registry's duplicate collections and audit the source
   scanner classifier/service projections. Preserve any surface with an
   independent lifecycle and add a substitution test for it.
7. Audit `packages/codemod/src/swap/index.ts` and package exports. Remove only
   unconsumed internal re-exports and add an explicit surface ownership check.
8. Update architecture documentation and relevant package READMEs. Record
   removed names and their replacements so stale internal imports fail clearly.
9. Run focused tests after each slice, then full codemod/analyze/playground
   suites, typechecks, builds, docs checks, Knip, package export smoke tests,
   and `git diff --check`.
10. Split every slice into its own JJ revision. The working copy must retain
    unrelated user changes without absorbing them into cleanup revisions.

## Open questions

1. Should `runAdapterMigration*` remain as documented thin convenience calls,
   or should all codemod callers use `STYLE_MIGRATION_USE_CASE` directly?
2. Does any external consumer rely on the generic pipeline schema, or can it be
   removed before the first release as an unneeded compatibility shape?
3. Should the shared catalog assembler receive a single environment object, or
   should the existing module-loader and Tailwind-resolver ports remain
   separate for clearer dependency ownership?
4. Which codemod `swap` exports are deliberate package contracts versus
   repository-only test/proof helpers?
5. Does the source scanner need a public classifier port at all once its
   service exposes the same behavior, or does a non-parser consumer use it
   independently?

## Acceptance criteria

- [ ] One canonical generic migration orchestration port and one default
      implementation remain; no generic one-stage pipeline bypasses it.
- [ ] CLI, unplugin, Playground, MCP, and matrix callers use the same
      migration composition boundary.
- [ ] Node and browser catalogs share adapter identity composition and differ
      only through explicit injected environment capabilities.
- [ ] `CollectionToolkit` and the no-op Studio workspace alias are removed or
      have a documented, evidence-backed reason to remain.
- [ ] Backend registry duplicate projections are removed; source-scanner
      projections are either consolidated or justified by independent policy
      and substitution tests.
- [ ] Every retained orchestration port has one default implementation and at
      least one focused substitution test.
- [ ] The codemod export surface contains no unowned, unconsumed forwarding
      symbols; package smoke imports cover intentional public subpaths.
- [ ] The architecture guide records the final ownership map and the removed
      compatibility paths.
- [ ] Focused tests, full codemod/analyze/playground tests, typechecks, builds,
      docs checks, Knip, package export checks, and formatting pass.
- [ ] Each implementation slice is recorded in a focused JJ revision, and
      unrelated working-copy changes remain untouched.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-08 | Start with orchestration, catalog, facade, registry, and export duplication | These are concrete duplicate paths remaining after the first simplification wave |
| 2026-09-08 | Preserve the flat `SwapIR` fast path and distinct domain registries | The architecture policy treats them as intentional replaceable boundaries, not accidental wrappers |
| 2026-09-08 | Require consumer evidence before deleting package exports | Pre-release cleanup allows deletion, but undocumented assumptions still need to be surfaced by tests |
