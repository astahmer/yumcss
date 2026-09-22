# Plan 062: make the playground, MCP, and diagnostics trustworthy

**Status: COMPLETE for the declared tooling boundary (2026-09-22).** Sandbox,
real package-fixture, MCP evidence labels, typed validation/resource ports, and
visible diagnostic boundaries are shipped. A browser host remains explicitly
unavailable in the checked-in fixture lane.

## Goal

Make Pandwind's tooling tell users exactly what it proved. The playground,
MCP, DevTools, Studio, and migration reports should reuse the real package
pipelines where users expect production behavior, clearly label browser-only or
in-process approximations, and preserve enough provenance for an agent or
engineer to reproduce a result.

This plan addresses the criticism that the tooling can look more complete than
the underlying proof. A sandbox result, an in-process migration benchmark, and
an MCP report with unavailable host checks are useful, but they must not be
presented as equivalent to a real project build, browser run, or SSR check.

## Context

The current tooling has several strong foundations:

- the playground can evaluate examples quickly in a browser sandbox;
- migration routes and reports are available through the MCP;
- built-in migration contracts and canonical checks can run locally;
- host validation ports exist for checks that require a project environment;
- generated declarations and artifacts can be inspected.

The trust gap comes from the boundaries: the playground intentionally shims
imports and does not run every project loader, while MCP validation and
benchmarking depend on host-injected ports for typecheck/build/SSR/browser and
real build measurements. The UI and report must surface those facts instead of
compressing them into a generic green result.

## Scope

- Split playground execution into a fast sandbox lane and a real package/Vite
  fixture lane, with explicit labels and separate result types.
- Tie Monaco declarations, generated bridge data, and example presets to the
  workspace package and expose stale-artifact errors clearly.
- Make MCP validation results distinguish passed, failed, unavailable, skipped,
  and not-applicable checks, with provenance and host configuration.
- Define a named host validation port for typecheck, build, canonical CSS,
  SSR, hydration, browser, and bundle checks without permitting arbitrary shell
  execution through the MCP.
- Make MCP benchmarking reproducible and honest about its scope; add real host
  benchmark support only where it can be implemented with the same explicit
  port model.
- Add evidence resources for adapter catalogs, capability matrices, reports,
  generated artifacts, residual explanations, and StyleProgram/SwapIR views.
- Document the maturity and proof level of DevTools and Studio features.

## Non-goals

- Turning the playground into a general-purpose arbitrary-code execution host.
- Allowing an MCP caller to execute unreviewed shell commands or access files
  outside the project root.
- Claiming that a browser sandbox proves a framework's build, SSR, or hydration
  behavior.
- Adding a second migration engine to the playground or MCP.
- Making every benchmark a production-performance promise.

## Proposed shape

```text
                         evidence + provenance
                                  ^
 sandbox evaluator ----\          |          /---- MCP resources
                         -> tooling use case <-
 real package fixture --/          |          \---- validation report
                                  |
                         explicit host ports
```

Every result carries:

- execution lane (`sandbox`, `package-fixture`, `host-project`, or
  `in-process`);
- the package/artifact/config revision used;
- checks that actually ran and their status;
- unavailable checks and the host capability required to run them;
- source maps or provenance links back to the expression, route, artifact, or
  generated CSS involved.

## Architecture

Keep the existing composition-root rule: UI and MCP handlers orchestrate
existing use cases and ports; they do not parse adapter syntax or invent a
second lowering pipeline.

Define or consolidate these ports:

- `PlaygroundExecutionPort`: evaluates a scenario in a named lane and returns
  source, output, IR, CSS, diagnostics, and provenance.
- `ArtifactFreshnessPort`: checks that generated declarations, bridge data,
  presets, and interop artifacts correspond to the workspace package revision.
- `McpValidationPort`: runs a declared validation kind against a project root
  using an explicit host implementation and bounded configuration.
- `McpBenchmarkPort`: measures a declared benchmark profile and returns the
  inputs, warm/cold mode, timings, memory, output sizes, and limitations.
- `EvidenceResourceCatalog`: exposes typed, versioned report resources rather
  than arbitrary filesystem reads.

The built-in defaults remain read-only and deterministic. A host may provide
real project validation through the port, but the MCP schema must never accept
an arbitrary command string as a shortcut.

## Implementation steps

1. Inventory every playground panel and MCP tool result. Mark whether it is a
   sandbox evaluation, a real package fixture, an in-process report, or a host
   proof. Remove ambiguous “success” wording.
