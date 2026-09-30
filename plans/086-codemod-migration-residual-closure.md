# Plan 086 — close avoidable codemod migration residuals

## Context

The recent migration audits cover Chakra, Tailwind, StyleX, Pandwind, Tokenami,
UnoCSS, and styled-components. They inspect both adapter directions and add
source-specific cases for target output, host rewrites, project configuration,
and residual preservation. The findings reveal a next step beyond making each
route safe: identify residuals whose meaning can be represented by the target
and teach the adapter to emit that representation.

Two plans already own the broad contracts around this work:

- [Plan 041 — any adapter to any adapter](./041-any-direction-adapter-completeness.md)
  owns route composition, semantic lowering, official project context, typed
  residuals, and the directional proof matrix.
- [Plan 085 — product focus and codemod audit](./085-product-focus-and-codemod-audit.md)
  owns target-native output review, route canonicality, and product claims.
- [Plan 060 — real-world migration proof](./060-real-world-migration-proof.md)
  owns installed-project, build, browser, SSR, hydration, and route-promotion
  evidence.
- [Plan 050 — virtual bundler migrations](./050-virtual-bundler-migrations.md)
  owns the read-only Vite/virtual migration boundary.

This plan does not recreate those systems or repeat their general acceptance
criteria. It turns residuals found by the focused audits into a deduplicated,
evidence-ranked queue of target representations and adapter improvements.

The canonicality ledger at
[`codemod-canonicality-route-ledger.json`](./evidence/codemod-canonicality-route-ledger.json)
was generated on 2026-09-27, before the focused audit revisions on 2026-09-28.
That baseline covers 1,024 route pairs: 32 canonical identity routes, 177
safe-residual routes, and 815 unverified routes. Its 234 residual records are
not 234 separate bugs. They cluster around 93 configuration residuals, 52
capability residuals, 38 host-framework residuals, 39 validation residuals,
and 12 framework-semantics residuals. The frequent capability findings include
named style maps and component subjects; the host findings include standalone
styles without a target host prop and framework-incompatible hosts. The counts
are a prioritization signal, not a target for eliminating safe residuals.

Several foundations already exist and should be extended: the source scanner
provides AST-backed bindings and local re-export resolution; `StyleProgram`
carries typed semantic metadata and provenance; adapters can return
project-relative generated files; identical artifacts are deduplicated and
conflicting paths fail closed; and the host rewriter can preserve some
single-file component contracts. The main opportunity is to apply those
mechanisms to reusable, importable components and stylesheet artifacts across
the complete usage graph, while proving the generated project behaves like the
source project.

## Goal

Reduce residuals when source meaning has a documented, verified target
representation. Preserve source and report an actionable residual whenever
project evidence is missing, the target cannot express the behavior, or the
rewrite cannot preserve the host contract.

“Fewer residuals” means fewer avoidable residuals with semantic proof. It does
not mean hiding residuals, guessing missing configuration, or forcing every
route to convert completely.

## What

- Refresh the route evidence after the seven focused audits and classify each
  residual by its underlying semantic cause, not by repeated route count.
- Close high-value gaps in reusable components, named style maps, generated
  stylesheet artifacts, host and style-prop projections, configuration and
  token resolution, dynamic values, conditions, and CSS semantics.
- Generate target-owned component wrappers or companion files when those
  preserve a source export more faithfully than an inline style expression.
- Keep the migration result reviewable: source edits, generated files,
  dependency/configuration changes, and any remaining residuals are visible in
  preview and machine-readable evidence.
- Prove both migration directions for every changed semantic, including
  conservative cases and the target project's own build/runtime behavior.

The first wrapper opportunity is a styled-components-like source component
that remains imported by other files after its styles move to another carrier.
The migration should preserve the component's exported name and usable props,
and may generate a target-native wrapper plus a separate stylesheet or
compile-time style module. The same representation pattern applies to other
component and named-map sources when the target and host can support it.

## Why

