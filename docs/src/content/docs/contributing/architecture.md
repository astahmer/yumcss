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

Each policy has one orchestration port and one default composition. The
codemod adapter registry owns the canonical route view used by migration,
capability, and proof consumers; it does not rebuild a second built-in route
registry for each caller. `StyleSystemRegistry` remains the injectable mutable
constructor for custom system composition, while the default adapter registry
owns its single instance. The analyze fold service follows the same boundary:
`FoldAnalysisPort` owns analysis, summary formatting, and residual collection,
with one default implementation and a substitution test. Smaller ports remain
only where they represent an independently replaceable policy, such as CSS
budget measurement or workspace access.

### CLI composition roots

Published command entry points use the lightweight `cac` command parser for
syntax, generated help, option/value validation, subcommands, and positional
arity. They only normalize validated arguments and call the existing use-case
ports; parsing, filesystem access, reporting, and process exit handling stay at
the composition root. This keeps command behavior consistent across Pandwind,
analyze, and codemod while preventing a second migration or analysis engine from
growing inside a CLI parser.

### Migration application service

One source-file migration is orchestrated by the `StyleMigrationUseCase`. Its
executor depends on four infrastructure ports: the adapter catalog, the shared
source scanner, the lowering registry, and the project-aware adapter resolver.
The CLI, virtual bundler plugin, browser entry point, and MCP service consume
that use case instead of selecting the concrete runner independently. Adapter
modules remain responsible for detection, configuration, parsing, emission,
validation, and target-owned host policy.

The default `StyleMigrationImplementation` is assembled at the package
composition root and exposed through `createStyleMigrationUseCase`. Browser
callers can supply an in-memory catalog and scanner, project hosts can supply
an official-loader resolver, and tests can substitute the implementation or
any individual infrastructure port. `runAdapterMigration` and its async form
remain thin convenience calls over that use case; they cannot bypass the
canonical application boundary. The flat `SwapIR` path remains independent
and cheap.

The codemod adapter assembly is split by policy ownership. `adapter-definition`
defines the adapter kit and configuration/detection composition, `adapter-parser`
owns source-language parsing, `adapter-renderers` owns target syntax rendering,
and `adapter-validation` owns semantic program checks. `external-adapters` now
only assembles and registers those policies, while migration route policy lives
in its own internal module. This keeps the registry/composition root small and
lets parser, renderer, or validation implementations be substituted without
changing migration orchestration.

Route resolution, source detection, official source/target configuration
loading, configuration residual handling, and file-migration selection are
owned by `adapter-migration-preparation.ts`. Both synchronous and asynchronous
execution prepare the same route object before the engine lowers a file. This
keeps the engine focused on semantic negotiation, emission, validation, host
rewrites, and atomic output assembly instead of maintaining two setup paths.

The Node and browser catalog composition roots use the same built-in adapter
plugin and registry assembler. Their only difference is injected capability:
Node supplies module loading, filesystem reads, and cross-module resolution,
while browser callers supply an in-memory Tailwind resolver. The adapter
identity set is therefore one registry view even when the host effects differ.

The MCP service follows the same rule. Its port set supplies the adapter
catalog, the migration use case, the analyzer command, and optional host-owned
project validation. The official MCP SDK owns protocol, stdio, and Streamable
HTTP transport details; Hono is only the local HTTP composition root. Project
path safety, explicit apply confirmation, resource projection, and tool
orchestration stay in the service, and neither layer reimplements adapter
migration semantics. Typecheck, build, browser, SSR, hydration, and bundle
checks enter through the typed validation port, never through arbitrary shell
arguments from an MCP caller.

Every MCP result carries an `executionEvidence` collection. The evidence lane
distinguishes in-process adapter evaluation, sandbox execution, installed
fixture proof, and host validation; its status separately records verified,
unavailable, or failed work. The route-proof catalog is expanded from the
same style-system registry used by migration, so a registered route without a
fixture is represented by an unavailable research policy rather than omitted
from the tooling surface. Installed-project evidence must also declare an
isolated fixture and its files before the route can claim that proof tier.

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

`ClassNameStrategy` is intentionally limited to synchronous, declaration-level
class naming. It is appropriate for Pandwind's own atomic strategy and stable
compatibility policies such as Tailwind or StyleX. Panda and UnoCSS are not
exposed as generic runtime strategies: their official generators depend on a
project's loaded presets, plugins, extractors, and generated artifacts. Those
systems belong behind their project-aware adapter/config-loader boundaries;
inventing a standalone `toClassName` catalog would silently lose custom
configuration. Their codemod and compiler-plugin routes remain the supported
integration points.

The same class-host port handles source systems whose style match is the whole
JSX opening tag, such as `<Box bg={theme.foreground} />`. The target emitter
produces its class expression first; the host projection then removes the
source style prop, attaches the target class, and binds the original scalar
expression through an inline custom-property style object. This keeps the
runner generic: class adapters opt in through `dynamicClassCarrier`, while
Tailwind and UnoCSS retain their own utility-token emitters. A registry
substitution test proves that a new class adapter receives the projection
without adding a central adapter branch.

Panda and Tokenami also advertise this carrier. Their object-style class
emitters accept the static `var(--pandwind-dynamic-*)` declaration, allowing a
styled-components or Emotion subject with a scalar theme expression to move to
either target without a capability skip. The generated host wrapper evaluates
the original expression while the target stylesheet remains statically
extractable. Function-valued styles, unresolved project configuration, and
framework-specific host behavior still require their own target contracts.

The same contract applies to a dynamic styled subject such as
`const Card = styled.div({ color: theme.foreground })`. When the target is a
class carrier, the generated CSS remains static (`var(--pandwind-dynamic-*)`),
and the subject becomes a small host wrapper that binds the original
expression. The JSX use stays `<Card />`; assigning the generated class string
to `Card` or rewriting the use to `className={Card}` would change the public
component shape and is therefore invalid. This projection is selected by
registry normalization and covered for every built-in dynamic class carrier.