2. Define the execution-lane and check-status types with stable identity tags,
   serialization formats, timestamps, artifact/config fingerprints, and
   evidence links.
3. Extract the playground evaluator behind `PlaygroundExecutionPort`. Keep the
   fast browser sandbox, then add a small real package/Vite fixture for the
   representative paths where users need build-level confidence.
4. Add freshness checks for generated editor declarations, bridge files, theme
   artifacts, and example presets. Make stale data a visible diagnostic with a
   precise regeneration command.
5. Update the playground UI to show lane, checks, CSS, StyleProgram/IR, token
   mapping, residuals, and source locations in independently inspectable panes.
   A raw JSON fallback remains available for every structured view.
6. Refine MCP `validate_migration` around `McpValidationPort`. Return a result
   for every requested check, including `unavailable` with the required host
   capability and configuration, instead of treating absence as a pass.
7. Refine `benchmark_project` around `McpBenchmarkPort`. Keep the in-process
   benchmark honest, add cold/warm and output-size fields, and only add real
   build/bundle measurements when a host implementation supplies them.
8. Add typed MCP resources for adapter/capability catalogs, migration reports,
   residual explanations, generated interop artifacts, and IR snapshots. Scope
   all filesystem-backed resources to the project root.
9. Add end-to-end tests for the MCP HTTP transport and playground result model,
   including malformed input, missing host capabilities, stale artifacts,
   unavailable checks, and a successful real-fixture run.
10. Document maturity levels for Playground, Studio, DevTools, and MCP. Keep
    the docs synchronized with the evidence catalog and make claims only from
    proof records.

## Tests and evidence

- Unit tests for each port with fake implementations proving the use cases do
  not know concrete hosts or browser APIs.
- Playground tests that assert sandbox and fixture lanes have different result
  identities and labels.
- Freshness tests for matching and stale generated artifacts.
- MCP contract tests for `passed`, `failed`, `unavailable`, `skipped`, and
  `not-applicable` checks.
- HTTP transport tests for schema validation, project-root restrictions,
  bounded resources, and structured errors.
- Representative real-project fixture tests for typecheck/build and SSR or
  browser where the repository can provide those environments.
- Benchmark repeatability tests that record cold/warm mode and scope.
- Evidence snapshot tests that prevent docs or UI from claiming a check that
  the report did not run.

## Acceptance criteria

- Every visible green result identifies the lane and checks that actually ran.
- Sandbox success never implies a real build, SSR, hydration, or browser pass.
- MCP validation reports unavailable host checks explicitly and never turns
  missing capabilities into success.
- MCP benchmarking states whether it measured in-process migration or a real
  project build and includes reproducibility inputs.
- The playground can inspect output CSS, StyleProgram/IR, token mappings,
  residuals, and raw JSON without hiding failures behind a collapsed panel.
- Generated declarations/artifacts report staleness with a usable repair path.
- MCP resources are typed, versioned, project-root scoped, and provenance-rich.
- No arbitrary shell execution is introduced through the MCP.

## Risks and trade-offs

- Adding a real fixture lane makes the playground slower for selected examples;
  keeping it opt-in or clearly separate preserves fast iteration.
- More honest unavailable states may make existing dashboards look less green.
  That is a product improvement because it distinguishes evidence from absence.
- Browser and host fixtures increase maintenance cost. They should cover stable
  representative routes rather than every adapter matrix entry.

## Completion evidence — 2026-09-22

- The playground has separate `sandbox` and `package-fixture` execution
  identities, with evidence checks and unavailable checks carried as data.
- `apps/playground/fixtures/package-fixture` is a real workspace package that
  imports `pandwind/css` and `@pandwind/example-preset` through package names,
  resolves the Vite CSS plugin, and passes TypeScript, client Vite, SSR Vite,
  and real Chromium checks. The SSR-rendered HTML is served with the production
  client bundle; Chromium verifies emitted CSS and clicks a React control after
  hydration without console or page errors.
- The browser sandbox remains the fast teaching/evaluation lane; the fixture
  lane is the slower build-level confidence lane. Neither lane is an arbitrary
  code-execution host.

This closes the plan's representative real-fixture requirement, including the
browser and hydration dimensions for this bounded React/Vite fixture.

## Decisions log

- **2026-09-07** — Treat “what ran” and “what was not possible” as first-class
  result data across the playground, MCP, and reports.
- **2026-09-07** — Keep sandbox and in-process tooling, but label their proof
  boundaries instead of replacing them with misleading full-project claims.
