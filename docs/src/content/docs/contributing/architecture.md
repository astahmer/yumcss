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

| Domain                  | Port boundary                                                                                                                                | Default implementation                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite CSS extraction     | scanner, classifier, extractor, provenance, diagnostic, and rewriter ports                                                                   | `vite/css-extract.ts`, `vite/css-extraction-contracts.ts`                                                                                                                          |
| Tailwind codegen        | theme loader, design-system loader, utility catalog, conflict analyzer, variant probe, type emitter, runtime emitter, writer                 | `tw/codegen-theme-input.ts`, `tw/codegen-catalog.ts`, `tw/codegen-conflicts.ts`, `tw/codegen-variants.ts`, `tw/codegen-emitter.ts`, `tw/codegen-writer.ts`, `tw/generate-types.ts` |
| Runtime CSS             | canonicalizer, ordering, serializer, store, sink                                                                                             | `css/runtime-sheet-contracts.ts`, `css/runtime-sheet-policies.ts`, `css/runtime-sheet-serializer.ts`, `css/runtime-sheet-sink.ts`                                                  |
| Stylesheet lowering     | condition, ordering, decoder, serializer, and variable compiler policies                                                                     | `css/stylesheet-policies.ts`, `css/stylesheet-lowering.ts`                                                                                                                         |
| Token formats           | one normalized token set plus format adapters                                                                                                | `codemod/swap/token-set.ts`, `codemod/swap/token-format-contracts.ts`                                                                                                              |
| `cx()` compilation      | constant discovery, expression evaluation, imported merges, fold policy, and code emission                                                   | `vite/cx-static-evaluator.ts`, `vite/cx-import-scanner.ts`, `vite/cx-call-rewriter.ts`                                                                                             |
| Design vocabulary       | module adapter registry                                                                                                                      | `design/resolve.ts`                                                                                                                                                                |
| Analyze/reporting       | source analysis, residual policy, candidate scanning, artifact compilation, budget metrics, artifact inspection, workspace, and report ports | `analyze/analysis-service.ts`, `analyze/css-residual-collector.ts`, `analyze/css-budget-*.ts`, `analyze/css-artifact-inspection.ts`, `analyze/analysis-report.ts`                  |
| Utility bridge          | Tailwind compilation, selector filtering, value resolution, and bridge emission                                                              | `tw/bridge.ts`, `tw/bridge-generator.ts`                                                                                                                                           |
| Real repository proof   | pinned reference materialization, source migration lanes, SSR/browser checks, route failures, and CSS-size accounting                        | `scripts/migrate-chakra-docs.ts`, `scripts/verify-chakra-docs.ts`, `examples/chakra-ui-docs-migration/README.md`                                                                   |
| Panda project migration | discovery, theme loading, source scanning, usage extraction, semantic parsing, factory scanning, and final validation services               | `codemod/swap/adapters/panda/pipeline-services.ts`, `codemod/swap/adapters/panda/migration-pipeline.ts`                                                                            |

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

Source discovery has one filesystem port as well. `SourceWorkspace` resolves
paths and reads documents without interpreting their language; `SourceScanner`
selects a registered language adapter and owns parsing/exclusion ranges.
Codemod, Vite, analyzer, Panda discovery, and Tailwind collection use these
boundaries instead of maintaining independent recursive walks or extension
tables. A scanner plugin can add a language without changing those consumers.

The codemod registry is guarded by `AdapterContractSuite`, which probes every
registered adapter through detection/configuration, parsing, emission, and
validation. Host-only adapters may intentionally have no removable source
module. Backend registries use the same contract shape, with enum-backed
built-in identities and branded third-party identities. These contract suites
are architectural tests: they do not replace adapter-owned semantic fixtures,
browser differential tests, or real-repository acceptance corpora.

Panda's project migration is composed through `PandaMigrationServices`. The
default service set delegates to the Panda family implementation, while the
pipeline only coordinates stage inputs and outputs. Discovery, theme loading,
language scanning, usage extraction, call parsing, factory scanning, and final
validation can therefore be replaced independently. The pipeline contract test
substitutes discovery and parsing services without changing the orchestration;
this is the minimum proof required before calling a staged decomposition real.

## Real repository migration proof

The Chakra UI docs corpus is a maintained acceptance fixture for the pivot
claim. The external checkout is pinned by Git commit in `reference-repos.md`,
while Pandwind owns the lane runner and its JJ history. The runner routes the
same Chakra source adapter through independent `css-class` and `design-css`
target lanes. Each lane must produce a buildable Next application with zero
skipped call sites and zero residuals.

Proof has three layers: the Next production build must generate all 277 routes;
the route checker must find no failures across the 261 user-facing static HTML
routes; and the browser check must compare representative geometry, computed
styles, screenshots, and console errors at the same viewport. CSS accounting
compares linked stylesheets plus inline SSR styles against the baseline, with
the Pandwind runtime artifact reported separately. This keeps a migration from
being called complete merely because the codemod changed every source file.

The styled-components documentation site is a second acceptance corpus. Its
reference checkout is pinned in `reference-repos.md` and is never edited. The
`StyledComponentsDocsMigration` façade registers two target lanes,
`runtime-css` and `design-css`; both use the same source adapter and differ
only in the Pandwind target factory. The lane adapter owns styled-components
template/object parsing, subjects, `.attrs`, globals, keyframes, and framework
rewrites; the runner owns only source-file discovery, materialization, and
evidence accounting.

The reproducible command is:

```sh
pnpm exec tsx scripts/migrate-styled-components-docs.ts runtime-css /tmp/pandwind-styled-runtime
pnpm exec tsx scripts/migrate-styled-components-docs.ts design-css /tmp/pandwind-styled-design
pnpm exec tsx scripts/verify-styled-components-docs.mjs \
  http://localhost:3100 http://localhost:3263 http://localhost:3264 \
  /tmp/styled-baseline /tmp/styled-components-docs-verification.json
```

The pinned corpus currently converts 54 source files and 285 call sites with
zero skipped sites and zero codemod residuals in each lane. A complete site
claim still requires the disposable app's direct Next production build, the
full public-route status/SSR matrix, and browser geometry/computed-style
checks against the unmodified reference. External services used by the
reference app, such as GitHub's releases API, are treated as fixture inputs;
rate limits are infrastructure failures, not evidence of a successful
migration. The latest proof completed both production builds, all 55 public
routes (31 HTML routes), with zero HTTP/rendering failures, zero browser page
errors, successful hydration probes, and screenshot-equivalent geometry and
computed styles for every HTML route in both lanes. The stable browser state is
`prefers-reduced-motion: reduce`; the reference homepage's requestAnimationFrame
cube is held at its SSR pose so the comparison is repeatable without masking
content. Reference styled-components style nodes are moved to `head` in the
browser comparator with their CSS preserved, preventing invalid style-node
placement from changing structural pseudo-class behavior. Screenshot parity
allows at most 100 changed pixels, 0.01% of the viewport, and an 8-channel
rasterization delta; the prior 682-pixel/186-channel table mismatch therefore
fails. Measured total transfer was 621,075 bytes for runtime CSS and 621,134
bytes for design CSS versus 1,318,699 bytes for the baseline (reductions of
697,624 and 697,565 bytes). The lane also migrates styled-theming's runtime
theme functions through a generated client-only `ThemeProvider`/context module,
so theme-dependent padding, margins, colors, and variants remain exact after
hydration rather than becoming residuals.
