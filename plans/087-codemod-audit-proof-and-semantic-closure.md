# Plan 087 — codemod audit proof and semantic closure

## Context

Reviewed session `01a0e32d-32b8-7b41-b887-487dd8347a9c`: all 19 substantive
user requests and the last assistant message before each next user message or
session end. Intermediate agent updates, tool output, and reasoning were not
used as session conclusions. Repository inspection and one focused test run
provide independent current evidence as of 2026-09-30.

The session audited Chakra, Tailwind, StyleX, Pandwind, Tokenami, UnoCSS,
styled-components, MUI, and Panda. Request 9 produced
[Plan 086](086-codemod-migration-residual-closure.md); request 10 implemented
it. Later audits added more wrapper projections, official config handling,
priority preservation, stylesheet artifacts, and installed proofs. These are
existing capabilities, not proposals to rebuild.

Current baseline is JJ commit
`8e09ff287c1f29e02dacfd8fd9a48eb9597568ef`. This plan adds documentation only.

### Confirmed findings

1. **P0: silent Chakra style loss.** The existing test
   `emits literal responsive JSX styles as one static class` in
   `packages/codemod/tests/adapter-target-emission.test.ts:128` fails. Input
   contains `Box flex="1" minW={...}`; output contains native
   `<div flex="1" className={css.class({ minWidth: ... })} />` and reports no
   residuals. The focused file reports 94 passed, 1 failed. Root cause is not
   established; investigate official property discovery, matching, and lowering
   before choosing a repair. Adding a hardcoded `flex` exception is insufficient.
2. **P0: roundtrip assertion can accept an inert reverse leg.**
   `expectActionableRoundTrip` in `route-spec-support.ts:691` accepts
   `forward.changed` as an alternative to any reverse action after a clean
   conversion. That condition establishes no reverse behavior or equivalence.
3. **P1: generated files are not fed into reverse migrations.** For example,
   `roundtrips/pandwind-to-css-modules-to-pandwind.test.ts:32` sends only
   `first.code`, with original file identity, to the reverse adapter. Configured
   cases reuse the original project rather than a migrated project containing
   new artifacts and file changes. The session's request-18 conclusion explicitly
   acknowledges this limit.
4. **P1: primary ledger is a deliberately narrow capture.** Current report has
   32 canonical entries, 285 safe-residual entries, and 707 unverified entries;
   all 32 canonical entries are identity no-ops. It records 463 residuals across
   369 pairs: 93 configuration-dependent, 92 incompatible, 278 unverified.
   Primary inputs have no project configuration and an empty project index.
   These counts are evidence limits, not 707 proven implementation defects.
5. **P1: installed proof is directionally concentrated.** All 19 commands in
   `scripts/verify-installed-route-proofs.ts` target Pandwind. This is valuable
   inbound evidence, but does not certify Pandwind outbound or arbitrary
   foreign-to-foreign migrations. Other focused proofs may exist; inventory
   them before declaring a route unsupported or unproven.
6. **P2: completion records are historical.** Plan 086 reports 473 residuals
   and 732 unverified routes; current report records 463 and 707. Preserve the
   old completion capture as history, but make current evidence identity and
   freshness explicit. Large green matrix counts are fixture coverage, not
   universal canonicality or behavioral proof.

Relevant evidence: `plans/evidence/codemod-canonicality-audit.md`, its route
ledger, `scripts/verify-installed-route-proofs.ts`, route helpers, generated
roundtrip fixtures, and the installed-proof JSON files. No broad suite was run
during this investigation; prior session validation remains historical.

## Goal

Eliminate avoidable migration loss and residuals in the audited families, and
make every remaining claim correspond to explicit semantic and project proof.

Completion means every identified opportunity has either a verified
implementation or a reproducible, source-preserving limitation with a concrete
reason. It does not mean forcing all routes to zero residuals.

## What

Extend existing adapter-owned policies, project context, generated-artifact
workflow, and proof infrastructure. Cover every registered direction involving
the nine audited families; maintain shared regressions for other adapters.
Derive counts from the registry rather than freezing the current 32-adapter size.

### Session-derived opportunity inventory

