# Agent guidance — pandwind

For every decision, ask what the best expert in that field would do and why they would reject your current choice; if you can name that reason, don't make the choice. Optimize for what that expert would judge correct, never for what satisfies the stated constraints most cheaply. Every trade-off you take must be stated to the user, never absorbed.

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

Do not retain deprecated aliases, overloads, or compatibility projections for
our own APIs. When an internal contract is replaced, update its callers and
tests in the same revision and delete the superseded name. The flat `SwapIR`
path is an intentional current fast path, not a deprecated API, and must be
preserved as such.

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
- Built-in identity values are `const enum`-backed. Adapter ids, source/target
  dialect ids, pattern ids, plugin ids, token-format ids, backend ids, and
  validator/lowering ids must use exported TypeScript `const enum` tags (or an
  equivalent typed identifier owned by their registry), never repeated raw
  string comparisons or untyped string literals. Keep a literal-union view at
  serialization and authored-source boundaries when ordinary string literals
  must remain assignable; use the enum tag for control flow. Because const
  enums have no runtime object, registries must expose an explicit ordered
  array for iteration instead of `Object.values`. Third-party ids remain
  extensible through a branded identifier factory and the plugin registry.
- Do not leak ecosystem branches into shared orchestration. Code outside an
  owning adapter must not contain checks such as `adapter === "stylex"` or
  `from === "panda"`; adapter-specific behavior is normalized into neutral
  IR metadata or selected through a registry port. Enum values are the only
  allowed identity comparison at the composition boundary.
- This rule is about identities and policies, not authored data. CSS property
  names, CSS values, package specifiers embedded in emitted source, regex
  patterns, diagnostics, and user-authored names may remain strings when they
  are not registry keys or control-flow identities.
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
- Project-aware adapters should delegate configuration interpretation to the
  ecosystem's official package when one exists. Resolve optional packages from
  the migrated project's root through an injectable module-loader port, keep
  that path asynchronous, and retain a deterministic source fallback when the
  package or config is unavailable. Official-loader failures must become
  structured diagnostics/residuals; never silently treat an unevaluated
  custom preset as the complete project configuration. Do not bundle optional
  ecosystem packages into Pandwind's runtime dependencies.
- Official config loaders should expose custom design values through the
  neutral `AdapterTokenCatalog` contract when the ecosystem provides them.
  Target policies consume that catalog only after exact, property-aware,
  unique matching; source-specific aliases, presets, CSS variables, and
  runtime theme behavior remain owned by the source adapter. A catalog is
  evidence, not permission to guess: absent or ambiguous values stay literal
  and must remain visible to validation.
- Preserve the fast paths: the flat `SwapIR` remains the cheap migration path,
  and backend adapters must not force every call through the richest semantic
  representation when the simple path is sufficient.
- Generated design-system context is exchanged through the versioned
  `pandwind.interop.json` artifact. Codegen owns its contents; bridge generation
  refreshes the bridge section; migration tooling may consume pre-artifact
  generated files only when a project has not produced the versioned artifact.
  Never hardcode an example preset or application-specific metadata in a
  generic migration path.
- Playground Monaco declarations are generated from the workspace-linked
  `pandwind` package exports. From `apps/playground`, run `pnpm editor:types`.
  Do not hand-maintain a second `CssFn`, `CxFn`, design, or option signature in
  the editor. Keep third-party migration-example shims explicitly separate and
  label them as shims when the package is not a playground dependency.
- Token catalogs normalize only statically resolved scalar values (strings and
  numbers). Conditional/theme-dependent token objects must remain outside the
  static catalog unless an active theme context is explicitly carried in the
  semantic IR; never flatten their condition keys into invented token names.
  When an official source loader proves a token reference, preserve it as a
  `StyleTokenValue` with its resolved value attached so a target policy can
  remap it to the target preset rather than prematurely replacing it with a
  source CSS variable.