Runtime-capable targets make the same distinction for scalar expressions. A
target-owned carrier such as Chakra's documented `css` prop or MUI's `styled()`
may preserve a scalar expression when the expression remains in the source
lexical scope; the adapter marks that representation explicitly so validation
does not count the preserved IR residual as a failed conversion. Chakra's
`system.css()` is an official style-object interop utility, not a class-name
carrier: it is valid for a style object and may be used for a hostless Chakra
target projection, but Pandwind never emits `className={system.css(...)}` or
synthesizes `createSystem(defaultConfig)` as a generic target. This does not
bless function-valued callbacks, provider-specific theme lookups, or
framework-only bindings: those still require a target wrapper or an explicit
residual.

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

### Adapter evidence is part of the contract

Every registered adapter publishes a versioned official-API manifest. The
manifest is owned by the adapter and describes the documented user forms,
configuration entrypoints, plugin systems, compiler integrations, and SSR
hooks. It is not inferred by the migration runner and it must not list an
internal helper merely because that helper is callable. For example, Chakra's
manifest distinguishes the documented `system.css()` style-object form from a
nonexistent bare `css` export.

The same adapter config result carries ordered project evidence:

```text
official loader -> generated artifact -> explicitly supplied resolver -> residual
```

Each source also records whether it resolved, failed, or was not attempted.
This matters when an official package is installed but a custom preset or
plugin cannot be evaluated: the failed official attempt remains visible as a
configuration residual, and the source is preserved unless an explicit
resolver can prove a safe conversion.

Configured plugin chains are first-class evidence. A statically named package
is resolved evidence; an opaque function or computed plugin is explicitly
unresolved and cannot be treated as if the adapter understood its transforms.
Generated files such as interop manifests and compiler-produced style
artifacts are recorded as authoritative evidence so source re-interpretation
does not accidentally override the compiler's result.

The registry validates this evidence generically. Adding an adapter requires
its implementation and its manifest; no central ecosystem switch is needed.
The focused `adapter-evidence` contract tests cover the built-in catalog,
official Panda plugin evidence, fallback/artifact/unresolved ordering, and the
negative Chakra public-API boundary.

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

The config context also exposes an optional `listFiles(root)` port. It is a
composition-root concern: the CLI/Vite host supplies the project workspace,
while each adapter owns discovery rules for its own graph. This keeps filename
guesses out of the migration runner and lets CSS-first systems discover entries
such as `src/index.css` or imported local files. If a project-aware run has a
file list but no usable official entry, the adapter returns a configuration
residual instead of silently claiming that its default resolver represents the
project.

| Ecosystem | Official integration              | What it contributes                                                                                               |
| --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Panda     | `@pandacss/config`                | effective config, presets, plugins, merged theme/conditions/patterns; loader failures remain visible as residuals |
| Tailwind  | `@tailwindcss/node`               | loaded design system and generated utility/token view                                                             |
| UnoCSS    | `@unocss/config` + `@unocss/core` | project config, presets, rules, shortcuts, and generated utility CSS                                              |
| Chakra UI | `@chakra-ui/react`                | merged system config and token variable resolution                                                                |
| Tokenami  | `@tokenami/config`                | normalized project config and aliases                                                                             |
| MUI       | `@mui/system` or `@mui/material`  | official `createTheme` output, palette/spacing/shape/typography values                                            |
| Mantine   | `@mantine/core`                   | official `createTheme` output, colors/spacing/font sizes/line heights/radii                                       |

MUI and Mantine keep a small adapter-owned map for their documented authored
style-prop spellings (`sx`, `p`, `c`, and similar). Those maps are parser
syntax, not default theme catalogs and are never used to guess custom project
values. When a project theme is discoverable, the adapter loads it through the
official package, builds the neutral token catalog, and resolves values through
the resulting theme. If the package or theme module cannot be evaluated, the
adapter emits a configuration residual and preserves the uncertain source
semantics.

Pandwind is the target-side exception: its async adapter loader discovers the
project's generated `pandwind.interop.json` and `bridge.ts`, then imports the
same project preset that codegen uses. This lets a migration reuse the actual
target token catalog without a second hand-maintained token map. If the
artifact is present but cannot be loaded, the adapter reports a configuration
residual; if no artifact exists, it falls back to literal output rather than
emitting references that the target cannot resolve.

These packages are optional integration dependencies, not Pandwind runtime
dependencies. If they are absent, the adapter uses its documented deterministic
fallback. If an official loader is present but fails, the adapter records a
configuration residual so a migration cannot claim that custom semantics were
fully handled. Loader tests use `ProjectModuleLoader` substitutions, and at
least one installed-package fixture covers each official integration.

Custom-context proof lives in
`packages/codemod/tests/custom-design-system-resolution.test.ts`. It exercises
real adapter syntax for custom Chakra/Panda tokens, custom Tailwind/UnoCSS
utilities and theme values in both directions, and Tokenami authored token refs.
The assertions require conversion, no residuals, target-native spelling, and
absence of the replaced raw value. Adapters without an official design-system
loader must preserve authored expressions or report a structured residual; the
core never invents a target token path from a matching string alone.

Tailwind and UnoCSS generated candidate output is parsed with a structural CSS
parser. Flat declaration splitting is unsafe because values may contain
semicolons and because the official engines wrap candidates in media,
supports, container, layer, or selector rules. The parser retains only
candidate style rules; global/keyframe/font-face side effects are not coerced
into a style utility. Their rule-level migration must be represented by the
semantic program or reported as a residual.

Compiler-driven adapters do not ship partial hand-maintained utility catalogs.
Tailwind and UnoCSS resolve ordinary utilities, custom rules, shortcuts,
variants, presets, and theme values through their official project engines (or
an explicitly supplied generated-CSS resolver). The no-config/browser path
handles only syntax-level arbitrary properties; unknown utilities produce a
typed residual. Variant names are not classified from a guessed list: authored
variants remain named conditions, while pseudo conditions come from the
selectors emitted by the official engine.

## Boundaries

The publishable CSS artifact is its own boundary: `vite/lib-artifact.ts` owns
the `pandwind.lib/1` contract, compatibility fingerprint, content validation,
and rule-entry types; `packages/codemod/src/lib/` owns source scanning and
artifact writing; `vite/css.ts` owns explicit package resolution; and
`vite/css-core.ts` only merges already-validated entries. It remains separate
from the Tailwind-focused `pandwind.interop/1` artifact because the two files
serve different consumers and failure policies.

