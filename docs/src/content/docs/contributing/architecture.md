---
title: Architecture
description: Interface-first boundaries for Pandwind's compilers and tooling.
---

## Core rule

Pandwind is a pivot layer. A domain that has multiple ecosystems, hosts,
formats, policies, or lifecycle stages is represented by a port and a registry
or factory. Composition roots assemble the default implementations; domain
code depends on the port.

Adding an adapter should normally mean:

1. implement the interface;
2. register it in the domain registry;
3. add contract fixtures;
4. avoid edits to central migration branches.

The façade is not the architecture by itself. A domain is only decomposed when
the policy implementation is behind the port and a test can substitute a
minimal implementation without changing orchestration.

## Boundaries

| Domain                | Port boundary                                                                                                                                | Default implementation                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite CSS extraction   | scanner, classifier, extractor, provenance, diagnostic, and rewriter ports                                                                   | `vite/css-extract.ts`, `vite/css-extraction-contracts.ts`                                                                                                                          |
| Tailwind codegen      | theme loader, design-system loader, utility catalog, conflict analyzer, variant probe, type emitter, runtime emitter, writer                 | `tw/codegen-theme-input.ts`, `tw/codegen-catalog.ts`, `tw/codegen-conflicts.ts`, `tw/codegen-variants.ts`, `tw/codegen-emitter.ts`, `tw/codegen-writer.ts`, `tw/generate-types.ts` |
| Runtime CSS           | canonicalizer, ordering, serializer, store, sink                                                                                             | `css/runtime-sheet-contracts.ts`, `css/runtime-sheet-policies.ts`, `css/runtime-sheet-serializer.ts`, `css/runtime-sheet-sink.ts`                                                  |
| Stylesheet lowering   | condition, ordering, decoder, serializer, and variable compiler policies                                                                     | `css/stylesheet-policies.ts`, `css/stylesheet-lowering.ts`                                                                                                                         |
| Token formats         | one normalized token set plus format adapters                                                                                                | `codemod/swap/token-set.ts`, `codemod/swap/token-format-contracts.ts`                                                                                                              |
| Source documents      | language scanner registry plus Node workspace expansion/read/scan                                                                            | `source-scanner.ts`, `source-workspace.ts`                                                                                                                                         |
| `cx()` compilation    | constant discovery, expression evaluation, imported merges, fold policy, and code emission                                                   | `vite/cx-static-evaluator.ts`, `vite/cx-import-scanner.ts`, `vite/cx-call-rewriter.ts`                                                                                             |
| Design vocabulary     | module adapter registry                                                                                                                      | `design/resolve.ts`                                                                                                                                                                |
| Analyze/reporting     | source analysis, residual policy, candidate scanning, artifact compilation, budget metrics, artifact inspection, workspace, and report ports | `analyze/analysis-service.ts`, `analyze/css-residual-collector.ts`, `analyze/css-budget-*.ts`, `analyze/css-artifact-inspection.ts`, `analyze/analysis-report.ts`                  |
| Utility bridge        | Tailwind compilation, selector filtering, value resolution, and bridge emission                                                              | `tw/bridge.ts`, `tw/bridge-generator.ts`                                                                                                                                           |
| Real repository proof | pinned reference materialization, source migration lanes, SSR/browser checks, route failures, and CSS-size accounting                        | `scripts/migrate-chakra-docs.ts`, `scripts/verify-chakra-docs.ts`, `examples/chakra-ui-docs-migration/README.md`                                                                   |

Generated-project metadata is a versioned artifact, `pandwind.interop.json`.
Tailwind codegen writes its utility/type/variant/conflict/theme view there, and
bridge generation refreshes the bridge section from the compiled design
system. Migration tooling consumes that artifact when present and only falls
back to parsing `types.d.ts`/`tw.ts` for projects generated before the artifact
was introduced. The artifact is the project-context boundary; it must never
contain assumptions about the example application.

`pandwind.agents.json` points to this artifact in `generatedFrom` so automated
tooling can discover the same context without guessing which generated files
exist.

The flat `SwapIR` is deliberately retained as the cheap path. Rich migrations
use the versioned semantic `StyleProgram`; neither path is allowed to know a
pair-specific `XToY` implementation.

`StyleProgram.sourceMap` is the provenance projection for a semantic program:
it aggregates the program, rule, theme/composition, and dynamic-value source
locations without forcing legacy `SwapIR` callers to pay for rich nodes.
Recipe and component semantics live in the separate versioned recipe IR and
host adapter contracts; they are not represented as unstructured residual
strings.

## Locality and exports

Concrete ecosystem policy belongs in its adapter module. CLI files only parse
arguments, assemble registries/providers, and render reports. Generic AST,
filesystem, CSS, and serialization mechanics belong in infrastructure ports.

Built-in registry identities are enum-backed. Codemod adapter/source/target
ids, pattern ids, plugin ids, token-format ids, validator/lowering ids, and
pipeline stage ids are defined once in the owning identity module and reused
at every composition boundary. Shared orchestration must not compare raw
ecosystem strings such as `adapter === "stylex"`; adapters normalize those
differences into neutral IR metadata or registry-selected ports. Third-party
ids remain extensible through branded plugin identifiers. Authored CSS values,
property names, package specifiers in emitted source, and IR discriminants are
data rather than registry identities and remain strings where that is the
appropriate type.

Prefer one cohesive façade, registry, or class over a module that exports a
collection of unrelated operations. Export a primitive only when it is an
independent contract or a narrow public entry point. Knip is the required
check for unused exports; dynamic/public entry points must be documented when
they cannot be inferred statically.