Safe residuals are a good result when they expose real incompatibility. They
are avoidable friction when a target has a valid representation but the
current adapter only knows how to emit a flat style value. The recent audits
show several opportunities with leverage across many routes:

- A named style map can often become a target-native recipe, class map, or
  stylesheet export while retaining the names callers use.
- A styled component can often remain a component through a generated wrapper,
  even when the target's style system is a stylesheet, class string, or
  separate compile-time module.
- A token residual can disappear when the migration loads the effective
  project configuration and proves the exact source and target values.
- A host rewrite can be correct for one framework and invalid for another;
  host ownership and style-prop semantics must be resolved before changing
  source.
- Static, configured, and runtime behavior are different proof cases. A green
  route fixture alone cannot establish target-package compatibility.

The September 27 route evidence makes these gaps concrete, while the September
28 family audits add fresher cases for Chakra component/layout props, Tailwind
to MUI host conversion, StyleX conditions, Pandwind dialects, official
Tokenami/UnoCSS configuration, and styled-components component wrappers. The
baseline ledger must be regenerated before implementation so prioritization
uses the current evidence rather than treating those older totals as current.

## How

### Conceptual model

```text
Source project + exact package versions + effective configuration
                              │
                              ▼
             Shared scanner and project binding graph
                              │
                              ▼
      Source adapter → semantic program with provenance
                              │
                              ▼
 Target representation decision owned by target adapter
     ┌──────────────┬──────────────┬───────────────┬─────────────┐
     │ inline/native│ host runtime │ files +       │ safe source │
     │ form         │ wrapper      │ component     │ residual    │
     │              │              │ wrapper       │             │
     └──────────────┴──────────────┴───────────────┴─────────────┘
                              │
                              ▼
     Target validation + project build/runtime proof + report
```

The source adapter interprets source-owned semantics. The target adapter
chooses idiomatic target syntax and any target-owned artifacts. Framework
adapters own host tags, component types, children, refs, and prop forwarding.
The migration runner composes those ports and reports the result; it does not
contain ecosystem branches or invent a generic component API.

### Operations / behavior

1. Re-run the route and canonicality capture against the current registry,
   using the source-specific audit inputs and the same configuration contract
   as the CLI and virtual migration. Record both directions and identify any
   mismatch between the ledger and the focused route tests.
2. Group residuals by semantic feature and evidence. For each group, record
   whether it is avoidable with verified project data, representable by a
   target-native form, representable through a target-owned wrapper/artifact,
   genuinely unsupported, or still unverified.
3. For component migrations, resolve the source component and its local uses,
   imports, aliases, and re-export barrels before deciding whether a rewrite is
   complete. Keep an exported component as an exported component; do not turn
   its class expression into a component value or delete its import while
   consumers still depend on it.
4. Prefer target-native inline output when it is readable and preserves the
   contract. If a shared style map, compile-time style module, or component
   wrapper is required, emit deterministic project-relative files and update
   source imports in the same migration result.
5. Preserve component behavior only where it can be proven: default and
   caller props, `.attrs` precedence, class/style merging, children, refs,
   forwarded props, transient style props, and polymorphic hosts. Where a
   framework or target exposes only a restricted host set, support the exact
   verified subset and retain a typed residual for the rest.
6. Load source and target configuration from each owning ecosystem's official
   package when available. Carry provenance, package version, effective
   presets/plugins, enabled features, conditions, variants, selectors, and
   scalar token values into lowering. Missing, failed, or ambiguous metadata
   remains visible as a configuration residual.
7. Run target validation before applying the corresponding source and host
   rewrite. If target validation or host projection fails, preserve the source
   construct as one coherent unit and report the reason; do not leave a
   partially rewritten host with an unrelated style residual.
8. Make preview list every changed source, generated artifact, dependency or
   config change, and remaining residual. `--write` is the only CLI mode that
   creates files. Re-running the migration should not duplicate imports,
   artifacts, wrappers, or dependency edits.
