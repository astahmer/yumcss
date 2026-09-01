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

An HIR cannot by itself make every route native. It preserves the source
meaning, provenance, conditions, and runtime context; the target adapter still
has to own a legal representation for that meaning in the target API and host
framework. The route contract is therefore bidirectional and lossless rather
than naively native in every case: choose a static target representation when
possible, then a target-owned portable or runtime carrier when it is proven,
otherwise preserve the source and report the exact typed residual. A skip is a
real capability gap only when that negotiation has exhausted the target's
declared representations; it is not a license for the runner to drop a style
or silently coerce a component into a class string.

The migration result also exposes one typed outcome per matched program. The
outcome is `static`, `target-native`, `host-runtime`, `portable-artifact`, or
`residual`, alongside the selected representation. This is deliberately
separate from the capability report: a target may begin with a partial
capability and still resolve it through a target-owned host or lowering port.
Tooling should display the outcome and residual detail, not collapse the
decision into a generic capability mismatch.

Class-valued targets may opt into the shared `dynamicClassCarrier` target
contract when their emitted stylesheet can preserve `var(...)`. In safe mode
this lowers scalar dynamic values to static CSS custom properties and asks the
host adapter to bind the original expression. The opt-in is adapter-owned and
requires a substitution test; it is not a blanket permission for the runner to
reinterpret function-valued styles or overwrite an existing style prop.

The same class-host port handles source systems whose style match is the whole
JSX opening tag, such as `<Box bg={theme.foreground} />`. The target emitter
produces its class expression first; the host projection then removes the
source style prop, attaches the target class, and binds the original scalar
expression through an inline custom-property style object. This keeps the
runner generic: class adapters opt in through `dynamicClassCarrier`, while
Tailwind and UnoCSS retain their own utility-token emitters. A registry
substitution test proves that a new class adapter receives the projection
without adding a central adapter branch.

The same contract applies to a dynamic styled subject such as
`const Card = styled.div({ color: theme.foreground })`. When the target is a
class carrier, the generated CSS remains static (`var(--pandwind-dynamic-*)`),
and the subject becomes a small host wrapper that binds the original
expression. The JSX use stays `<Card />`; assigning the generated class string
to `Card` or rewriting the use to `className={Card}` would change the public
component shape and is therefore invalid. This projection is selected by
registry normalization and covered for every built-in dynamic class carrier.

Runtime-capable targets make the same distinction for scalar expressions. A
target-owned runtime object such as Chakra's `css()` or MUI's `styled()` may
preserve a scalar expression when the expression remains in the source lexical
scope; the adapter marks that representation explicitly so validation does not
count the preserved IR residual as a failed conversion. This does not bless
function-valued callbacks, provider-specific theme lookups, or framework-only
bindings: those still require a target wrapper or an explicit residual.

Next-yak uses the same contract for scalar template values: a styled subject
with a host use stays a Next-yak `styled` template, while a hostless template
can use the target's runtime `css` carrier. The template serializer preserves
the interpolation delimiters, and the target parser's matching residual is
excluded from validation only because the target explicitly owns that runtime
representation.

Mantine uses its host `style` prop for dynamic JSX style programs. Standalone
programs use the portable Pandwind artifact because Mantine does not expose a
general standalone style factory; the adapter no longer emits a fabricated
standalone API for that case.

Cross-framework and cross-backend migration uses an explicit host-conversion
port. A target declares native host frameworks separately from
`hostFrameworkConversions`; the latter describes a source host dialect that it
can rewrite into the target dialect. React Native currently owns the narrow
static React layout-host conversion: known `div`/`Box` hosts lose their source
style attributes, become `View` hosts, and receive the emitted
`StyleSheet.create` style prop. Unknown tags, existing style props, dynamic
declarations, and other DOM behavior remain typed `host-framework` residuals.
This keeps host portability target-owned and prevents the semantic runner from
pretending that a CSS declaration alone proves runtime or platform parity.

Standalone static Next-yak and Solid-styled intrinsic subjects use the same
React Native component representation: the target emits a `View` wrapper with
a `StyleSheet.create` carrier, so a declaration without a local JSX use does
not become an unusable style object. The Vue-styled target also owns a
conservative static Solid JSX-to-Vue SFC projection. Reactive Solid
primitives, control-flow components, and framework directives remain guarded
residual cases rather than being rewritten as ordinary JSX.

