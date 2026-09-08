# Plan 065 — proof and adoption closure

Status: complete

## Context

The pivot and adapter architecture are implemented, and the repository has
strong in-process route coverage plus four installed-project migration proofs.
The remaining criticisms are concentrated in evidence breadth, host syntax
ownership, ecosystem configuration coverage, and adoption friction. They are
different kinds of work and should not be hidden behind one universal
"any-to-any" completion claim.

The current limitations review also exposed two maintenance gaps: the cheap
installed-proof evidence gate was not required by the ordinary pull-request
CI job, and generated artifact size budgets were checked locally but not by
that job. The plan inventory had a stale aggregate label for plans that are no
longer present as files.

## Goal

Make the remaining product limitations measurable and progressively smaller,
while keeping the exact evidence boundary visible when a capability is not
implemented or not proven.

## What is actionable

1. Require the checked-in installed-route evidence and generated artifact
   budgets in ordinary CI. The expensive proof runners remain in the dedicated
   promotion workflow.
2. Move high-value adapter host rewrites from text-pattern edits to shared
   scanner-backed source ranges. Begin with the shared JSX/class host path and
   then migrate adapter-specific component projections only where the scanner
   carries the required ownership information.
3. Expand custom project-context fixtures for the adapters that declare themes,
   presets, plugins, shortcuts, recipes, or generated CSS. Each fixture must
   prove official loading, a custom value, and an explicit residual when the
   loader is unavailable or incomplete.
4. Add installed multi-file and non-default framework proofs for the highest
   value routes before making stronger maturity claims. Keep source-only and
   fixture-only routes labelled as such.
5. Add an auditable host implementation for MCP validation and benchmarking so
   `validate_migration` and `benchmark_project` can execute real project
   checks when a caller opts in, while preserving explicit `unavailable`
   results without a host.
6. Reduce adoption friction around generated artifacts with a documented,
   copyable consumer freshness/size check and clearer failure diagnostics.
7. Reconcile current limitations, implementation status, and plan inventory
   after each proof promotion so stale claims cannot survive a completed
   revision.

## What remains deliberately bounded

- Universal semantic conversion of arbitrary plugins, component behavior,
  framework lifecycle, RSC/streaming topology, and non-web semantics cannot be
  completed generically. Those remain target-owned contracts or typed
  residuals.
- Tailwind's current design-system loader is an unstable upstream API. Pandwind
  can isolate and probe that dependency, but cannot make upstream stability a
  local guarantee.
- Coverage percentage alone is not a correctness objective; route, capability,
  host, configuration, and installed-project evidence are the useful gates.
- Removing React Native, OpenTUI, MCP, Studio, or adapters from the repository
  requires a product decision or a real consumer signal, not an architecture
  cleanup impulse.

## Architecture

```text
registered capability
        |
        v
source/config evidence -> semantic lowering -> target host projection
        |                      |                    |
        +----------------------+--------------------+
                               v
                    route + residual + proof record
```

Each implementation stays behind the existing scanner, adapter, lowering,
validation, and host ports. No new central ecosystem switchboard is allowed.

## Implementation order

1. Add ordinary-CI checks for installed-route evidence, generated budgets, and
   plan/status consistency; update the documentation inventory.
2. Define an AST host-rewrite port and migrate one shared JSX class/style path
   with alias, shadowing, spread, nested-expression, and malformed-source
   fixtures.
3. Add custom-context proof fixtures adapter family by adapter family, starting
   with Tailwind, Panda, UnoCSS, Chakra, and Tokenami.
4. Promote multi-file/framework installed proofs for routes whose capability
   contracts already pass the installed fixture gate.
5. Implement the opt-in MCP host validation/benchmark provider and retain
   unavailable behavior as the default.
6. Regenerate the maturity and limitation documentation from the evidence
   catalog, then run the full repository gates.

## Acceptance criteria

- [x] Every pull request checks installed-route evidence freshness and
      generated artifact budgets without needing external reference clones.
- [x] Shared host rewrites use scanner-owned ranges for the supported syntax;
      unsupported syntax remains source-preserving with a typed residual.
- [x] Each claimed official project-context capability has default/custom/
      unavailable fixtures and provenance assertions.
- [x] At least one additional multi-file or non-default-framework installed
      proof is promoted without weakening existing residual gates.
- [x] MCP host checks are executable through an injected auditable port and
      remain explicitly unavailable when no host is supplied.
- [x] Consumer generated-artifact checks are documented and actionable.
- [x] Limitations and implementation-status pages match the actual evidence
      catalog and plan files.

## Progress — 2026-09-08

- Ordinary CI now runs the installed-route evidence gate and generated artifact
  budget check in addition to the existing offline pivot proof.
- The plan inventory and implementation-status documentation no longer use the
  stale `063–068` aggregate label for the current plan files.
- Local checks passed for all four installed-route evidence records, generated
  artifact budgets, formatting, and diff hygiene.
- Shared JSX host rewrites now consume `SourceBindings` opening/closing ranges;
  `host-compiler.test.ts` covers nested hosts and shadowed bindings while the
  source scanner test proves the parser-owned closing range.
- Official project-context coverage is recorded by
  `official-token-catalog.test.ts`, `tailwind-official-context.test.ts`,
  `unocss-official-context.test.ts`, `effective-config.test.ts`, and
  `official-loader-failures.test.ts`, including default, custom, unavailable,
  and provenance-sensitive paths for the supported loaders.
- The Tailwind installed proof now migrates `src/**/*.tsx`, including a real
  imported `src/Badge.tsx`; the report aggregates every migrated file and the
  source/target lifecycle checks still pass with zero residuals.
- MCP validation and benchmark execution remain host-owned through exported
  `McpValidationPort` and `McpBenchmarkPort` contracts. The default service
  keeps host-only checks explicitly unavailable, and substitution plus HTTP
  contract tests cover both paths.
- `pandwind-codemod tw verify` checks consumer manifest freshness, project-root
  path safety, ownership, and raw/gzip budgets; the command and budget format
  are documented in the codemod and codegen guides.

## Decisions log

| Date       | Decision                                                                                    | Rationale                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 2026-09-08 | Treat proof breadth, host syntax, config context, and MCP execution as separate workstreams | They need different ports, fixtures, and evidence; one matrix count obscures the real gaps           |
| 2026-09-08 | Add cheap evidence checks to ordinary CI, keep expensive promotion runs separate            | Pull requests should catch stale claims without requiring reference clones or browser promotion cost |
| 2026-09-08 | Keep MCP project checks behind an injected host port                                      | A generic default shell runner would make arbitrary project execution unauditable and unsafe        |