| Domain                 | Port boundary                                                                                                                                | Default implementation                                                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite CSS extraction    | scanner, classifier, extractor, provenance, diagnostic, and rewriter ports                                                                   | `vite/css-extract.ts`, `vite/css-extraction-contracts.ts`                                                                                                                                                                                                                                                                             |
| Tailwind codegen       | theme loader, design-system loader, utility catalog, conflict analyzer, variant probe, type emitter, runtime emitter, writer                 | `packages/codemod/src/tw/codegen-theme-input.ts`, `packages/codemod/src/tw/codegen-catalog.ts`, `packages/codemod/src/tw/codegen-conflicts.ts`, `packages/codemod/src/tw/codegen-variants.ts`, `packages/codemod/src/tw/codegen-emitter.ts`, `packages/codemod/src/tw/codegen-writer.ts`, `packages/codemod/src/tw/generate-types.ts` |
| Runtime CSS            | canonicalizer, ordering, serializer, store, sink                                                                                             | `css/runtime-sheet-contracts.ts`, `css/runtime-sheet-policies.ts`, `css/runtime-sheet-serializer.ts`, `css/runtime-sheet-sink.ts`                                                                                                                                                                                                     |
| Stylesheet lowering    | condition, ordering, decoder, serializer, and variable compiler policies                                                                     | `css/stylesheet-policies.ts`, `css/stylesheet-lowering.ts`                                                                                                                                                                                                                                                                            |
| Token formats          | one normalized token set plus format adapters                                                                                                | `codemod/swap/token-set.ts`, `codemod/swap/token-format-contracts.ts`                                                                                                                                                                                                                                                                 |
| Source documents       | language scanner registry plus Node workspace expansion/read/scan                                                                            | `source-scanner.ts`, `source-workspace.ts`; analyzer, Vite, codemod, and Tailwind collection consume this workspace                                                                                                                                                                                                                   |
| `cx()` compilation     | constant discovery, expression evaluation, imported merges, fold policy, and code emission                                                   | `vite/cx-static-evaluator.ts`, `vite/cx-import-scanner.ts`, `vite/cx-call-rewriter.ts`                                                                                                                                                                                                                                                |
| Design vocabulary      | module adapter registry                                                                                                                      | `design/resolve.ts`                                                                                                                                                                                                                                                                                                                   |
| Analyze/reporting      | source analysis, residual policy, candidate scanning, artifact compilation, budget metrics, artifact inspection, workspace, and report ports | `analyze/analysis-service.ts`, `analyze/css-residual-collector.ts`, `analyze/css-budget-*.ts`, `analyze/css-artifact-inspection.ts`, `analyze/analysis-report.ts`                                                                                                                                                                     |
| Utility bridge         | Tailwind compilation, selector filtering, value resolution, and bridge emission                                                              | `packages/codemod/src/tw/bridge.ts`, `packages/codemod/src/tw/bridge-generator.ts`                                                                                                                                                                                                                                                    |
| Real repository proof  | pinned reference materialization, source migration lanes, SSR/browser checks, route failures, and CSS-size accounting                        | `scripts/run-migration-proof.ts`, `scripts/migration-proof-catalog.ts`, `scripts/verify-chakra-docs.ts`, `examples/migrations/chakra-ui-docs-migration/README.md`                                                                                                                                                                     |
| Runtime specialization | usage-aware pruning, shared attachment registry/renderer, explicit runtime codegen, virtual modules, and size regression proof               | `vite/css-call-rewriter.ts`, `vite/runtime-pruner.ts`, `css/runtime-codegen.ts`, `codemod/src/runtime/`, `vite/css-core.ts`, `tests/runtime-size.test.ts`                                                                                                                                                                             |

Generated-project metadata is a versioned artifact, `pandwind.interop.json`.
Tailwind codegen writes its utility/type/variant/conflict/theme view there, and
bridge generation refreshes the optional bridge section from the compiled
design system. Pandwind does not import generated `bridge.ts` automatically;
only an explicit `twAdapter` selection adds it to an application's runtime
graph. Migration tooling consumes that artifact when present and only falls
back to parsing `types.d.ts`/`tw.ts` and their companion metadata for projects
generated before the artifact was introduced. The artifact is the
project-context boundary; it must never
contain assumptions about the example application.

`pandwind.agents.json` points to this artifact in `generatedFrom` using paths
relative to the metadata directory, so the files remain portable when a
project is moved or checked out on another machine.

The flat `SwapIR` is deliberately retained as the cheap path. Rich migrations
use the versioned semantic `StyleProgram`; neither path is allowed to know a
pair-specific `XToY` implementation.

## Framework component adapters

Component-family APIs follow the same port-and-adapter boundary as migration
and backend APIs. `pandwind/stack` owns the renderer-neutral `StackProps`,
CSS declaration mapping, and explicit Tailwind-compatible class fast path.
`pandwind/stack/react`, `pandwind/stack/solid`, `pandwind/stack/vue`, and
`pandwind/stack/preact` each own their framework element creation, attribute
spelling, children/slot behavior, and prop forwarding. Each renderer also
exposes `createStack(css)`, so configured class-name strategies and CSS
compiler ownership are supplied rather than bypassed. The static fold keeps
the same boundary: bare `stackFoldVite()` is Tailwind-only, while
`stackFoldVite({ engine })` shares the configured engine with
`pandwindCssVite` to emit sheet-backed rules for folded declarations.

The family namespace is intentional: `pandwind/stack/{framework}` identifies a
renderer for the Stack component family without turning `pandwind/{framework}`
into a catch-all framework API. Svelte and Astro need native component-file
adapters and compiler integration; a JavaScript façade would not be an
idiomatic or type-safe substitute.

## Stack-safe tree processing