Target semantic projections are retained through named-map emission as well as
single-value emission. This matters for token-oriented targets such as Chakra:
CSS-origin numeric dimensions are normalized to pixel literals before Chakra's
token normalizer runs, while values originating in Chakra/Mantine/Panda retain
their token semantics. Validation compares the target semantic projection, so
this is a real equivalence proof rather than a canonical-CSS exception.

The host rewrite contract carries both facts when they differ: `framework` is
the target dialect used to validate emitted code, while `sourceFramework` is
the original dialect used by the target-owned source rewrite. A conversion may
also provide `canConvert`, so a `.tsx` file that happens to use Solid-only
signals, directives, or `class=` syntax is not mislabeled as React-compatible.
The route remains source-preserving with a typed residual until a real dialect
rewrite exists.

The static Vue projection is now implemented by target adapters that can
consume a React-compatible host shape. A valid `.vue` document is rewritten to
the target host dialect and reports a target `.tsx` extension; the CLI writes
that result beside the source and removes the old SFC only after the output is
created successfully. Vue `script setup` reactivity, directives, slots, extra
blocks, and malformed trailing source fail the guard and keep the original
`.vue` source intact.

Solid-styled and Vue-styled own the corresponding static React component
projection. A React `styled.div` subject with only static declarations can be
emitted as the target's styled component subject while preserving its simple
JSX component use. They also preserve a single callback-valued style body by
emitting the target's callback form; free scalar theme values, mixed callback
contexts, React-specific props, and template-only behavior remain
source-preserving until the target runtime and host semantics are proven.

Framework metadata is only a capability requirement when the program carries
host or component semantics. Standalone style carriers retain framework
provenance in the IR but do not need a framework-specific target rewrite. Each
runtime-capable adapter must opt into exact dynamic support in its own adapter
module and prove that its emitted carrier preserves the authored expression;
the generic adapter runtime remains conservative by default.

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
| Source documents      | language scanner registry plus Node workspace expansion/read/scan                                                                            | `source-scanner.ts`, `source-workspace.ts`; analyzer, Vite, codemod, and Tailwind collection consume this workspace                                                                |
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

The source workspace owns filesystem expansion and document reads. Its default
query returns only files claimed by a registered source-language adapter;
callers that intentionally need non-script assets, such as CSS imports for
theme crawling, opt into `includeUnsupported` at the workspace boundary. Vite
CSS extraction uses the same workspace for its file set, and codemod host
selection uses the scanner's language result instead of maintaining extension
checks. Filesystem access in a CLI composition root or in the workspace
provider is therefore infrastructure; parser and framework policy stays in
the scanner or owning adapter.

Function-valued style calls use the same shared parser port as the generic
adapter runtime. `FunctionStyleCallParser` balances the actual invocation,
normalizes arrow parameters, preserves the styled subject and source pattern,
and records function-valued declarations in the semantic program. Styled
Components, Emotion, Solid, and Vue adapters provide only their call patterns
and subject policy; they do not duplicate invocation parsing. This keeps a
target-native function carrier or a framework wrapper selectable by the
lowering/host ports, while malformed calls remain source-preserving parse
residuals.

The route catalog projects both modern adapters and the core nested dialects
into one style-system registry. `panda/tw`, `panda/dss`, `panda/css`, and the
corresponding `pandwind/*` dialects therefore use the same source/target route
ports as external ecosystems. The old `SwapIR` registry remains only as an
internal compatibility projection for the fast flat CLI path; it is not a
second rich migration architecture.

The flat path is fail-closed as well. A target emitter may return text and a
residual, but the runner only applies that replacement when the residual is
explicitly marked as preserved by a target carrier such as `$raw` or a runtime
escape hatch. Ordinary unknown utilities, dynamic values, and unrepresentable
declarations keep their original call and receive a typed skip marker. This
prevents a plausible-looking empty or partial target object from hiding a
semantic loss while still allowing intentional escape hatches to remain useful
and reportable.