9. Use the same migration use case for CLI and virtual bundler flows. The
   virtual flow may serve generated files through host hooks, but does not
   write the user's project tree.

### Audit-derived opportunity inventory

| Priority | Opportunity                                        | Audit evidence and candidate work                                                                                                                                                                                                                                                                                                                                          | When a residual remains justified                                                                                                                                   |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Reusable, re-importable component wrappers         | The styled-components audit covers exported styled components, `.attrs`, caller prop precedence, polymorphism, and target-specific wrappers. The older ledger repeats component-subject and host residuals across routes. Extend wrappers to preserve public exports and usages across files; emit a target-native style sidecar when the target has no inline carrier.    | Dynamic attributes, custom component forwarding, refs, or polymorphic hosts remain residual when the target framework cannot preserve their exact contract.         |
| P1       | Named style maps and recipes                       | The baseline has 30 `named-rules` capability records, largely because a named source map is not just one CSS block. Project each name to a target recipe, map, class, or stylesheet export when its target API supports it. Preserve call names and variant/compound-variant semantics.                                                                                    | Runtime callable variants, ordered composition, or compound rules remain residual if no equivalent target API or generated wrapper exists.                          |
| P1       | Effective source and target configuration          | The baseline has 93 configuration records for unresolved Panda and Mantine tokens without project evidence. Chakra, Tailwind, StyleX, Tokenami, and UnoCSS audits also exercise official metadata and missing-loader behavior. Resolve the project's actual presets, plugins, shortcuts, themes, selectors, conditions, variants, and disabled features before conversion. | A missing/failed official loader, unresolved custom preset, conditional token without active theme context, or ambiguous value must retain a residual.              |
| P1       | Host and framework-aware projections               | The baseline has 38 host-framework and 12 framework-semantics records, including standalone style APIs without a target host prop, React-only component assumptions, and framework-specific host constraints. Improve host mapping for Chakra/Mantine style props, Tailwind class carriers into MUI `sx`, React Native primitives, and React Strict DOM's fixed host set.  | Keep original hosts and props when a target-owned host cannot preserve element, event, form, accessibility, children, or framework semantics.                       |
| P1       | Cross-file import and artifact closure             | Component APIs are consumed through exports, barrels, path aliases, and multiple files. Extend scanner/project evidence as needed so every use of a converted export is accounted for; update import and dependency ownership only after the graph proves the source package is no longer used.                                                                            | Dynamic module loading or unresolved external consumers prevent a safe whole-project rewrite; leave the export and package dependency intact with a clear residual. |
| P2       | Dynamic props, themes, and composition             | Styled-component callbacks, free theme reads, StyleX conditions, and Tokenami's callable `css.compose` surface require more than static CSS lowering. Add a target runtime/host carrier only when it can preserve inputs and precedence; do not flatten callable variants to static classes.                                                                               | Arbitrary functions, unbound theme context, or target runtime restrictions remain residuals.                                                                        |
| P2       | Property, unit, shorthand, and condition semantics | The canonicality work already caught Mantine `auto` spacing and numeric dimensions, Panda token values, and target token name/value mismatches. Continue property-aware unit conversion, shorthand expansion, responsive/pseudo/container condition lowering, selector and at-rule order, and validation against target compilers.                                         | Keep source where exact CSS meaning, source ordering, or target condition syntax cannot be established.                                                             |
| P2       | Stylesheet and preprocessor artifacts              | Authored CSS, CSS Modules, Sass, and Less cannot directly carry a component runtime or local class-scoping contract. Where the target has a compatible host, generate a stylesheet/module plus a framework-native wrapper. Use the official preprocessor/compiler when preprocessing is required.                                                                          | Do not pretend a CSS sidecar preserves component exports, module scoping, Sass/Less features, or runtime props without a wrapper and compiler proof.                |
| P2       | Version-aware source and target contracts          | Record installed source and target package versions and use their official API manifests/docs to choose syntax. Add separate version cases only when the adapter supports those versions; do not treat a rolling docs page or one installed version as proof for all versions.                                                                                             | Mark unavailable packages or version-uncertain output unverified until the actual target project compiles it.                                                       |
| P3       | Residual usability and maturity evidence           | Group duplicate causes, retain source ranges/provenance, identify the missing capability or configuration, and provide a precise next action. Show route maturity separately from conversion count.                                                                                                                                                                        | A residual may remain in the final report when it is accurate, source-preserving, and actionable.                                                                   |

