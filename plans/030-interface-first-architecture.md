# Interface-first architecture plan

## Context

Pandwind now has a semantic style-program IR, adapter contract v2, several
external CSS-in-JS adapters, renderer-neutral host contracts, and a shared
`StyleBackend` interface. The implementation is nevertheless still partly
organized around concrete modules and central switches:

- `packages/codemod/src/swap/external-adapters.ts` still contains the concrete
  external adapter implementations, but its public registry and route surface
  now delegates to versioned system/dialect contracts;
- Panda migration has separate `tw`/`dss`/`css`-shaped paths without one
  composable system/dialect registry;
- CSS extraction, analyze, codemod, and Panda migration each own parts of
  source scanning and make assumptions about file extensions or parsers;
- CSS, React Native, and OpenTUI share `StyleBackend` locally, but their
  concrete factories and lane wrappers are not exposed through one backend
  family registry;
- several `index.ts`, inspector utility, and analyzer modules are bags of
  unrelated functions, while large files combine domain policy with plumbing.

The user-facing styling API remains deliberately small. This plan changes
internal/tooling architecture and adds only approved extension contracts.

## Goal

Make every extensible pandwind domain registry-driven and interface-first so a
new style dialect, source language, backend, host, or validation implementation
can be added without editing the core orchestrator.

## What

Introduce cohesive contracts and registries for:

1. style systems and nested source/target dialect adapters;
2. migration route resolution through the semantic IR;
3. language-agnostic source documents and scanner adapters;
4. backend factories and capability-aware CSS/RN/OpenTUI implementations;
5. provenance, diagnostics, and differential validators;
6. domain-scoped exports instead of catch-all barrels.

The first migration shape should be compositional:

```text
PandaStyleSystem
├── source.tw
├── source.dss
└── source.css

PandwindStyleSystem
├── target.tw
├── target.dss
└── target.css

MigrationRegistry.route(sourceDialect, targetDialect)
        └── source adapter → StyleProgram IR → target adapter
```

There must be no required `PandaToPandwind` implementation. A pair-specific
adapter is allowed only as an optimization/delegation layer and must implement
the same source/target interfaces.

## Why

The original pivot-library promise depends on cheap ecosystem adoption. If a
new adapter requires editing central unions, scanners, emitters, and CLI
branches, the semantic IR is not a real pivot boundary. The same problem would
reappear for Vue/Astro/Svelte source files and for RN/OpenTUI or future native
backends.

## How

### Conceptual model

```text
input provider → SourceDocument → LanguageScannerRegistry
                                  ↓
                         SourceDialectAdapter
                                  ↓
                         versioned StyleProgram
                                  ↓
                         TargetDialectAdapter
                                  ↓
                  BackendFactory / host compiler / report
```

### Operations / behavior

- Register and discover systems by stable id.
- Register nested dialects under a system (`panda/tw`, `panda/dss`,
  `panda/css`) without changing route resolution.
- Resolve a route by source and target dialect capabilities.
- Scan a `SourceDocument` using the language adapter selected by explicit
  language or extension detection.
- Produce one structured report containing diagnostics, provenance,
  capabilities, residuals, and changed ranges.
- Create a backend from a registry and ask only the shared backend interface to
  declare/check style artifacts.

### Tech choices

| Choice        | Decision                                                     | Rationale                                                              |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Route model   | Neutral semantic IR first                                    | Avoid N×N bespoke migration implementations                            |
| System model  | System adapter containing dialect adapters                   | Matches Panda `tw`/`dss`/`css` and future library variants             |
| Scanner input | `SourceDocument` plus language adapter                       | Keeps Vue/Astro/Svelte/TSX out of core scanner policy                  |
| Backend model | `StyleBackendFactory` + existing `StyleBackend`              | Adds registry/factory without breaking the proven declaration contract |
| Compatibility | Versioned internal contracts and explicit capability reports | New adapters fail visibly instead of silently approximating            |
| Exports       | Domain facades and narrow subpaths                           | Prevent “bag of exports” growth while retaining useful primitives      |
| Fast path     | Preserve flat `SwapIR` projection                            | Simple swaps should not pay semantic-IR costs                          |

### Architecture

```text
StyleSystemRegistry
  ├── PandaStyleSystem
  │     ├── tw SourceDialectAdapter
  │     ├── dss SourceDialectAdapter
  │     └── css SourceDialectAdapter
  ├── EmotionStyleSystem
  └── PandwindStyleSystem

SourceScannerRegistry ── language adapters ── TSX/Vue/Svelte/Astro/...
BackendRegistry ── CSS/RN/OpenTUI/...
ValidatorRegistry ── canonical/browser/SSR/hydration/...
```

