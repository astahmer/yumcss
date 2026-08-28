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

| Domain              | Port boundary                                                                   | Default implementation                                                       |
| ------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Vite CSS extraction | scanner, classifier, extractor, provenance, diagnostic, and rewriter ports      | `vite/css-extraction-pipeline.ts`                                            |
| Tailwind codegen    | theme loader, utility catalog, conflict analyzer, type emitter, runtime emitter | `tw/codegen-pipeline.ts`                                                     |
| Runtime CSS         | canonicalizer, ordering, serializer, store, sink                                | `css/runtime-policies.ts`, `css/runtime-artifacts.ts`, `css/runtime-sink.ts` |
| Stylesheet lowering | condition, ordering, serializer, and variable compiler policies                 | `css/stylesheet-policies.ts`, `css/css-rule-serializer.ts`                   |
| Token formats       | one normalized token set plus format adapters                                   | `codemod/swap/token-format-registry.ts`                                      |
| `cx()` compilation  | constant discovery, expression evaluation, and class merge ports                | `vite/cx-compilation-ports.ts`                                               |
| Design vocabulary   | module adapter registry                                                         | `design/resolve.ts`                                                          |
| Analyze/reporting   | analysis, workspace, budget, and report ports                                   | `analyze/analysis-service.ts`, `analyze/analysis-report.ts`                  |

The flat `SwapIR` is deliberately retained as the cheap path. Rich migrations
use the versioned semantic `StyleProgram`; neither path is allowed to know a
pair-specific `XToY` implementation.

## Locality and exports

Concrete ecosystem policy belongs in its adapter module. CLI files only parse
arguments, assemble registries/providers, and render reports. Generic AST,
filesystem, CSS, and serialization mechanics belong in infrastructure ports.

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