| Priority | Opportunity                                   | Evidence and next action                                                                                                                                                                            | Conservative boundary                                                                                                                          |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Complete Chakra property transfer             | Reproduce `flex` failure; compare official system properties, shorthand resolution, component aliases, and actual matched declarations. Audit neighboring CSS properties.                           | Unproven style semantics retain their owning source host and typed residual.                                                                   |
| P0       | Honest roundtrip contracts                    | Replace permissive changed-forward shortcut with separate reversible, one-way, preserved, and incompatible expectations.                                                                            | Intentional no-op must prove exact stability and state why reverse recognition is unavailable.                                                 |
| P1       | Artifact-aware project roundtrips             | Reconstruct migrated project including generated files, renamed modules, rewritten consumers, and target config; reverse that project.                                                              | Missing project scope remains a context limitation.                                                                                            |
| P1       | Named rules and static maps                   | Ledger has 36 named-rule residuals. Exercise existing target map/host ports and sidecar paths with real consumers.                                                                                  | Do not fabricate standalone APIs for host-only targets.                                                                                        |
| P1       | Stylesheet and module sidecars                | Four stylesheet families each contribute 23 primary residuals; Treat and Vanilla Extract also lack module inventory in many captures. Check configured cases before adding emission.                | Exported component and module contracts must survive; CSS text alone is insufficient.                                                          |
| P1       | Reusable component completeness               | Extend shipped wrappers across supported carriers; cover cross-file imports/reexports, refs, polymorphism, attrs precedence, transient props, class/style merging, and custom component provenance. | React Strict DOM and native hosts remain incompatible where their contracts cannot represent the source.                                       |
| P1       | Host projections                              | MUI, Mantine, Chakra, StyleX, Tokenami, and framework routes still depend on proven hosts. Exercise intrinsic, imported custom, and hostless forms independently.                                   | No generic `sx()` invention, unknown component rewrite, or framework-reactivity erasure.                                                       |
| P1       | Conditions, tokens, and priority              | Check latest UnoCSS candidate generation, Tailwind important lowering, Tokenami selector/media alias handling, StyleX condition emission, and Chakra/MUI official metadata across target families.  | Missing/ambiguous config, unsupported priority, and class-based/relational conditions remain residuals unless exact target behavior is proven. |
| P2       | Composition and recipes                       | Extend beyond shipped static Tokenami compose subset: named style spreads, ordered StyleX arguments, recipe defaults/variants/compound variants, slot semantics, and class/style helper consumers.  | Preserve callable APIs, precedence, and consumers; never flatten away runtime behavior.                                                        |
| P2       | Bounded dynamic values and callbacks          | Investigate MUI theme callbacks, dynamic attrs, scalar expressions, conditional values, and runtime bridges using verified inputs.                                                                  | Do not execute arbitrary app callbacks during migration; calls/effects and unknown runtime context remain residuals.                           |
| P2       | Themes and component defaults                 | Preserve mode-varying tokens, providers, overrides, typography, layout defaults, and theme transitions through neutral semantic metadata where supported.                                           | Never pick one mode or flatten conditional token objects silently.                                                                             |
| P2       | Global CSS, keyframes, scoping, preprocessors | 84 primary residuals concern global selectors. Check target global-style carriers with verified roots; establish CSS Modules keyframe naming; invoke official Sass/Less compilation with imports.   | Keep cascade, animation-name linkage, selector scope, and stylesheet side effects; no unrelated class-map projection.                          |
| P2       | Import cleanup                                | Flat lane intentionally keeps old imports for possible side effects. Remove dead bindings using AST usage evidence while retaining needed side-effect imports.                                      | Module evaluation changes require proof; do not delete imports merely because styling calls changed.                                           |
| P2       | Source-map precision                          | Plan 086 documents component-level artifact maps because declarations lack locations. Preserve declaration and dynamic-expression provenance where transformations need it.                         | Report actual precision; never claim recovered spans are exact parse provenance.                                                               |
| P2       | All remaining adapters                        | Audit untouched family API cases using the same standards, ranked by residual cause and existing usage fixtures.                                                                                    | Fixture absence means missing evidence, not safe removal or forced conversion.                                                                 |

## Why

The confirmed Chakra failure demonstrates that zero residuals can coexist with
behavior loss. The current roundtrip guard can hide missing reverse support.
Better proof therefore precedes broad conversion expansion: otherwise new
green snapshots could certify the same unsafe behavior.