## What this allows

- Adding one adapter by implementing and registering one interface.
- Any supported source dialect migrating to any supported target dialect.
- One scanner/reporting pipeline over mixed-framework repositories.
- Backend parity and capability checks shared across CSS, RN, and OpenTUI.
- Test doubles and third-party adapters without modifying core orchestration.
- Clear domain ownership and smaller, navigable modules.

## What this does not allow

- It does not promise lossless conversion where a target capability is absent.
- It does not add a large new authoring API to pandwind.
- It does not force every simple literal call through the semantic IR.
- It does not make a language parser interchangeable with a filesystem
  provider; those remain separate interfaces.
- It does not require pair-specific adapters unless profiling proves a direct
  fast path is worthwhile.

## UI & UX

No end-user UI is required. Inspector and CLI consumers should receive the
same domain report and render provenance/diagnostics through their existing
views. Architecture work should not add another inspector-only payload shape.

## Data model

```ts
interface SourceDocument {
	id: string;
	language: string;
	content: string;
	root?: string;
}

interface StyleDialectAdapter {
	id: string;
	system: string;
	role: "source" | "target" | "both";
	parse?(document: SourceDocument, context: ParseContext): ParseResult;
	emit?(program: StyleProgram, context: EmitContext): EmitResult;
}

interface StyleSystemAdapter {
	id: string;
	dialects: ReadonlyMap<string, StyleDialectAdapter>;
	capabilities: AdapterCapabilities;
}

interface StyleBackendFactory {
	id: string;
	create(context: BackendContext): StyleBackend;
}
```

## Implementation steps

1. Add the architecture contracts and registries behind existing APIs; prove a
   fake adapter can register and route through the semantic IR.
2. Put system/dialect definitions and registry routing beside the existing
   external adapter implementations; keep the large implementation module as
   an internal compatibility seam until adapter-specific files can be split
   without duplicating parser behavior.
3. Model Panda `tw`, `dss`, and `css` as nested dialect adapters and route the
   existing migration paths through them without changing output.
4. Introduce `SourceDocument`, language adapters, and a scanner registry;
   migrate CSS extraction and codemod entry points first, then Panda/analyze.
5. Introduce a backend factory registry and move CSS/RN/OpenTUI lane wrappers
   behind it; retain direct constructors as narrow compatibility/tooling seams
   only where tests prove they are needed.
6. Consolidate diagnostics/provenance/differential validation behind domain
   services and replace catch-all exports with scoped facades.
7. Add contract tests, extension-authoring tests, mixed-language fixtures,
   backend parity tests, and release smoke coverage.
8. Update docs and scorecards, then inspect the complete JJ chain and workspace
   state before merging revisions.

## Open questions

1. Should third-party adapters be loaded statically from a registry or through
   an explicit plugin loader after the internal registry is stable?
2. Should language adapters expose a common AST abstraction, or only a common
   scanner result while retaining parser-specific ASTs internally?
3. Which domain facades deserve public subpaths, and which remain internal
   codemod/analyze implementation details?

## Acceptance criteria

- [x] A fake style dialect can be registered and routed X → Y without editing
      the orchestrator.
- [x] Panda `tw`, `dss`, and `css` are nested dialects of one system adapter.
- [x] Scanner orchestration accepts TSX, Vue, Svelte, and Astro documents
      through language adapters rather than file-specific branches.
- [x] CSS, React Native, and OpenTUI are backend implementations of one
      factory/capability contract.
- [x] Flat `SwapIR` behavior and existing semantic migrations remain unchanged.
- [x] New modules expose cohesive domain interfaces/facades; no new catch-all
      export barrel is introduced.
- [x] Contract, parity, differential, typecheck, and release-smoke tests pass.

## Decisions log

| Date       | Decision                                                                                              | Rationale                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-08-27 | Prefer interfaces plus registries wherever multiple implementations are expected                      | Pandwind’s pivot value depends on low-friction ecosystem adapters      |
| 2026-08-27 | Compose migrations through source/target dialects and semantic IR                                     | Avoid N×N `XToY` implementations while allowing optimized routes       |
| 2026-08-27 | Treat scanners as document/language services                                                          | File extensions and filesystem access must not define CSS semantics    |
| 2026-08-27 | Keep `SwapIR` and narrow public styling APIs                                                          | Preserve fast paths and the minimal authoring surface                  |
| 2026-08-27 | Make built-in registries the default route/factory surfaces while retaining compatibility projections | Existing callers migrate incrementally without central-switch coupling |