## Definition of done

An architecture refactor is complete only when the domain has:

- a named interface for every independently replaceable policy;
- an injectable default implementation and composition root;
- a substitution/contract test using a minimal alternative implementation;
- no ecosystem-specific branch in the caller that should depend on the port;
- focused JJ revisions and behavior-preserving validation;
- updated documentation when the boundary or public contract changes.

## Current implementation map

The CSS extraction façade is `createCssExtractionService`; scanner-only callers
use `createCssSourceScanner`. The shared `CssSourceService` delegates to that
same façade rather than maintaining a second extraction pipeline. Its scanner
and artifact policies are shared by the Vite path, unplugin path, and analyze
package. There is no parallel bag of extraction functions.

The Tailwind generator is a composition root: loading token/theme input,
loading the Tailwind design system, cataloging utilities, probing
conflicts/variants, emitting source, and writing artifacts are separate policy
modules. `createDesignSystemCodegen` accepts substitutions for every policy;
`generateDesignSystem` is only the default convenience façade.

CSS budget analysis follows the same rule. `CssBudgetEvaluator` composes source
candidate scanning, artifact compilation, and metrics; `TailwindCssArtifactInspection`
composes those same ports for class drill-down and stylesheet shape. The CLI
and studio use `createCssBudgetService`, whose substitution test covers both
budget and inspection paths. Runtime sheets and stylesheet lowering likewise
accept replacement ports for storage, ordering, canonicalization,
serialization, conditions, decoding, and sinks.

Token conversion uses `TokenSetCodec` over a registered normalized set. Each
format lives in its own adapter file (`dtcg`, `theme`, `panda`, `preset`, `sd`,
`figma`, `rootcss`, and `stylex`). The `cx()` façade delegates to explicit
constant, import, evaluation, fold, and rewrite policies. Analyzer/reporting
and design vocabulary use the same port/registry pattern. New policies must
include a minimal substitution test before they are wired into a composition
root.

The codemod registry exposes a derived `capabilityMatrix()` view containing
each adapter's contract version, source modules, dependencies, and declared
capabilities. `createAdapterContractSuite()` is the reusable conformance
runner: it requires a representative parse fixture for every registered
adapter and fails when a fixture exercises a capability the adapter declares
unsupported. A minimal injected registry is tested through the same runner,
so adding an adapter does not require changing migration orchestration.

Semantic lowering is versioned with `StyleProgram /4`. Dynamic declarations
retain expression kind, source range, dependency names, and explicit
static-evaluation evidence. The lowering registry handles resolved theme
bindings, custom-property fallback, composition flattening, plugin transforms,
runtime context, and framework metadata. A target adapter receives an optional
semantic observation on `AdapterEmitResult` when an opaque runtime registration
cannot safely be reparsed; validators compare that observation rather than
pretending the emitted call is a static class.

Runtime fallback is a deliberate second lane. Static extraction is attempted
first; only unresolved dynamic expressions retain the smallest target runtime
dependency closure. Static styled declarations remove the source runtime and
dynamic declarations use `css.vars`/runtime carriers with structured residual
and dependency evidence. Contract fixtures assert both directions.

The shared source boundary has two layers: `pandwind/source` owns language and
framework scanning, runtime boundaries (`shared`, `client`, `server`), and
parser selection; `pandwind/source/workspace` owns Node filesystem expansion,
reading, and document materialization. Codemod, analyzer, Panda discovery, and
build tooling consume these services instead of maintaining separate script
extension/glob policies. Vue SFC, Svelte, Astro, Solid, MDX, JSX dialects, and
RSC boundaries are covered by scanner and host contract suites.

Validation is also a composition boundary. Adapter, validator, scanner, host,
and differential contract suites accept minimal substitute registries. The
differential runner checks canonical CSS, independent runtime-sheet output,
browser states, SSR/hydration, streaming chunks, dependencies, and residuals.
The `AdapterCoverageGate` consumes evidence from those independent runners and
reports contract, real-repository, browser, and capability coverage per
adapter. `pnpm pivot:proof` composes that gate with the checked-in promotion
matrix; the scheduled full-proof workflow supplies the pinned repository
evidence without importing upstream source into the workspace.
The pinned real-repository report adds a typed promotion object with explicit
`source-static`, `source-mismatch`, `runtime-pending`, and `pipeline-unpaired`
states. A pending dimension is never counted as a passing real-repository
promotion.

## Real repository migration proof

The Chakra UI docs corpus is a maintained acceptance fixture for the pivot
claim, alongside pinned source references for every registered external
adapter. External checkouts are pinned by Git commit in `reference-repos.md`,
while Pandwind owns the lane runners and their JJ history. The runner routes
the same source adapter through independent target lanes. Each full docs lane
must produce a buildable Next application with zero skipped call sites and
zero residuals.

Proof has three layers: the Next production build must generate all 277 routes;
the route checker must find no failures across the 261 user-facing static HTML
routes; and the browser check must compare representative geometry, computed
styles, screenshots, and console errors at the same viewport. CSS accounting
compares linked stylesheets plus inline SSR styles against the baseline, with
the Pandwind runtime artifact reported separately. This keeps a migration from
being called complete merely because the codemod changed every source file.

The source-reference report at
`plans/evidence/real-repository-migrations-v2.json` is deliberately stricter
about what it proves. Its `promotion` object reports canonical CSS,
browser-state, SSR/hydration, streaming, dependency, and CSS-size dimensions
separately. Source-static entries are useful adapter evidence, but pending
dimensions keep them out of full promotion until a repository-specific build
runner executes them.