The first implementation cohort should be selected from refreshed frequency,
real-project demand, and available installed proof. The strongest initial
candidate is the styled-component-to-stylesheet/component-wrapper path because
it exercises generated files, imported components, CSS extraction, host
semantics, and artifact conflict handling together. The same slice should
include at least one target that has a native component API and one that needs
a generated wrapper, so the work does not overfit to a single target family.

### Tech choices

| Choice             | Decision                                                                                     | Reason                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Semantic contract  | Keep `StyleProgram` and the versioned adapter registry as the migration boundary             | Component, recipe, theme, condition, plugin, and runtime semantics need typed provenance and target capability checks.                 |
| Generated files    | Extend `AdapterGeneratedFile` and existing artifact conflict/deduplication behavior          | The project already has an artifact path; generated wrappers and style modules should remain target-owned output, not a second engine. |
| Source graph       | Reuse the shared scanner and injectable project filesystem/module-resolution ports           | Cross-file changes must follow real bindings and exports, not regex matches or ambient workspace scans.                                |
| Ecosystem metadata | Use each source/target's official loader and verified package version                        | Prevent partial hardcoded utility, condition, variant, style-prop, or token vocabularies.                                              |
| Framework output   | Extend framework-owned host/component adapters                                               | React, Preact, Solid, Vue, Svelte, and Astro have different component and prop contracts.                                              |
| Validation         | Combine normal assertions, inline snapshots, target compiler/build checks, and runtime proof | Snapshots help review output but do not establish semantic or target-package correctness.                                              |
| Public API         | Add no authoring or public migration API by default                                          | This is codemod/tooling work and the Pandwind authoring surface is frozen.                                                             |

### Architecture

- Source adapters own detection, config loading, parsing, source semantics, and
  source provenance. Target adapters own target syntax, generated-file content,
  dependencies, and target validation.
- The source project graph supplies binding, import/export, alias, and usage
  evidence. Project filesystem and module resolution are injectable ports; the
  migration runner does not glob or interpret ecosystem configuration itself.
- A target wrapper must be idiomatic for the resolved framework and package
  version. It may preserve an existing component export or create a companion
  module, but it cannot become a generic target API exposed by Pandwind.
- Use typed semantic nodes for recipes, component subjects, variants,
  composition, runtime context, and condition provenance. Do not place required
  meaning only in residual strings.
- Artifact paths are deterministic and project-relative. Equal path/content
  pairs deduplicate; different content for one path fails closed. Imports,
  source maps, and dependency changes must point to the same emitted artifact.
- Apply each source/component/host rewrite atomically after target emission and
  validation. One failed piece preserves the original construct and reports a
  typed residual instead of applying a partial rewrite.
- Keep the flat `SwapIR` path and current CLI/Vite composition boundaries. No
  central ecosystem-name switch, ambient adapter discovery, target vocabulary
  copy, or parallel transform engine is introduced.

## What this allows

- A component exported from a migrated file can remain usable through its
  existing import path while its styles move to a target stylesheet, module,
  recipe, or class carrier.
- Repeated imports and uses can share one generated wrapper or style artifact
  when target semantics are identical.
- A migration can remove a residual only when verified project data and target
  capability support the conversion.
- Maintainers can prioritize one repeated semantic gap instead of treating
  every route-level residual as unrelated work.
- CLI previews and virtual migrations can explain generated output and
  remaining limitations consistently.