## How

### Conceptual model

Keep three independent dimensions: scenario coverage, semantic disposition,
and project proof. A route may support a configured static scenario while
preserving a dynamic scenario and lacking an installed target proof.

Use existing source adapters, neutral IR, target projection ports, registry,
project providers, artifact collector, and route-proof catalog. Add a named
internal port only for a genuinely replaceable policy, with a composition root
and substitution test. Preserve flat SwapIR fast paths.

### Operations / behavior

For each case: inventory source and target versions/configuration; migrate;
apply results to an in-memory project; validate source contracts and target
syntax; build or execute the target when eligible; compare behavior; then
record conversion or a specific limitation. Reverse migration receives that
resulting project, not just its original entry file.

Reversible cases compare normalized styles and component behavior, not source
text equality. One-way cases explicitly verify usable target output and a
stable, explained reverse disposition. Preserved cases assert exact source
preservation at the affected ownership boundary.

### Tech choices and trade-offs

| Choice             | Decision                                                                                                  | Trade-off                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Proof scope        | Cheap per-route syntax/API checks; installed behavioral proofs per policy family plus exceptional routes. | Running 992 full applications is expensive; a shared policy proof does not certify every route. Record both scopes. |
| Generated wrappers | Extend existing target-owned wrappers and artifacts.                                                      | More files and helper code are acceptable when they preserve contracts; measure runtime/CSS growth and deduplicate. |
| Config             | Official installed loaders and injectable project ports.                                                  | Requires project evidence; conservative fallback converts less but avoids guessed vocabularies.                     |
| Dynamics           | Static or bounded semantic lowering; target-native runtime carriers where proven.                         | Full arbitrary callback equivalence remains outside automatic migration.                                            |
| Tests              | Issue-first inline snapshots plus independent contract assertions.                                        | Snapshot updates cannot substitute for behavior checks.                                                             |
| Public surface     | Existing API and package exports remain frozen.                                                           | Any unavoidable new public contract needs a separate design note and explicit approval.                             |

### Architecture

Proof orchestration owns project application and reporting. Source adapters own
configuration and semantic normalization; target adapters own carrier and
artifact emission. CLI remains a composition root. Optional ecosystem packages
resolve from the fixture/migrated project; do not add them to runtime bundles.

## What this allows

- Credible reversible migrations with generated sidecars and consumers.
- More zero-residual conversions when verified project and target semantics allow them.
- Reusable wrappers whose exported behavior is tested, not just parsed.
- Route-specific explanation of missing proof versus actual incompatibility.

## What this does not allow

- Treating every existing residual as a bug or every passing snapshot as canonical output.
- Implicit app-code execution, guessed vocabularies, or silent theme/host changes.
- Backward compatibility shims for replaced internal contracts.
- Rebuilding already shipped Plan 086 functionality without a reproduced gap.

## UI & UX

Use existing CLI/preview surfaces. Group residuals by root cause, source span,
affected files, and actionable remedy. Distinguish required configuration,
unsupported semantics, and missing proof. Preview generated files and consumer
rewrites before write mode; virtual bundler migrations never write source files.

## Data model

Extend existing evidence contracts only where needed: scenario id, source/target
version and configuration identity, source revision/content fingerprint,
project files and artifacts, expected directionality, semantic comparison,
proof stages/results, residual cause/disposition, and reproduction command.
Generate evidence and report together from their source of truth. Keep
historical captures identifiable. Do not maintain parallel hand-edited counts.

## Implementation steps

Each step is a focused, described JJ revision or a small domain-specific stack.

1. **Baseline and case inventory.** Capture current revision, focused failures,
   registry, proof catalog, scenario coverage, and grouped residuals. Link all
   nine family audit conclusions to current fixtures. Reclassify apparent gaps
   already solved by later commits. Do not refresh evidence until source checks
   are known to represent the intended implementation.
2. **Repair Chakra silent loss.** Reproduce existing failure; establish a
   falsifiable root cause; add neighboring official-property and custom-property
   cases, unavailable-metadata cases, and non-Chakra prop preservation. Fix at
   the source vocabulary/lowering owner. Verify emitted CSS and browser flex
   behavior using the compiler regression skill.
