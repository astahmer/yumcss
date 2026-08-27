# Agent guidance — pandwind

## API surface policy (read before proposing features)

The **user-facing API is deliberately frozen**: `tw()` / `css()` / `cx()` /
`createDesignCss` presets, the `ClassNameStrategy` contract, and the codegen
entry points. Do not add new user-facing API surface by default — push back
on proposals, including ones that look small. Rationale: the value
proposition is a minimal API you can hold in your head; every addition taxes
docs, types, size budgets and the parity suites.

What is always welcome (no pushback needed):

- compiler/optimizer work (folding passes, pruning, splitting)
- tooling around the API (codemods, analyze, MCP-free CLIs, lint rules,
  debug tooling, studio/dashboards)
- correctness/perf fixes inside existing APIs
- genuinely worthwhile additions — these exist, but they need a written
  design note first (see plans/) AND an explicit maintainer go-ahead.

Current approved-but-not-built examples of the bar: var-inline strategy
(dynamic values only). Per-page CSS splitting already shipped
(`splitByRoute` / `inlineCritical` on `pandwindCssVite`) — treat it as part of
the frozen surface now.

## Interface-first architecture policy

Pandwind is a pivot library, so extensibility is a product requirement, not a
future cleanup. When a domain can have more than one implementation, model it
as a versioned interface plus a registry/factory. Do not make callers know
which concrete module to import or grow a switch statement in a central runner.

- Migration is composed from a source dialect adapter, the semantic IR, and a
  target dialect adapter. A route from X to Y is not a bespoke `XToY` function.
  Systems may expose nested dialect adapters: Panda can register `tw`, `dss`,
  and `css` source dialects under one Panda system adapter, while Pandwind can
  register multiple target dialects under its target adapter.
- Adapter contracts must carry identity, detection, configuration, parse,
  emit, dependencies, capabilities, validation, and lossiness. Adding one
  adapter should mean implementing the interface and registering it, not
  editing every migration branch.
- Scanning is document/language agnostic. A source document contains an id,
  language, content, and source-map metadata; language adapters own parsing and
  AST traversal for TSX, Vue, Svelte, Astro, and future formats. Filesystem
  globbing and file reading are providers, not scanner semantics.
- Backends follow one family contract with many implementations. CSS,
  React Native, OpenTUI, and future targets implement the same backend factory
  and capability protocol. Shared style resolution must depend on the
  interface, never a concrete backend module.
- Prefer cohesive domain objects over bags of unrelated exports. A module that
  has several operations over one concept should expose a scoped interface,
  registry, factory, or class with static utilities. Keep standalone exports
  only for genuinely independent primitives and preserve narrow public
  subpaths.
- Registries are the extension point; unions and maps are derived from the
  registry where possible. Tests must prove that a fake/minimal adapter can be
  registered without changing core orchestration.
- Third-party style adapters use the versioned plugin registry in
  `pandwind-codemod/swap`; discovery is explicit and injectable, never an
  ambient global scan. A plugin may export one adapter, a plugin object, or an
  adapter collection.
- The source scanner contract is owned by `pandwind/source`. Codemod is only a
  compatibility projection; Vite, analyze, and Panda compiler paths must use
  the same parser/language-selection service rather than reimplementing
  extension checks.
- Adapter migration and Panda project migration are staged pipeline domains.
  Concrete parsers/emitters may remain independently owned modules, while
  orchestration policy belongs to the pipeline interface.
- Semantic metadata for themes, composition, runtime context, plugin
  transforms, and framework semantics must travel in the StyleProgram and be
  checked by capability/validator registries; do not encode it only in
  unstructured residual text.
- Preserve the fast paths: the flat `SwapIR` remains the cheap migration path,
  and backend adapters must not force every call through the richest semantic
  representation when the simple path is sufficient.
- Every refactor is split into focused JJ revisions with behavior-preserving
  tests at each boundary. Do not rewrite concurrent workspaces or move their
  heads while another agent owns them.

## Implementation locality rules

- A concrete ecosystem adapter is a cohesive policy module. Its adapter file
  owns detection, config loading, source matching, semantic normalization,
  emission, capability declarations, dependency declarations, and adapter
  validation. Generic parser/renderer helpers are infrastructure; ecosystem
  names, patterns, and semantic exceptions do not belong in `cli.ts`, the
  migration runner, or a shared “extra adapters” switchboard.
- A family interface may contain nested dialect implementations. For example,
  Panda-to-Pandwind is a route family whose `tw`, `dss`, and `css` dialects are
  independently registered source adapters. The orchestrator sees only ports
  and resolves a route from the registry.
- CLI files are composition roots: argument parsing, filesystem providers,
  registry assembly, and reporting are allowed there. Parsing, lowering,
  framework rewrites, and target emission are not.
- Knip is a required maintenance check. Findings are fixed at the ownership
  boundary where possible. A suppression requires a documented dynamic entry
  point or generated/public contract, never convenience.