Input-shaped trees are traversed iteratively with explicit depth-first stacks.
This applies to the shared Oxc AST walker, parent-aware source analysis,
generated CSS, Panda style/config trees, token catalogs, token-format imports,
Tailwind/UnoCSS generated rules, StyleProgram rule collection, and token-graph
cycle detection. The stacks preserve authored order and therefore do not alter
cascade or emitted-source behavior; they also avoid retaining a breadth-first
queue and remain safe for unusually deep user configuration or generated CSS.

Small bounded filesystem scripts and local semantic helpers may still use
recursion when the recursive form is clearer and the input depth is controlled.
The performance regression is covered by
`packages/pandwind/tests/stack-traversal.bench.ts`: the explicit AST walk is
benchmarked against the former recursive shape on a representative tree, while
the stack traversal tests exercise 2,000–12,000-level inputs.

## Static-first runtime delivery

The browser runtime is a fallback, not a tax on every static call. The CSS
compiler scans the same source modules as the stylesheet collector, resolves
literal `css()` and `css.class()` calls through the preset, emits their rules
into the virtual stylesheet, and rewrites those calls to their final class
carriers before the bundler sees them. If a local `createUnsafeCss()` factory has no
remaining references, the rewriter marks that zero-argument factory call as
pure so normal bundler tree shaking removes the factory and its implementation.

Dynamic values, unsupported helpers, and partially representable expressions
are left untouched. They retain the complete typed API and use the runtime
fallback, so optimization never trades correctness for size. For a locally
contained `createUnsafeCss()` factory, the Vite/unplugin optimizer analyzes the
actual member accesses and rewrites the import to a virtual runtime module
that imports only the required method attachments. `css()` needs only the
callable core; `.class`, `.vars`, and other methods add their own attachments,
with `.group` declaring its `.vars` dependency. Exported, returned, passed,
computed, or otherwise escaped factories conservatively keep the complete
runtime. This optimization exists only in emitted JavaScript: `CssFn` still
exposes every method to TypeScript and the package entry remains fully capable
without a plugin. The runtime-size matrix proves static extraction, fallback
behavior, and the reduced call/class/vars bundles.

Cross-module constants use the same conservative rule. The scanner resolves
literal exports through relative modules and one barrel level, folds their
`tw()`/`cx()` consumers, and leaves unresolved or shadowed bindings untouched.
The final bundler output is therefore plain class data with the source token
module and styling runtime tree-shaken away; a focused Rollup proof snapshots
that bundle and asserts the absence of `tw`, `cx`, and factory identifiers.

`StyleProgram` is also the semantic AST construction boundary. Adapter authors
and semantic tests may use the scoped `StyleProgramBuilder` from the codemod
`swap` surface when low-level rule object literals would repeat invariants:

```ts
const program = StyleProgramBuilder.create({ source })
	.style({
		color: "red",
		padding: StyleProgramBuilder.token("space.2", { resolved: "0.5rem" }),
	})
	.global(":root", { "--brand": "#2563eb" })
	.build();
```

The builder is a build-time construction façade over the existing
`pandwind.style-program/4` value. It centralizes deterministic rule ordering,
value classification, dynamic normalization, program metadata, provenance,
and residual accumulation, then delegates final normalization to the same
semantic factory used by existing adapters. `StyleProgramBuilder.from()` can
seed a new program without sharing the source program's rule array.

Declaration order is a semantic policy, not an incidental object-order detail.
The shared cascade policy uses the StyleX-derived CSS priority catalog: broad
shorthands are emitted before narrower shorthands, logical longhands before
physical longhands, and stable property identity breaks equal-priority ties.
This makes equivalent programs and generated sheets independent of filesystem,
module, or object insertion order. Duplicate declarations for the same
property and condition remain stable, preserving authored last-wins behavior.
CamelCase style-object properties are normalized before priority lookup, so
`marginTop` and `paddingInline` participate in the same policy as their CSS
spellings. The flat `SwapIR` projection remains unchanged and cheap; the
ordering guarantee applies at the semantic/canonical and stylesheet layers.

This is intentionally not a second `StyleNode` hierarchy and not a target
renderer API. Tailwind, Panda, StyleX, CSS, React Native, and OpenTUI remain
owners of their own `emit` ports; the core never grows
`styleProgramToTailwindCss`-style switches. The builder does not make an
unsupported target semantic representable and it does not replace `SwapIR`
for simple literal migrations. A builder-created program must pass the same
canonical, lowering, adapter, and residual validation as a parsed program.

`StyleProgramCore` is the single invariant boundary around that value. It
normalizes frontend output, validates the rule/value shape, serializes a
stable structural form, and computes a deterministic non-cryptographic
fingerprint. `StyleProgramCore.encode()` can wrap the normalized value in a
versioned `pandwind.style-program-artifact/1` envelope; `decode()` verifies the
artifact schema, core version, and fingerprint before returning a program.
Portable artifacts are intended for caches, proof reports, and explicit
out-of-process tooling—not for the browser runtime. A plugin manifest carries
the matching `pandwind.style-program-core-compatibility/1` requirement, and
the registry rejects a plugin whose range does not include the current core or
whose declared capabilities drift from its implementation. This makes the
“one reliable core, many frontends” boundary enforceable without adding a
second bytecode VM or changing the frozen author API.

Differential evidence records both the core version and the normalized
program fingerprint used by the proof. Consequently, a changed core can be
distinguished from a changed adapter, while malformed source/target programs
remain explicit failures. The fingerprint is an identity/cache key rather than
a cryptographic integrity primitive.

Generic semantic traversal is owned by `StyleProgramAnalysis`. Its rule and
declaration queries preserve the rule-less root projection used by the cheap
path, while dynamic-value queries provide one neutral policy for lowering,
capability inspection, and adapters. An adapter may still keep a local query
when it encodes target policy—for example, which dynamic representation a
framework host can accept—but it must not reimplement generic IR traversal.

The CSS variable compiler is likewise the single owner of variable atoms,
custom-property naming, condition encoding, and inline-value normalization.
The CSS surface consumes `createVarCompiler` directly; an unexported façade or
parallel `encodeVars` helper is intentionally not maintained.