3. **Strengthen directional assertions.** Add negative harness tests proving an
   inert reverse pass, lost named rule, and deleted declaration cannot pass a
   reversible expectation. Replace implicit fallback with explicit per-scenario
   disposition. Regenerate fixtures through their generator and review changes.
4. **Make project roundtrips artifact-aware.** Apply entrypoint changes, generated
   files, file identities, imports, and target configuration to an isolated
   in-memory project. Test one/repeated/conflicting artifacts, nested and root
   paths, consumer reexports, idempotence, and preview/write parity. Feed this
   project into reverse migration and compare semantic behavior.
5. **Close static map, sidecar, and wrapper gaps.** Rank named-rule and artifact
   causes, reproduce configured cases, then fix only missing target projections.
   Verify exports/types, refs, props, attrs, polymorphism, filtering, and merging
   across files. Validate default runtime and generated CSS size before/after.
6. **Close config and semantic gaps.** Run configured/missing/broken/custom config
   scenarios for all nine families. Cover conditions, token ambiguity, theme
   modes, utility generator evidence, breakpoints, source numeric rules,
   declaration order, fallback arrays, and priority. Add capability boundaries
   rather than changing expected residuals to hide unsupported semantics.
7. **Implement justified richer projections.** Evaluate composition/recipes,
   bounded dynamics, global styles, keyframes/scoping, preprocessors, and import
   cleanup from the inventory. For each item, implement verified target-native
   behavior or record a concrete conservative limitation with a regression case.
   Keep provenance through transformations and document map precision.
8. **Broaden installed target proof.** Inventory existing proofs first. Add
   Pandwind outbound and foreign-to-foreign cases covering object props, class
   strings, styled components, CSS Modules, compile-time style modules, utility
   generators, and supported framework hosts. Prioritize changed policies and
   the nine audited families. Verify exact-version typecheck/build, SSR and
   hydration where applicable, and computed styles/interactions. Pin inputs and
   carry revision fingerprints; never promote a route on a family proof alone.
9. **Refresh evidence and maintenance.** Regenerate route tests and canonicality
   ledger/report; include configured scenarios and actual proof scope. Correct
   misleading completion language, preserve dated captures, update architecture
   and SDK contracts, and fix task-owned Knip findings at their owner.
10. **Final acceptance.** Run affected files first, then the codemod suite, root
    tests, typechecks, lint, format, Knip, generated/surface/proof-doc checks, and
    impacted installed proofs. Investigate suite timeout behavior separately
    from runtime throughput guards; report unresolved baseline failures without
    relabeling them green. Reconcile every inventory item and record evidence
    and deliberate limits in the final revision.

## Open questions

No user decision blocks investigation or the internal fixes above. Exact
callback/theme/recipe subsets and host support are implementation discovery
questions: resolve against installed official packages and source-specific
fixtures. If a public API addition becomes necessary, stop that dependent item
for explicit approval after preparing its design; continue independent work.

## Acceptance criteria

- [x] Chakra responsive fixture passes; `flex` reaches CSS and is absent as a stray DOM prop.
- [x] Official-property coverage and unavailable metadata paths prevent silent style loss.
- [x] Reversible expectations reject inert reverse legs and changed-forward-only evidence.
- [x] Reverse migrations read generated artifacts, correct file identities, and rewritten consumers.
- [x] Semantic comparisons catch lost declarations, conditions, priority, named styles, and component behavior.
- [x] Every opportunity above is implemented with proof or has a reproducible, justified limitation.
- [x] Clean configured cases assert zero unexpected residuals; conservative cases assert typed reasons and preservation.
- [x] Wrappers preserve supported exports, props, refs, attrs, filtering, and polymorphic behavior across files.
- [x] Installed proof includes outbound and foreign routes; evidence states exact route/version/scenario scope.
- [x] Ledger/report reflect the tested revision; identity no-ops cannot inflate cross-adapter canonicality claims.
- [x] No frozen API expansion, guessed vocabulary, hidden framework branch, or forced rich-IR overhead.
- [x] Focused JJ history, architecture documentation, required checks, and unresolved limitations are complete.

## Decisions log