## What this does not allow

- It does not make incompatible hosts, arbitrary runtime callbacks, or missing
  project configuration silently convertible.
- It does not remove a source prop, component export, import, or dependency
  unless the project graph and target output prove that removal is safe.
- It does not turn source residual text into a target feature or call every
  artifact-backed output a successful conversion without compiling it.
- It does not add a universal `styled` wrapper or framework runtime dependency
  to Pandwind.
- It does not promote routes or change maturity tiers on the basis of fixture
  counts alone.
- It does not require zero residuals when a residual documents real semantic
  loss or absent project evidence.

## UI & UX

### Desktop

Migration Preview shows source edits beside each generated wrapper or style
artifact, with imports and dependency changes visible. Residuals are grouped by
cause and linked to the preserved source location and the evidence needed to
resolve them.

### Mobile

No mobile-specific workflow is planned. The CLI and preview report must remain
readable at narrow widths.

### Common interactions

Preview is read-only. `--write` applies source and generated-file changes.
Preview and write modes report the same route, target representation, files,
dependencies, and residuals. A second run reports no new changes.

## Data model

Use the existing route-proof and migration-result contracts where they fit.
The refreshed evidence artifact should record, for each route and semantic
case:

- source/target adapter and dialect, package versions, framework, source file,
  source syntax, and exact project/configuration evidence;
- selected target representation: native, host-runtime, generated artifact
  plus component wrapper, or safe residual;
- generated file path/content identity, imports, dependency changes, and
  validation result;
- residual kind, source range/provenance, semantic feature, reason, and one
  disposition: avoidable with available evidence, configuration-dependent,
  unsupported by target/framework, or unverified;
- links to the source-specific fixture and installed-project proof, where they
  exist.

These are migration/evidence fields, not new user-facing API. If the current
versioned report cannot express a field, update that report at its existing
boundary and keep generated artifacts as derived evidence.

## Implementation steps

1. [x] Refresh the 2026-09-29 route ledger after the Chakra, Tailwind, StyleX,
       Pandwind, Tokenami, UnoCSS, and styled-components audit revisions. The
       capture covers every direction in the 32-adapter registry, with project
       configuration cases, artifacts, residuals, validation, and exact target
       package evidence.
2. [x] Deduplicate residuals by semantic cause and rank them by repeated route
       impact, representability, and installed-project proof. Each residual has a
       configuration-dependent, target/framework-incompatible, or unverified
       disposition; an absent generic-fixture config is not treated as an adapter
       bug.
3. [x] Trace source component exports, direct and barrel importers, JSX uses,
       and migration paths through the shared source/project ports. Existing
       project indexing and file-change ports provide the required closure; the
       direct consumer and re-export consumer both typecheck without edits.
4. [x] Add a source-specific fixture for an exported styled component used
       from other files. The CSS Modules target emits a `forwardRef` wrapper and a
       companion stylesheet while preserving the component's public binding.
5. [x] Extend target-owned generated artifacts with stable paths, repeated-use
       deduplication, conflicting-artifact rejection, source maps, rerun
       idempotence, CLI preview/write coverage, and read-only virtual-file serving.
       Normal CLI runs write files; `--dry-run` reports them without writing.
6. [x] Preserve supported `.attrs` order, props/defaults, class/style merge,
       children, refs, and transient props. Keep callbacks, arbitrary polymorphic
       hosts, unsafe attrs, malformed input, and unknown framework behavior as
       explicit source-preserving residuals.
7. [x] Verify official config/token/condition loading for Chakra, Tailwind,
       StyleX, Pandwind, Tokenami, and UnoCSS. Resolver fixtures cover available
       defaults, custom metadata, disabled features, and missing or failed loaders;
       no partial ecosystem vocabulary was added.
8. [x] Add source-specific fixtures and inline snapshots for named maps,
       callbacks, selectors/conditions, numeric units, precedence, and stylesheet
       lanes. Ordinary assertions independently cover conversion, residuals,
       imports, generated files, and output shape.