Host projection is negotiated per use site, not inferred from the presence of
an adapter. A target policy declares the representation for a bound host
(`class`, `component`, or a target style prop) and may declare a different
representation for a standalone exported component. The runner selects that
policy only when the source has a real host use; otherwise a target-native
component expression can be preserved. This distinction prevents a
class-string API from being called as a component, prevents a component
factory from being assigned to `className`, and lets a target such as MUI
rewrite `className={card}` to its host-owned `sx={card}` prop. Intrinsic DOM
hosts are wrapped as `Box component="..."` first, because `sx` is not a DOM
attribute; static unknown custom components can use MUI's portable artifact
fallback, while dynamic ones remain residuals unless the source proves that
they are MUI components.

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
For example, MUI's `sx` carrier sets `requiresHostContext`; a static bare style
value therefore selects the MUI adapter's portable-artifact representation and
emits Pandwind's static `css.class(...)` carrier rather than inventing an
`sx()` API that MUI does not have. Dynamic bare values use the same portable
carrier as an explicit runtime fallback; dynamic values with an unknown host
still stop with the adapter-owned explanation that an `sx` prop must be
attached to a component.
When the source host is an intrinsic element, the same target port emits
`Box component="..."` so the rendered element remains equivalent. This keeps
the rule and its fallback under MUI ownership as target contracts rather than
special cases in the route runner.

Target-native component projections may also constrain the host language. For
example, the MUI adapter emits `styled("div")({...})` for a React component
subject and declares that React as its supported host framework. Solid-styled
and Vue-styled separately own the narrow static React JSX projection for their
component targets; dynamic values, React-specific props, and files requiring a
template rewrite remain source-preserving until those semantics are modeled.
No target is emitted as React-shaped code by accident merely because its style
declarations are parseable.

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
runtime-carrier, portable-artifact, or residual) and the representations the
target contract can negotiate. A migration result also retains one lowering plan per parsed source
match, so diagnostics, IDE tooling, and proof runners can inspect why a route
selected a representation instead of inferring it from generated text. A
target-native plan may explicitly resolve a partial capability only for the
semantic node it validated; partial support is never treated as a blanket
promise for the whole target. Source and target adapters may contribute scoped lowering ports;
the migration runner composes them without an ecosystem switch. A target
adapter receives an optional semantic observation on `AdapterEmitResult` when
an opaque runtime registration cannot safely be reparsed; validators compare
that observation rather than pretending the emitted call is a static class.

Class-oriented targets may also implement a named-map projection. Tailwind's
adapter accepts a program such as `{ button: { color: "red" } }` and emits a
map of class strings, allowing JSS, StyleX, Aphrodite, and Style9 named rules
to cross that boundary without flattening the rule name. The reverse parser
recognizes the same map, including conditional arbitrary utilities such as
`hover:[color:red]`; bracket-aware token splitting is part of the UnoCSS and
Tailwind adapter contracts rather than a runner special case.

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
the real binary for all 676 ordered pairs, passing the three scenarios through
each pair in both directions. A route is accepted only when it converts or
preserves the source with a typed residual. Run the expensive public-boundary
proof with `pnpm --filter pandwind-codemod test:e2e`; the normal coverage gate
runs the same route corpus in-process.

The playground uses this same registry-backed runner in `safe` mode. Its Vue
sample includes a `<template>` host so the static SFC projection is exercised;
reactive or directive-bearing examples correctly display a typed residual. If
a stale generated comment literally says `adapter capability mismatch`, it is
from an older build or migration artifact: current semantic migrations emit
the ordered route and a typed cause (`capability-blocked`, `parse-residual`,
`lowering-residual`, `host-rewrite-required`, or `configuration-residual`).
`createAdapterConformanceSuite()` adds the direct adapter-owned gate before the
route matrix: each registered adapter must independently pass detection,
configuration, parsing, emission, and validation against its happy fixture.
Source-side semantic metadata is not judged as a target capability; that
negotiation remains an ordered-route concern.
Clean conversions additionally require one validation per converted program
and exact canonical source/target CSS equality. The direct hook sweep invokes
each adapter's representation negotiation, dynamic preparation, host rewrite,
component rewrite, and final rewrite ports with both valid and residual-shaped
inputs. The per-adapter V8 gate currently covers all 31 concrete adapter
implementation files, while the production promotion matrix remains the
separate authority for browser/SSR claims.
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