The source workspace owns filesystem expansion and document reads. Its default
query returns only files claimed by a registered source-language adapter;
callers that intentionally need non-script assets, such as CSS imports for
theme crawling, opt into `includeUnsupported` at the workspace boundary. Vite
CSS extraction uses the same workspace for its file set, and codemod host
selection uses the scanner's language result instead of maintaining extension
checks. Filesystem access in a CLI composition root or in the workspace
provider is therefore infrastructure; parser and framework policy stays in
the scanner or owning adapter.

`SourceWorkspace` accepts both a `SourceWorkspaceFileSystem` and a
`SourceScannerService`. Tests, browser tooling, and alternative hosts can
therefore replace file expansion, reads, and language selection without
reimplementing workspace semantics. Codemod parsing also receives the
bounded `SourceProjectBindingIndex`: relative imports can be followed through
barrel re-exports using AST binding facts, while package boundaries stop at
the owning adapter. No project module is executed during this resolution.

Long-running repository and proof scripts use an optional Effect 4 adapter at
their composition boundary. `scripts/effect-tooling.ts` exposes ordinary
Pandwind-owned task and filesystem ports while adapting them to Effect's
official `FileSystem`, `Path`, and bounded `Effect.forEach` services. Reference
preparation and adapter-reference proof batches preserve input order, bound
parallel work, retain task ids on failure, and accept cancellation. Effect is a
root tooling dependency only: no shipped runtime, Vite transform, pure
semantic lowering, backend renderer, or browser bundle imports it. Because the
adapter is script-local and substitution-tested, the beta dependency can be
replaced without changing migration or source-workspace contracts.

Generated artifacts are maintained through their generators rather than
treated as hand-authored adapter implementations. Repository lint and
formatting ignore the generated playground declaration graph and generated
directional route fixtures; their generators and consumers remain checked,
and the generated outputs are validated by the playground type-generation
check and the codemod route/round-trip suites.

When a target does not expose a token contract, the lowering planner first
uses a verified resolved token value as a literal. An unresolved token remains
an explicit `token-values` lowering residual. This makes safe migration
static-first without silently replacing a custom token with a guessed value;
targets that do support the token contract still receive the authored token
through their token policy.

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
locations without forcing flat `SwapIR` callers to pay for rich nodes.
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

Custom ecosystem configuration follows the same safety boundary. Stitches
inline `createStitches({ theme })` objects are parsed by the Stitches adapter
and its `$scale$key` references are resolved to concrete values before a
target adapter has a chance to re-tokenize them. StyleX `defineVars` is
lowered to registered `--custom-properties` and `var(--custom-property)`
references. Vanilla Extract `createVar` remains static, while theme
contracts, theme creation, and `assignVars` currently produce configuration
residuals until a contract-aware lowering exists. Treat themes, Fela renderer
configuration/plugins, Goober setup, and Emotion/styled-components runtime
providers are likewise retained as explicit residuals when their runtime
semantics cannot be proven for the target. MUI and Mantine theme expressions
remain in their native runtime context while their style props are lowered.

This distinction is intentional: a custom value that can be proven from
authored static configuration is resolved; a runtime provider or plugin that
could change the generated CSS is never guessed away. Every such boundary has
an adapter-specific inline-snapshot test covering the converted style and the
non-happy residual path.

Built-in registry identities are const-enum-backed. Codemod adapter/source/target
ids, pattern ids, plugin ids, token-format ids, validator/lowering ids, and
pipeline stage ids are defined once in the owning identity module and reused
at every composition boundary. Shared orchestration must not compare raw
ecosystem strings such as `adapter === "stylex"`; adapters normalize those
differences into neutral IR metadata or registry-selected ports. Third-party
ids remain extensible through branded plugin identifiers. Semantic rule/value/
condition/residual discriminants use const-enum tags for control flow while
their literal-union views remain available at serialized and authored-source
boundaries. Authored CSS values, property names, package specifiers in emitted
source, and external AST protocol strings remain data rather than registry
identities. Const enums have no runtime object, so registries expose explicit
ordered arrays instead of relying on `Object.values`. Runtime-loaded entrypoints
such as Vite and Inspector use `as const` identity objects with derived union
types instead: Node's strip-only loader cannot execute TypeScript enum syntax or
parameter properties.

Prefer one cohesive façade, registry, or class over a module that exports a
collection of unrelated operations. The analyzer's collect subpath exposes
named collection operations directly, the Studio workspace has one factory,
and the backend registry has one factory collection and lookup view. Export a
primitive only when it is an independent contract or a narrow public entry
point. Knip is the required check for unused exports; generated `tw.ts`
artifacts and explicit package subpaths are documented entrypoints rather than
dead-code exceptions.

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

Source transformation primitives have one owner: `SourcePass` in
`packages/codemod/src/source-pass-utils.ts`. It scopes balanced-block matching,
excluded-range calculation, offset-safe edits, and residual-marker insertion
behind one small class. Adapter and pipeline code consume this owner directly.
The migration composition root is kept in
`adapter-migration.ts`, while the port-driven algorithm lives in
`adapter-migration-engine.ts`. The engine does not construct the adapter
registry, scanner, or lowering registry; the composition root supplies them.
The semantic-IR and Panda files remain cohesive because they still own
complete lifecycle or policy surfaces. A future split must introduce an
independently replaceable port, default implementation, and substitution test,
otherwise it would add indirection without improving the architecture.

### Non-CSS-in-JS source adapters

Static stylesheet sources are first-class adapter families, not special cases
in the migration runner. `authored-css.adapter.ts`, `css-modules.adapter.ts`,
`sass.adapter.ts`, and `less.adapter.ts` each expose one registered adapter;
their shared mechanics live behind `StylesheetSourcePort` and
`StylesheetCompilerPort` in `packages/codemod/src/swap/stylesheet-source.ts`.
The Sass and Less adapters load their official compilers through the project
module-loader port and retain compiler dependencies and source maps as
evidence. A missing compiler is a configuration residual, never an implicit
default.

CSS Modules additionally owns the consumer-file change boundary. A converted
module is emitted once as a typed class map, and import specifiers in known
workspace consumers are proposed as atomic file changes with expected source
content. The CLI validates those changes before writing them, so stale or
conflicting consumers fail closed. Global selectors, composition, and
cascade-sensitive rules stay residuals until a target contract can preserve
them.