9. [x] Compile/typecheck generated output against installed React types and
       render the CSS Modules output through the installed Vite SSR path. The
       standalone `postcss-modules` package is not installed, so no claim is made
       about that package outside Vite's CSS Modules integration.
10. [x] Refresh the report and route ledger, document adapter and virtual-file
        boundaries, leave maturity unchanged because the promotion gate was not
        met, and split completed work into focused, described JJ revisions.

## Questions resolved during implementation

- The existing `benchmarks/styling-tsc` project supplies installed React types,
  and `examples/showcase` supplies the installed Vite SSR runtime. This uses
  repository evidence and adds no external fixture dependency.
- The wrapper stays beside the original component so its export and importer
  paths remain stable. The target adapter emits deterministic
  `Card.module.css` and `Card.module.css.map` siblings.
- Only the statically declared intrinsic host is emitted by the CSS Modules
  wrapper. Open-ended `as`/`forwardedAs`, callback attrs, and dynamic styles
  remain residuals when their source runtime behavior cannot be represented.
- The refreshed report ranks global stylesheet selectors to local class maps
  as the largest target-incompatible residual family (84 instances). The
  repeated unresolved Panda and Mantine token cases remain configuration
  dependent until official project metadata is available. No target syntax is
  guessed to reduce those counts.

These questions are resolved during the evidence and first-vertical-slice
steps; they do not block writing this plan.

## Acceptance criteria

- [x] The refreshed evidence covers both directions for all seven audited
      families and clearly distinguishes target output, semantic correctness,
      configuration evidence, residuals, and installed-project proof.
- [x] Every residual in the refreshed primary route ledger has a specific
      disposition and source location; repeated causes are grouped without
      obscuring route-level evidence.
- [x] At least one generated reusable wrapper preserves an exported component
      across a target style-system change and remains importable from an unchanged
      consumer file.
- [x] Wrapper output preserves only the props, children, refs, host behavior,
      attributes, and polymorphism verified by its source/target/framework
      contracts; unsupported behavior stays visible as a typed residual.
- [x] Generated wrapper/style artifacts are deterministic, deduplicated on
      identical content, rejected on path conflicts, previewable, writable only in
      write mode, and stable on a second migration run.
- [x] The changed artifact path has source-specific happy and conservative
      fixtures with inline snapshots plus ordinary assertions. Reusable files have
      one-use, repeated-use, and conflicting-artifact cases.
- [x] Each changed config/token/condition resolver covers official default,
      custom, disabled, and missing/failed metadata. No partial hardcoded
      ecosystem vocabulary is added.
- [x] Target validation and host rewriting are atomic: invalid target output
      preserves the original source construct and reports a typed residual.
- [x] Representative installed targets compile and typecheck generated output;
      runtime proof covers the framework behavior relied on by the wrapper.
- [x] The shared migration engine remains ecosystem-agnostic, the flat
      `SwapIR` path remains available, no public Pandwind API is added, and route
      maturity is unchanged until existing proof gates pass.
- [x] Remaining residuals are justified by absent/ambiguous evidence or
      unrepresentable target semantics and remain actionable; raw residual count
      alone is not used as the success metric.

## Decisions log

- 2026-09-28: Treat the focused audits as a source of issue-specific
  opportunities, not as evidence that every safe residual should be removed.
- 2026-09-28: Prioritize reusable target-owned wrappers and companion
  artifacts because one correct representation can close many route-level
  residuals while preserving component imports.
- 2026-09-28: Refresh the canonicality ledger before using its counts to rank
  work; the checked-in baseline predates the focused migration audits.
- 2026-09-28: Preserve the frozen Pandwind authoring API and use the existing
  adapter, scanner, `StyleProgram`, generated-file, and virtual migration
  contracts.

## Completion record (2026-09-29)