- `StyleProgram.sourceMap` must retain program/rule/theme/composition and
  dynamic-expression provenance. Recipe/component semantics belong in their
  versioned IR and host contracts, not in opaque residual text.
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
- Comments follow ownership, not history. Keep comments that explain semantic
  invariants, safety constraints, algorithmic trade-offs, or extension
  contracts in the final owner module when code moves. Rephrase them to match
  the current API; do not retain migration diaries, section banners, or
  comments that merely narrate obvious code. A decomposition review should
  explicitly classify removed comments as moved, retained/rephrased, or
  intentionally discarded.
- CLI files are composition roots: argument parsing, filesystem providers,
  registry assembly, and reporting are allowed there. Parsing, lowering,
  framework rewrites, and target emission are not.
- Knip is a required maintenance check. Findings are fixed at the ownership
  boundary where possible. A suppression requires a documented dynamic entry
  point or generated/public contract, never convenience. Public package
  subpaths must be listed as Knip production entries when they are not
  reachable from the root export. `postcss-selector-parser` is intentionally
  suppressed because it is required by those public stylesheet/bridge
  subpaths, while Knip's production dependency graph does not follow them.

## Codemod output quality and issue-driven tests

- A migration is successful only when the generated source is the idiomatic
  form a staff-level engineer who knows the target ecosystem would author by
  hand. Preserving equivalent CSS is necessary but insufficient: use the
  target's documented carrier, component shape, theme/token mechanism,
  composition primitive, host conventions, and framework semantics. Adapter
  emitters own these target-specific choices; the route runner must not invent
  generic target syntax.
- Prefer target-native design-token references and reusable variables over
  repeated literals when the target project exposes verified metadata for
  them. A target adapter may recover a token only when the target token's
  resolved value is an exact match and its spelling is legal for that
  property; retain the literal when metadata is absent, ambiguous, or from a
  different preset. Never invent a token name merely because it looks
  plausible: semantic equivalence takes priority over stylistic preference.
- Prefer a self-contained inline emission when it remains readable and has no
  reusable state. When correctness or expert target style requires a shared
  helper, theme constant, generated recipe, or runtime bridge, an adapter may
  return generated file artifacts in addition to the rewritten source. Artifact
  paths are project-relative, identical `(path, content)` artifacts are
  deduplicated, and conflicting content for one path is a safe residual rather
  than an overwrite. CLI composition roots are responsible for creating
  directories and writing these files only in `--write` mode.
- Every codemod bug or missing semantic begins as a source-specific issue
  fixture: write the exact input and the expert expected output in an inline
  snapshot, add ordinary `expect` assertions for conversion, residuals,
  imports, and output shape, then implement the fix. Inline snapshots are for
  fast inspection, not the safety contract; a snapshot update must never be
  enough to make a failing migration green.
- Output tests must cover both the happy path and the conservative path. The
  latter must prove source preservation and a typed residual for unsupported,
  ambiguous, or conflicting target semantics. For reusable generated files,
  tests must cover one occurrence, repeated occurrences that deduplicate, and
  conflicting artifacts that fail closed.

## Architecture definition of done

A façade alone is not considered a decomposition. The implementation is done
only when each independently replaceable policy has a named port, an
injectable default implementation, a composition root, and a substitution
test. Large legacy modules may remain as infrastructure only when callers no
longer depend on their concrete policy and the module is not exporting a bag
of ecosystem-specific operations. Record each completed domain in
`docs/src/content/docs/contributing/architecture.md` and keep the relevant
JJ revision focused and described.

## Pre-launch Evolution

We have not launched and have no production users or production data. Revisit this policy before the first production deployment.

- Optimize for the smallest coherent design that represents the product today.
- Remove obsolete code, schemas, APIs, configuration, aliases, and transitional paths directly.
- Do not add backward-compatibility shims, legacy aliases, dual-read or dual-write paths, or data-preserving backfills unless the user explicitly asks for them.
- Internal interfaces are not public compatibility contracts. Update their callers and tests atomically when they change.