Tamagui owns component subjects and configuration detection in
`tamagui.adapter.ts`; static `styled(subject, object)` calls are projected
through the normal host/target ports. Function-valued styles, theme callbacks,
variants requiring runtime context, and unresolved compiler configuration are
kept visible as typed residuals. Vanilla Extract's `styleVariants` is lowered
to a target-owned named class map, while theme contracts, recipes, and
contract-dependent variables remain context residuals until a target proves
their variable semantics. These boundaries are covered by focused
source-adapter snapshots and assertions in the codemod package.

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
adapter. `pnpm run pivot:proof` composes that gate with the checked-in promotion
matrix; the scheduled full-proof workflow supplies the pinned repository
evidence without importing upstream source into the workspace.

Codemod route verification is owned by `packages/codemod/proof`. Its contract
and scenario fixtures are shared by the Vitest suites and the offline proof
composition root, so the two gates cannot silently use different corpora. The
complete in-memory matrix covers every ordered adapter pair in safe and partial
modes for happy, edge, and malformed inputs; the CLI e2e suite additionally
proves the real binary's argument, discovery, write, and extension boundary.
A route is accepted only when it converts or preserves the source with a typed
residual. Run the public-boundary proof with
`pnpm --filter pandwind-codemod run test:e2e`; the normal coverage gate runs the
same route corpus in-process.

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

Directional route behavior has a dedicated fast proof layer in
`packages/codemod/tests/routes`. The generator currently creates one file for
each distinct ordered pair with a concrete source fixture (930 files). The
broader registry contract covers all 32 registered adapters, including pairs
whose source family does not have a generated file in this directory. Each route file
covers a static happy path, a dynamic or otherwise
non-happy edge path, malformed input, theme/config variants, and token
references, with inline snapshots of emitted code, selected representation,
outcome, validation, and typed residuals.
Assertions additionally require clean routes to validate, malformed routes to
retain their source marker, and every route to avoid invalid nested hosts such
as `className={<Box ... />}`. This suite runs directly against the registry and
runner, so a new adapter route is cheap to select and review; the CLI matrix
remains the separate public-boundary proof.

Every ordered pair also has a matching
`packages/codemod/tests/roundtrips/*-to-*-to-*.test.ts` specification. These
tests run concrete source syntax through the forward adapter and feed the
emitted result back through the reverse adapter, covering static, dynamic,
theme/config, token, and malformed cases with inline snapshots for both legs.
The snapshots are deliberately paired with executable assertions: reverse
conversion, an explicit residual, or a visible source-preserving fallback is
required. A byte-stable second leg is valid only when the reverse adapter
actually parsed and converted it; a silent no-op is rejected. The current fast
syntax-fixture corpus is 930 directional files (4,650 tests) plus 930
round-trip files (3,720 tests). Context cases provide a virtual project root and adapter-owned config
files, use blue and amber token values, and exercise native token spellings
where the ecosystem has them. Run this isolated proof with
`pnpm --dir packages/codemod exec vitest --config
vitest.route-matrix.config.ts run -u`; it does not invoke the slower CLI suite.

Named-style targets must emit syntax that their own source adapter can parse
again. Modern Mantine has no standalone class factory in `@mantine/core`, so
the adapter uses a host `style` prop for component projections and reports a
residual for hostless named maps; Emotion-backed Mantine projects must
declare and load `@mantine/emotion` explicitly. Tailwind named maps use an
assigned class-map representation. These are adapter-owned policies, not
generic runner exceptions. The route corpus consequently catches invalid
bare-object output and proves reversibility for JSS, Aphrodite, Style9, StyleX,
and React Native named-style routes.

Backends follow the same rule. CSS, object, React Native, React Strict DOM, and OpenTUI are
registered as `StyleBackendFactory` implementations and are exercised by the generic
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
runner executes them. `pnpm run pivot:proof:installed` is the reproducible
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
projects receive only explicit, pinned packages via `pnpm run references:deps`.
This keeps project presets, CSS theme variables, and generated utilities in the
official-loader path without vendoring or silently substituting Pandwind's
fallback resolver.

Knip intentionally ignores the `pandwind-codemod` dependency in the
playground. The playground imports the browser-only public subpath
`pandwind-codemod/swap/browser`; Knip cannot follow that workspace package
subpath through the source-package boundary, while the playground build and
browser tests do. The codemod subpath is listed as a production entry in
`knip.json`, so its exports remain owned and checked.

The same boundary applies to three workspace dependencies that are intentionally
kept in `knip.json`'s ignore list: `@pandwind/example-preset` is imported through
the repository's `pandwind` condition and also resolved from generated/config
strings; `prettier` is loaded through browser-only formatter subpaths; and
`@hono/node-server` is used by the public Node studio transport entrypoint.
Their package manifests and typechecks own those dependencies, while Knip cannot
trace the conditional or subpath resolution reliably.

The styled-components documentation site is also a reproducible acceptance
corpus. Its pinned checkout is never edited. The migration runner exposes two
target lanes over the same source adapter:

```sh
nub scripts/run-migration-proof.ts run styled-components-docs runtime-css \
	--output-root /tmp/pandwind-styled-runtime
nub scripts/run-migration-proof.ts run styled-components-docs design-css \
	--output-root /tmp/pandwind-styled-design
```

The runner owns disposable materialization and lane accounting; the adapter
owns styled-components template/object parsing, subjects, `.attrs`, globals,
keyframes, and framework rewrites. `scripts/verify-styled-components-docs.mjs`
then checks the pinned baseline and migrated applications in the browser and
records route, hydration, screenshot, and CSS-size evidence. This proof is
kept as a script and a pinned reference rather than as a vendored website.

## Token governance (plans/054)