Plan 086 is complete. The reusable component-wrapper path is owned by the CSS
Modules target adapter; migration orchestration remains ecosystem-agnostic.
The adapter contract advanced to `/4` for optional original source text used by
artifact maps. The CSS sidecar map includes the owning TSX file and source
content; mappings are component-level because the semantic IR does not retain
per-declaration locations. The virtual transform returns a version 3 source
map and serves generated files without writing the source tree.

The refreshed [route ledger](evidence/codemod-canonicality-route-ledger.json)
and [audit report](evidence/codemod-canonicality-audit.md) cover all 1,024
directed pairs across 32 adapters: 992 cross-adapter routes have generated
fixtures and 32 identity routes are no-ops. Verdicts are 32 canonical, 260
safe residual, and 732 unverified pairs, with no valid-but-noncanonical or
incorrect/lossy verdicts. The 473 typed residuals span 356 routes. All have a
source location: 352 unique exact-text spans and 121 spans recovered from
unique migration outcomes; none are ambiguous or unlocated. Dispositions are
93 configuration-dependent, 91 target/framework-incompatible, and 289
unverified. The most repeated cause (84 routes) is a global stylesheet
selector that cannot become an unreferenced local class map. These residuals
remain visible and source-preserving; residual count alone is not the success
metric.

Coverage is in `styled-components-css-modules-wrapper.test.ts`,
`generated-file-emission.test.ts`, `adapter-cli-e2e.test.ts`,
`unplugin-migration.test.ts`, and the official-config/token audit suites.
`architecture.md` records adapter ownership, artifact conflict behavior,
source-map precision, and the Vite plugin boundary. The ledger refresh is
deterministic for this capture. Route maturity remains 22 experimental and
1,002 research; no route was promoted without its separate installed-project
proof gate.

Validation passed: the full codemod suite reports 2,131 files and 10,443
tests; both directly affected suites were rerun after cleanup (258 tests).
The root suite reports 1,050 runtime tests, the benchmark suites pass, and
TSTyche reports 168 tests and 380 assertions across 20 files. Workspace and
codemod typechecks, repository lint, and formatting checks pass. One initial
root-suite run exceeded a timing guard by 1.47×; the isolated case and the
subsequent full run passed.

Evidence SHA-256: route ledger
`faf2179e746c88a329e186f068b44d5931594e2279f9de96d14c1d414c4364e6`; audit
report `e99fca12a487e99bc61f9956371c15dda51d20b3eefb0b7f966b567e15fba08f`.
The standalone `postcss-modules` package is not installed, so runtime claims
are scoped to the installed Vite CSS Modules integration.

## Revalidation — 2026-09-30

The original implementation steps and acceptance criteria remain complete for
their stated scope. Current wrapper, generated-file, CLI, virtual-plugin,
official-config and source-map cases are included in the passing 10,555-test
codemod suite. The installed styled-components-to-CSS-Modules scenario now also
proves target typechecking, production build, SSR/hydration and base/hover browser
behavior. Plan 087 tightened the roundtrip harness and corrected additional
adapter defects; the original completion record did not prove universal reverse
recognition or every target API.

The 2026-09-29 counts and hashes above are historical capture evidence, not the
current ledger. The current empty-project ledger has 32 canonical identity
no-ops, 336 safe residual and 656 unverified captures. It is separate from 48
configured fixture-port scenarios and nine installed static React routes. The
current source fingerprints match across all three reports. Component-level
artifact map precision and conservative unsupported runtime semantics remain
intentional; no exact declaration locations are claimed.

Current broader checks: 1,050 root runtime tests and both benchmark suites pass;
the type-performance guard passes in isolation after a loaded run exceeded its
timing band. TSTyche passes 168 tests / 380 assertions. Codemod typechecking,
repository lint, generated/surface/proof-doc checks and artifact budgets pass.
Root typechecking still reports four unrelated playground implicit-any errors;
Knip still reports unrelated application/benchmark findings. Task-owned unused
exports were removed. These baseline failures are not reported as green.