| Date       | Decision                                                              | Rationale                                                                                  |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2026-09-30 | Follow up Plan 086 rather than reopen or duplicate it.                | Wrappers and artifact infrastructure shipped; current gaps concern completeness and proof. |
| 2026-09-30 | Fix silent loss and proof assertions before reducing residual counts. | Existing zero-residual output demonstrably loses styling.                                  |
| 2026-09-30 | Keep implementation separate from this revision.                      | User authorized investigation and planning only.                                           |

## Implementation reconciliation — 2026-09-30

The nine source-session audit conclusions are represented by the registered
primary API fixtures and the family audit tests. The new configured capture
runs 48 inbound/outbound scenarios between Pandwind and the eight foreign
families, in missing, blue, and amber contexts. These are injected configuration
ports, not 48 installed projects. A missing-context no-op records exact source
stability and lack of recognition; it is not counted as conversion proof.

| Inventory item                     | Result and executable evidence                                                                                                                                                                                                                                                 | Deliberate limit                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chakra property transfer           | `chakra-migration-audit.test.ts` checks the official system predicate for flex, alignSelf, order, disabled metadata, and unrelated attributes. The installed target runner includes Chakra-to-Emotion flex.                                                                    | Unknown configuration remains source-owned.                                                                                                                                                     |
| Honest roundtrips                  | `route-proof-contract.test.ts` rejects inert reverse legs, missing declarations/rules, altered conditions, and dropped priority.                                                                                                                                               | Canonical CSS cannot prove two identically styled exported bindings are interchangeable; consumer/type checks remain separate.                                                                  |
| Artifact-aware projects            | `createReverseRouteInput` applies entrypoint extensions, expected-content file changes, artifacts and preserved loader metadata. Contract tests reject stale/conflicting content and retain reexports. Generated roundtrip suites reverse generated files at their real paths. | An artifact-only route proves reverse stylesheet recognition and stable consumer code, not reconstruction of an original component API from CSS alone.                                          |
| Named rules/static maps            | Pandwind groups use named-rule objects across targets; Panda preserves actual recipes without mistaking groups for recipes. Child emission residuals propagate instead of producing empty entries.                                                                             | Unsupported font-face children retain a typed residual (`route-proof-contract.test.ts`).                                                                                                        |
| Sidecars                           | Vanilla Extract pseudo/selector styles use its documented selectors carrier. Installed styled-to-Vanilla-Extract and CSS Modules routes compile sidecars and their consumers.                                                                                                  | Missing module/consumer inventories preserve source (`stylesheet-source-adapters.test.ts`).                                                                                                     |
| Reusable wrappers                  | Same-line declarations are recognized by AST-verified bindings. `styled-components-css-modules-wrapper.test.ts` verifies reusable exports, polymorphism, typed refs, attrs precedence, transient props, source units and declaration order.                                    | Callback attrs, attrs-selected unknown hosts, dynamic component styles and malformed modules are explicit preservation tests in that file.                                                      |
| Host projections                   | Installed Pandwind-to-MUI covers a target object prop; class, wrapper and compile-time carriers have separate installed scenarios. Family matrices cover intrinsic/custom/hostless inputs.                                                                                     | Unknown hosts and incompatible framework semantics stay residual; no invented generic sx function.                                                                                              |
| Conditions/tokens/priority         | Semantic continuity normalizes equivalent CSS units, retaining ordered declarations and wrappers. Mantine variables recover only uniquely verified property-aware tokens. UnoCSS checks generated candidate semantics.                                                         | Chakra numeric spacing strings without token evidence are residual; priority and unproven generator output stay source-preserving. Official context tests cover missing/failed loaders.         |
| Composition/recipes                | Existing `tokenami-unocss-adapters.test.ts` proves the bounded static compose and Panda recipe subsets; named maps no longer accidentally collapse into recipes.                                                                                                               | The test “preserves Tokenami compose variants instead of flattening them into declarations” records the unsupported callable contract. No recipe API expansion.                                 |
| Bounded dynamics/callbacks         | `semantic-metadata.test.ts` verifies dynamic provenance and native function carriers; `styled-components-audit.test.ts` proves documented prop callbacks.                                                                                                                      | Function values never become strings; non-function dynamic values and callback attrs remain typed residuals. Arbitrary callbacks are not executed.                                              |
| Themes/defaults                    | `semantic-metadata.test.ts`, `theme-scopes.test.ts`, and official token catalogs retain theme context and variables.                                                                                                                                                           | Conditional token objects are not flattened into static catalogs; resolved theme selection is required. Provider/theme transitions are outside the nine static installed scenarios.             |
| Global CSS/keyframes/preprocessors | `stylesheet-source-adapters.test.ts` covers layers, supports, nesting, keyframes/font faces, transitive imports, official Sass/Less ports and extension rewrites. Tamagui rejects global rules instead of emitting inert nested props.                                         | CSS Modules composition, global Sass needing unproven consumer rewrites, and unavailable compilers are explicit preservation tests. Animation scoping is not inferred across missing consumers. |
| Import cleanup                     | Shared source/target css bindings retain target ownership; static rewrite tests assert required imports survive.                                                                                                                                                               | Flat-lane source imports remain when side effects are not proven absent. Removing them is not authorized by an unused styling call alone.                                                       |
| Source-map precision               | Existing semantic source-map metadata remains intact; generated artifact maps retain the component source span. Preprocessor tests carry compiler maps.                                                                                                                        | Declaration spans cannot be invented from component spans. Exact declaration-level artifact mapping remains unsupported and documented rather than claimed.                                     |
| Remaining adapters                 | All generated directional/roundtrip cases use the strengthened harness and family API matrix.                                                                                                                                                                                  | Fixture safety does not promote installed maturity or imply arbitrary ecosystem API support.                                                                                                    |

