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

Migration skips are typed at this boundary. `capability-blocked` means the
selected target has no safe representation for a required semantic;
`parse-residual` means the source adapter could not model the source; and
`lowering-residual` means the semantic program was understood but no registered
lowering could represent it for that target. The source is preserved in all
three cases. A generic `adapter capability mismatch` marker is not a valid
diagnosis.

## Official project configuration

Project-aware migration must ask the ecosystem's own packages to interpret
custom configuration whenever an official loader is available. This preserves
presets, plugins, merged themes, shortcuts, and generated token semantics that
cannot be recovered safely by reading source text.

The adapter owns this policy behind its optional asynchronous
`loadConfigAsync(context)` port. The context supplies the migrated project's
root, while `ProjectModuleLoader` resolves packages and config modules from
that root. The migration CLI and other project-aware runners use
`runAdapterMigrationAsync`; the synchronous entry point remains the
deterministic fast path for callers that already provide config or do not need
host evaluation.

| Ecosystem | Official integration              | What it contributes                                                  |
| --------- | --------------------------------- | -------------------------------------------------------------------- |
| Panda     | `@pandacss/config`                | resolved config, presets, plugins, merged theme/conditions/patterns  |
| Tailwind  | `@tailwindcss/node`               | loaded design system and generated utility/token view                |
| UnoCSS    | `@unocss/config` + `@unocss/core` | project config, presets, rules, shortcuts, and generated utility CSS |
| Chakra UI | `@chakra-ui/react`                | merged system config and token variable resolution                   |
| Tokenami  | `@tokenami/config`                | normalized project config and aliases                                |

These packages are optional integration dependencies, not Pandwind runtime
dependencies. If they are absent, the adapter uses its documented deterministic
fallback. If an official loader is present but fails, the adapter records a
configuration residual so a migration cannot claim that custom semantics were
fully handled. Loader tests use `ProjectModuleLoader` substitutions, and at
least one installed-package fixture covers each official integration.

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

Host projection is negotiated per use site, not inferred from the presence of
an adapter. A target policy declares the representation for a bound host
(`class`, `component`, or a target style prop) and may declare a different
representation for a standalone exported component. The runner selects that
policy only when the source has a real host use; otherwise a target-native
component expression can be preserved. This distinction prevents a
class-string API from being called as a component, prevents a component
factory from being assigned to `className`, and lets a target such as MUI
rewrite `className={card}` to its host-owned `sx={card}` prop.

The target policy owns the final host rewrite. It receives the normalized
program, emitted expression, framework, binding, and selected representation;
the shared runner only applies the returned edit and records its residuals.
This keeps target-specific prop names and host syntax out of migration
orchestration.

An explicit host-policy refusal is terminal for that use site. If a target
resolver returns no representation for the detected framework or host shape,
the runner does not fall back to the target's default representation and emit
code that will only fail during validation. It preserves the source and emits
an actionable `host-framework` residual. A route whose source and target
identities are equal is instead an identity no-op; it does not renegotiate
capabilities or manufacture a new representation.

Targets that require a host use declare that requirement in the same policy.
For example, MUI's `sx` carrier sets `requiresHostContext`; a bare style value
therefore stops before target emission with the adapter-owned explanation that
an `sx` prop must be attached to a component. This keeps “no standalone API”
as a target contract rather than a special case in the route runner.

Target-native component projections may also constrain the host language. For
example, the MUI adapter emits `styled("div")({...})` for a React component
subject and declares that React as its supported host framework. A Solid or
Vue subject therefore remains source-preserving with a framework residual until
an explicit cross-framework host adapter is registered; it is never emitted as
React-shaped code by accident.

The same rule applies to Stitches and styled-components: their `css`/`styled`
targets produce React component values, not class strings. Class-oriented
targets and component-oriented targets therefore use different typed host
representations, even when both produce equivalent declarations in the
semantic program.

Pandwind's own target adapter can preserve a standalone styled subject without
retaining the source runtime. When a static subject has no local host use, the
target selects a component representation and emits a static `css.class(...)`
carrier inside a host-native wrapper. React-family and Solid wrappers use JSX;
Vue uses `defineComponent`/`h`, with generated imports kept inside the
component's `<script setup>` block. A dynamic subject follows the same route
but uses Pandwind's runtime variable carrier only for the dynamic expression.

StyleX is a class-oriented target with a React-specific host projection. When
an intrinsic styled subject is used as `<Card />`, its static declaration is
emitted as a StyleX style object and the target component port rewrites the
use to `<div {...stylex.props(Card)} />`. The target owns this rewrite because
StyleX's `stylex.props` result is not a DOM `className` string. A non-React
host or an unsupported attribute shape remains an explicit host residual.

JSS uses the same class representation through a target-owned stylesheet
carrier: static styles become
`jss.createStyleSheet({ style: {...} }).attach().classes.style`, and existing
React `className` uses remain class uses. This keeps JSS's imperative rule
application semantics explicit while avoiding an invalid conversion to a
`react-jss` hook at a module-level class site.

A Style9 target uses the same class port with its own callable contract:
`style9(style9.create({ style: {...} }).style)`. The shared runner does not
need to know that Style9 wraps a named style object before producing a class;
the Style9 adapter owns that target emission and its React host declaration.

React Native uses a different target-owned representation. Static styles bound
to a React Native host are emitted through
`StyleSheet.create({ style: {...} }).style`, and the host adapter rewrites the
binding from `className={card}` to `style={card}`. The runner must detect the
`react-native` import before applying that rewrite; a normal React JSX file is
not silently treated as React Native. This illustrates the general rule:
semantic IR preserves the style meaning, while the target and host ports own
the valid carrier and attribute syntax.