`packages/analyze/src/governance` owns the versioned token-governance ledger (`pandwind.analyze.governance/1`, `TOKEN_GOVERNANCE_REPORT_VERSION = 1`): one neutral report shared by the analyzer CLI, Inspector, the lint plugin, and the tokenization codemod. Nothing in the ledger touches the frozen runtime API. One service pass (`analyzeTokenGovernance`) assembles it from the effective token universe (`EffectiveTokenContextInputs`: authored preset groups, crawled CSS theme variables, interop-artifact variables, loader-failure diagnostics), positioned usage facts from `tw()`/`css()` call-site objects, exact raw-to-token suggestions, and reachability classification over explicit coverage boundaries (dynamic expressions, public exports, safelist, plugin output, generated CSS, unscanned files, unresolved imports, configuration failures). A zero-use claim requires proven reachability; unknown is always explicit.

Policy is never guessed. `deriveProjectGovernanceContext` reads the loaded official preset's declared strict surface (`strict`, `properties`, `$strict: false`) into a `TokenPolicySnapshot` with a per-property token vocabulary and raw escape hatches; a missing, failed, or undeclared policy downgrades to report-only with a diagnostic instead of inventing strictness. Strictness states are verified token, allowed raw, strict violation, dynamic, and unknown-policy.

Removal stays report-first. `buildGovernancePruneChangeset` classifies every unused candidate as safe, review-required, or not-removable with provenance-linked reasons, deterministically and deduplicated. Consumers decide what happens next: the Inspector governance tab renders summary, strict-policy panel, boundary chips, candidate and suggestion tables, and the prune preview; `pandwind analyze --governance` emits the versioned JSON document; `design-tokens-only` accepts the snapshot as a structural option so the lint plugin stays dependency-free; and the codemod tokenize lane rewrites only exact `(property, rawValue)` pairs from the report's suggestions — when suggestions are supplied, the heuristic fallback is disabled rather than merged.

Suggestion safety is exact-match only: a raw literal is replaceable when the target definition is statically valued and unscoped, the property category and token group are compatible, resolved values are exactly equal (hex case-folding is the one normalization), and exactly one candidate matches. Ambiguous matches are rejected with a diagnostic, never resolved by plausibility. Repository-scale cost is benchmarked in `packages/analyze/tests/governance.bench.ts` (2,000 definitions, 400 files, ~16k usage sites per pass).

## Plan inventory and remaining claims

Every Markdown file under `plans/` was reviewed against the current source,
tests, and recorded evidence on 2026-09-08. Plans marked complete describe
shipped behavior; they are not reopened because an older design sketch still
contains an unchecked example. The remaining implementation boundaries are
deliberate:

- `plans/040-pivot-any-to-any-lowering.md` and
  `plans/041-any-direction-adapter-completeness.md` have executable gates for
  the current semantic families, target representations, route matrix, and
  residual policy. Installed browser/SSR/RSC evidence remains a separate
  promotion dimension for adapters without a real host proof; a residual matrix
  is safety evidence, not universal-compatibility proof.
- `plans/044-ast-config-and-project-context.md` is complete for shared AST
  imports, shadow scopes, semantic call-site ranges, bounded relative
  re-export resolution, scanner-owned supported JSX host ranges, strict-first
  official loaders, custom-context evidence, and port substitution tests.
  Adapter-specific template dialects remain target-owned and fail closed when
  their framework contract is not proven.
- `plans/024-panda-inbound-codemod.md` now also has an installed pinned-host
  proof for Velite, website typechecking, Next production build, and
  representative `/` and `/showcase` browser rendering. The proof is recorded
  in `plans/evidence/panda-website-proof.md`.
- `plans/021-multi-target-backends.md` keeps canvas and build-time Metro
  intentionally deferred until a concrete consumer requires them, and
  `plans/028-define-preset-web-notes.md` remains decision notes rather than an
  implementation commitment.
- `plans/045-lazy-runtime-methods.md` is superseded by the shipped
  compiler-aware runtime pruning. Its runtime-only accessor checklist is not
  pending work.
- `plans/054-token-usage-governance.md` is complete for the tooling ledger: versioned report, effective universe, strictness classification, exact suggestions, reachability, prune changesets, CLI/Inspector/lint/codemod consumption, and the governance bench. Studio-side paginated queries for very large catalogs and an approved write-mode removal command remain bounded follow-ups inside their owning plans, not open governance work.
- `plans/065-proof-and-adoption-closure.md` is complete for ordinary-CI
  evidence checks, scanner-backed shared JSX host rewrites, official-loader
  context fixtures, multi-file installed-project proofs, typed opt-in MCP host
  seams, and consumer generated-artifact verification. Adapter-specific host
  syntax, broader frameworks, and arbitrary project execution remain bounded by
  their owning contracts.

The remaining installed-proof items in plans 040 and 041 are explicit evidence
requests owned by the relevant adapter; the current semantic and orchestration
gates are complete. New work should first add a capability contract and proof
to an owning plan rather than create a parallel architecture or duplicate an
already-shipped plan.

## Expert target emission and generated files

An adapter is responsible for producing the code a staff engineer would
actually author in the target ecosystem. CSS equivalence is necessary but not
sufficient: the target's normal component carrier, theme/token access,
composition primitive, framework binding, import shape, and file organization
are part of the migration contract. The runner transports that decision; it
does not rewrite target code into a generic lowest-common-denominator form.

Most declarations should stay inline. When the target's idiomatic form needs a
shared theme, helper, recipe, or runtime bridge, `AdapterEmitResult` may return
`generatedFiles`. Each artifact has a project-relative path, source content,
and an optional purpose. The migration runner normalizes paths, deduplicates
identical `(path, content)` pairs across matches, and reports a typed
`generated-file` residual for invalid paths or conflicting content. A conflict
preserves the entire source module so a migration can never leave a partially
converted project.

The CLI writes generated files by default and previews them with `--dry-run`.
It preflights existing files: identical content is safe to reuse, while
different content is a hard error rather than an overwrite. This makes one
source occurrence able to add a reusable target module without duplicating it
when later occurrences request the same artifact. The regression contract lives in
`packages/codemod/tests/generated-file-emission.test.ts`; its inline snapshots
show the expert target expression, the generated module, repeated-artifact
deduplication, and source-preserving conflict behavior, with ordinary
assertions guarding the snapshots.

### Token-preserving output