No runtime public API was added. The bootstrap loader port is internal and
injectable; the default remains project-root official resolution. Source-only
bootstrap tests explicitly substitute an unavailable-package loader and exercise
the deterministic fallback. The malformed static Panda fixture was repaired.
The end-to-end Panda test now checks official default tokens instead of expecting
them to be unknown.

Evidence ownership: `codemod-configured-audit.json` captures injected scenarios;
`codemod-installed-targets.json` captures exact installed route inputs, outputs,
versions, typechecks, builds, SSR/hydration, base/hover browser comparison and CSS
sizes; `panda-installed-proof.json` adds canonical source/target checks. The
primary ledger stays an empty-project capture and separately counts identity
routes. None of these reports promotes route maturity automatically.

## Completion evidence — 2026-09-30

All ten implementation steps are reconciled above. Unsupported richer behavior
has executable preservation cases and explicit limits; completion does not mean
all routes can convert or reconstruct original APIs.

- Full codemod: 10,555 tests, zero failures. Generated directional/roundtrip
  subset: 8,928 tests, zero failures. Configured capture: 48 cases with exact
  conversion or residual-kind expectations and source preservation assertions.
- Installed target proof: nine exact routes, all typecheck/build/SSR/hydration
  and base/hover comparisons pass with zero changed pixels. Chakra flex is
  `1 1 0%`, align-self is `stretch`, order is `2`, and target SSR markup has no
  stray flex attribute. UnoCSS's grouped selectors and functional pseudos have
  an explicit resolver regression test.
- Root: 1,050 runtime tests plus both benchmark suites pass; the type-performance
  test passes isolated. A concurrently loaded run exceeded the check-time band
  (0.141s versus 0.129s limit); the baseline was not raised. TSTyche: 168 tests,
  380 assertions, all pass.
- Codemod typecheck, lint, format, package surface (107 exports), generated
  freshness, generated budgets, proof documentation and 19 installed inbound
  route evidence gates pass. The current API and default runtime source remain
  unchanged by this work; emitted asset/SSR and browser inline style-text sizes
  are reported per installed scenario. Zero asset bytes do not mean a runtime
  CSS-in-JS target emits no CSS. Browser inline text includes shared reset styles
  and does not count CSSOM-only insertion.
- Broader baseline: root typecheck reports implicit-any parameters in playground
  `EditorPane.tsx` and `router.tsx` (four errors). Knip reports existing app,
  benchmark and unrelated library findings; task-owned unused exports were
  removed rather than suppressed. No sibling workspace was moved.

The primary ledger has 1,024 captures: 32 identity canonical, 336 safe residual,
656 unverified, 645 typed residuals across 420 pairs, with no ambiguous/unlocated
residual span. Cross-adapter primary canonical count is zero. Higher residual
counts reflect honest missing configuration and stronger checks, not degraded
conversion success. Configured and installed captures remain separately scoped.