`StyleProgram.sourceMap` is the provenance projection for a semantic program:
it aggregates the program, rule, theme/composition, and dynamic-value source
locations without forcing legacy `SwapIR` callers to pay for rich nodes.
Recipe and component semantics live in the separate versioned recipe IR and
host adapter contracts; they are not represented as unstructured residual
strings.

Named style maps are represented as named `style` rules and negotiated through
the separate `named-rules` capability. They are not encoded as CSS `named`
conditions: a JSS/StyleX/Aphrodite map such as `{ button: {...} }` has a
different runtime contract from a responsive or variant condition. Targets
that cannot emit a named class map receive an explicit `named-rules` residual;
they must not flatten the map into one class and silently break `styles.button`
lookups.

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
capabilities. `createAdapterContractSuite()` remains the focused contract
checker for detection, configuration, parsing, emission, validation, and
target capability declarations. `createAdapterConformanceSuite()` is the
stronger reusable gate: it runs those adapter-owned phases and the complete
ordered source/target matrix in safe and partial modes over happy, edge, and
malformed fixtures. Capabilities are judged during target negotiation, not
against a source adapter's own semantic metadata. A minimal injected registry
is tested through the same runner, so adding an adapter does not require
changing migration orchestration.

Semantic lowering is versioned with `StyleProgram /4`. Dynamic declarations
retain expression kind, source range, dependency names, and explicit
static-evaluation evidence. The lowering registry handles resolved theme
bindings, custom-property fallback, composition flattening, plugin transforms,
runtime context, and framework metadata. Its `plan()` result records the
selected representation (`static`, target-native, custom-property,
runtime-carrier, or residual) and the representations the target contract can
negotiate. A migration result also retains one lowering plan per parsed source
match, so diagnostics, IDE tooling, and proof runners can inspect why a route
selected a representation instead of inferring it from generated text. A
target-native plan may explicitly resolve a partial capability only for the
semantic node it validated; partial support is never treated as a blanket
promise for the whole target. Source and target adapters may contribute scoped lowering ports;
the migration runner composes them without an ecosystem switch. A target
adapter receives an optional semantic observation on `AdapterEmitResult` when
an opaque runtime registration cannot safely be reparsed; validators compare
that observation rather than pretending the emitted call is a static class.

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

Codemod route verification is owned by `packages/codemod/proof`. Its contract
and scenario fixtures are shared by the Vitest suites and the offline proof
composition root, so the two gates cannot silently use different corpora. The
complete matrix covers every ordered adapter pair in safe and partial modes
for happy, edge, and malformed inputs; the CLI e2e suite additionally spawns
the real binary in both directions for every adapter. A route is accepted only
when it converts or preserves the source with a typed residual.
`createAdapterConformanceSuite()` adds the direct adapter-owned gate before the
route matrix: each registered adapter must independently pass detection,
configuration, parsing, emission, and validation against its happy fixture.
Source-side semantic metadata is not judged as a target capability; that
negotiation remains an ordered-route concern.
The pinned real-repository report adds a typed promotion object with explicit
`source-static`, `source-mismatch`, `runtime-pending`, and `pipeline-unpaired`
states. A pending dimension is never counted as a passing real-repository
promotion.

Backends follow the same rule. CSS, object, React Native, and OpenTUI are
registered as `StyleBackendFactory` plugins and are exercised by the generic
`StyleBackendContractSuite`. The suite checks construction, capability
publication, representative lowering, and stable repeated declarations; a
new backend can be substituted in a local registry without changing the
design or runtime orchestration.

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
runner executes them. `pnpm pivot:proof:installed` is the reproducible
installed-adapter runner: it installs the pinned Goober package in a disposable
project, migrates the corresponding real-repository fixture, compares SSR CSS,
and exercises base/hover states in Chromium. Its report is promoted only when
the migration is residual-free, CSS is no larger, and browser pixels match.

The promotion matrix intentionally mixes full documentation-site claims with
smaller installed-adapter claims. A fixture claim proves the adapter contract
in a real package/runtime, but does not imply that every application using that
ecosystem has been migrated; site-level claims remain separately identified.

The adapter-reference runner is the intermediate proof layer for all pinned
ecosystems. It reads the exact source file from the detached checkout, resolves
the source and target through the adapter registry, validates the semantic
program, and compares it in Chromium. It reports `adapter-program` evidence
separately from an installed application promotion. Official ecosystem
configuration is loaded through the adapter's `ProjectModuleLoader`; reference
projects receive only explicit, pinned packages via `pnpm references:deps`.
This keeps project presets, CSS theme variables, and generated utilities in the
official-loader path without vendoring or silently substituting Pandwind's
fallback resolver.

Knip intentionally ignores the `pandwind-codemod` dependency in the
playground. The playground imports the browser-only public subpath
`pandwind-codemod/swap/browser`; Knip cannot follow that workspace package
subpath through the source-package boundary, while the playground build and
browser tests do. The codemod subpath is listed as a production entry in
`knip.json`, so its exports remain owned and checked.

The styled-components documentation site is also a reproducible acceptance
corpus. Its pinned checkout is never edited. The migration runner exposes two
target lanes over the same source adapter:

```sh
pnpm exec tsx scripts/migrate-styled-components-docs.ts runtime-css /tmp/pandwind-styled-runtime
pnpm exec tsx scripts/migrate-styled-components-docs.ts design-css /tmp/pandwind-styled-design
```

The runner owns disposable materialization and lane accounting; the adapter
owns styled-components template/object parsing, subjects, `.attrs`, globals,
keyframes, and framework rewrites. `scripts/verify-styled-components-docs.mjs`
then checks the pinned baseline and migrated applications in the browser and
records route, hydration, screenshot, and CSS-size evidence. This proof is
kept as a script and a pinned reference rather than as a vendored website.