Target emitters should preserve design-system vocabulary when that vocabulary
is actually available. Official config loaders for Tailwind, UnoCSS, Chakra,
Panda, Tokenami, MUI, and Mantine normalize discovered custom values into the versioned
`AdapterTokenCatalog`. The target adapter owns the property mapping and native
spelling: the Pandwind target can emit `$...` references, while object-oriented
targets may emit their own token path or CSS-variable form. Class-oriented
targets remain literal or utility-based unless their own catalog/policy proves
a named utility is equivalent. Tailwind and UnoCSS now use this rule for
verified custom utility names; arbitrary utilities remain the safe fallback.
The semantic node retains the resolved value, so canonical CSS validation still
compares concrete browser meaning while generated source uses the idiomatic
token spelling. Migration outcomes retain the selected utility representation
and reason for inspection.

This is deliberately conservative. Without a target preset or generated
interop metadata, the adapter keeps the literal; with ambiguous or conflicting
token matches, it also keeps the literal. Migration tooling must not guess a
token from a familiar value, because the same literal can have different
design-system roles or different runtime behavior. Async external adapter runs
discover target-side generated interop metadata from the migrated project;
`--meta=<dir>` remains the explicit override for CLI callers and projects
whose generated files live outside the normal source-tree search. The focused
regressions in
`packages/codemod/tests/token-preservation.test.ts` and
`packages/codemod/tests/official-token-catalog.test.ts` prove verified
emission, official custom-config loading, ambiguity rejection, and literal
fallback.

## Virtual bundler migration boundary

`pandwind-codemod/swap/unplugin` is a bundler composition root over the
existing adapter migration use case. It owns only host mechanics: eligibility,
the per-module cache, virtual generated-file storage, invalidation, and
residual reporting. `unplugin` projects this one implementation into Vite,
Rollup, Rolldown, Webpack, Rspack, Rsbuild, esbuild, Farm, Bun, and unloader.
It delegates scanning, configuration loading, semantic lowering, host
rewrites, and target emission to the same adapter registry used by the CLI.

The plugin runs at `enforce: "pre"`. This is an intentional ordering contract:
the transformed module becomes the input to the target ecosystem's official
plugin, so Tailwind, StyleX, or another host remains responsible for its own
final CSS/compiler semantics. A host composes both plugins; Pandwind does not
import or emulate the target plugin.

Virtual migration is an evaluation and progressive-adoption lane. It keeps
source files and package manifests unchanged, while making generated target
artifacts available through virtual module ids. It must be configured in each
relevant client and SSR build, and it cannot provide editor-visible source
parity or remove the source runtime dependency by itself. Once the route is
accepted, the CLI codemod remains the explicit path to a committed migration.

The contract is intentionally tested at the plugin boundary in
`packages/codemod/tests/vite-migration.test.ts` and
`packages/codemod/tests/unplugin-migration.test.ts`: real styled-components syntax
is transformed to the target adapter's actual output; residuals preserve the
source body and remain observable; include/exclude and shared-scanner
eligibility are checked; transformed output is idempotent; generated files are
deduplicated, resolved, loaded, invalidated, and failed closed on conflicts.

## Lint-plugin boundary

`@pandwind/lint-plugin` is a small source-analysis adapter for Oxlint. Its
resolver owns Pandwind import identity, including aliases, namespace imports,
factory-created CSS/design instances, type-only imports, and function-parameter
shadowing. The rules consume that resolver rather than matching names such as
`cx` or `tw` in isolation, so an unrelated local helper is not treated as a
Pandwind call.

Static-value checks use an iterative evaluator for literals, local module
constants, object/array composition, and one conditional branch. The explicit
runtime carriers (`vars`, `props`, `group`, `input`, and `raw`) stay outside
that check because they are intentional Pandwind runtime/escape-hatch APIs;
the compiler and linter therefore agree about where runtime values are valid.
The design-token rule is inert without verified project policy supplied by the
composition root. It never invents a theme from a built-in vocabulary.

Migration hygiene is also source-local: `migration-skip-reason` requires an
explanation, `no-stale-migration-skip` catches a marker left on a now-static
call, `require-migration-residual` requires an explicit marker whenever a
static-lane call still contains an unresolvable value, and
`no-conflicting-style-props` catches explicit host props that would compete
with `css.props()` output. The stale-marker rule has a safe Oxlint fixer that
removes only the obsolete comment; prop conflicts stay report-only because
their repair requires target-aware merging. These rules require source ranges
when checking marker-to-call adjacency and fail open when a host does not
provide them. The package tests keep inline snapshots for diagnostic shape and
ordinary assertions for safety, including deep ASTs, aliases, shadowing,
custom token policy, nested dynamics, runtime carriers, JSX prop conflicts,
and both valid and invalid residual markers.

## Package surface boundary

The published package surface is tracked as repository evidence in
`plans/evidence/package-surface.json`. Each export is classified by its owning
lane (`runtime`, `build`, `integration`, or `tooling`), maturity, dependency
requirements, external-contract status, and proof files. The `surface:check`
script compares that inventory with every workspace `package.json`, verifies
repository directory metadata, and rejects build-only dependencies in
`pandwind`'s runtime dependency set.

The stable runtime lane keeps `tw`, `css`, `cx`, presets, design contracts, and
host types. Tailwind/Oxc/PostCSS/CAC/Unplugin are optional peers for the
explicit codegen, scanner, and bundler lanes; they remain development
dependencies for Pandwind's own build and test commands. The `_runtime/*`
entries are deliberately marked internal because the Vite runtime-pruner emits
those exact imports into generated code. They are a generated artifact
contract, not authoring APIs, and their evidence is the pruner test rather
than a public usage example.

Generated Tailwind artifacts are checked with `pnpm run generated:check`. The
check regenerates `tw.ts`, `tw.runtime.ts`, `tw.build.ts`, `types.d.ts`,
`bridge.ts`, the theme, and interop
metadata in a temporary directory, formats the source artifacts with the
repository formatter, normalizes only machine-local artifact paths, and
compares the result with the checked-in files. A failure names the source CSS
entry, every stale file, and the exact app command that refreshes it. The same
gate checks the Playground's generated Monaco declarations through
`editor:types:check`.
