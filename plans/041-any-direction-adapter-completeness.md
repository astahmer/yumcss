# Plan 041 — any adapter to any adapter, in either direction

## Goal

Pandwind should be a genuine pivot library: for every registered source and
target adapter, migration must work in either direction through one semantic
boundary. A route such as `X → Y` must not be a bespoke converter, and `Y → X`
must not be a second special case. Both routes use the same source adapter,
semantic program, lowering planner, target adapter, host integration, and
validators.

The versioned `StyleProgram`/HIR is necessary but not sufficient. It preserves
meaning; it cannot manufacture a target representation that the target API or
host does not provide. Therefore every semantic must end in exactly one of:

1. a lossless static target representation;
2. the smallest validated target-native or host runtime carrier; or
3. unchanged source plus a structured, target-specific residual.

No route may silently discard semantics, and no route may expose the obsolete
generic `adapter capability mismatch` diagnosis.

## Current status

The route contract, target-owned representation negotiation, static class
projection, typed residuals, and complete registered matrix are implemented.
Static styled subjects now receive a shared class-target component projection
when the target declares a class host and the source host can be rewritten;
the projection is supplied by the adapter factory and is covered by the
registry-derived target suite. This closes the common false capability skip
for static `styled.div`-style subjects without making the runner know any
ecosystem-specific syntax.

The current playground matrix is clean for its 26 registered endpoints (676
ordered routes). Chakra target emission preserves CSS-origin numeric dimensions
(`16` means `16px` in CSS-in-JS) and named-map semantic projections are retained
through the generic adapter wrapper. Standalone static Next-yak and
Solid-styled intrinsic subjects now lower to React Native `View` components,
and static Solid JSX can project into a Vue SFC. These are target-owned
representations with focused substitution tests, not validator exemptions.

The plan is not yet a universal-compatibility claim. Free dynamic values
without a target runtime context, custom subjects whose prop-forwarding
contract is unknown, framework-specific components, plugin-generated output,
and adapters that are still fixture-only in browser/SSR proof remain explicit
production-proof or semantic work. Solid-styled and Vue-styled now preserve a
single callback-valued styled body through their target runtime form, but
mixed callback contexts and free theme values still produce typed,
source-preserving residuals until a target-owned representation and proof
exist.

Class-oriented targets now also handle source systems whose style match is the
whole JSX opening tag. The shared `DynamicClassHost` projection removes the
source style props only after target emission, attaches the target class, and
binds lowered scalar dynamics as an inline custom-property style object. This
is inherited by adapters that declare `dynamicClassCarrier`; Tailwind and
UnoCSS retain their own utility emitters while using the same host contract.
The registry has a substitute-adapter test proving that a newly registered
class target receives this behavior without a central migration branch.

The shared source workspace is now the discovery boundary for analyzer, Vite
CSS extraction, Tailwind collection, and codemod host-language selection. A
workspace query can explicitly include non-script assets for CSS/theme
crawling, while source parsing remains owned by the scanner registry. This
removes a duplicate analyzer glob and the codemod/Vite extension decisions
without pretending that CSS assets are script documents.

## Completion boundary

The complete matrix is the union of every adapter that can be selected as a
source or target. The current repository has two intentionally different
execution paths:

- the versioned `StyleAdapterRegistry`, containing the modern ecosystem
  adapters plus the modern `panda` and `pandwind` endpoints; and
- the legacy `SwapIR` registry, containing the `tw`, `css`, `design`, and
  `dss` source dialects plus the Panda, Tailwind, StyleX, and Pandwind target
  lanes.

The modern route catalog projects the core nested dialects into the same
ordered `StyleSystemRegistry`: `panda/tw|dss|css` and
`pandwind/tw|dss|css` are registered beside the modern short `panda` and
`pandwind` adapters. The flat path remains a separate cheap `SwapIR`
compatibility projection; it is not a second semantic route registry. Callers
that need rich conversion use the unified style-system route registry, while
the legacy CLI path keeps its low-cost parser/emitter.

## Current evidence and known gap

The current versioned registry and route matrix exercise all 26 registered
modern adapters and retain the flat `SwapIR` fast path. The route catalog also
exposes the legacy Panda/Pandwind dialects through the same style-system
registry. Named style maps and function-valued styles now have explicit
representation contracts. The route proof is no longer only a single happy
fixture: the shared proof corpus exercises happy, edge, and malformed inputs
in safe and partial modes. The codemod suite currently passes 52 test files
and 786 tests including the adapter coverage gate; the CLI e2e matrix passes
106 tests across the ordered routes, and the route proof passes 4,056 cases.

Function-valued object calls now share `FunctionStyleCallParser` across the
normal adapter-definition path and the generic extra-adapter runtime. The
parser selects the balanced invocation rather than a nested parameter list,
normalizes parenthesized arrow parameters, carries the adapter pattern into
provenance, and validates emitted function carriers on the reverse parse. This
closes the previous false skip/validation gap for Styled Components and
Emotion function calls; template interpolations and target/framework runtime
wrappers remain governed by their separate lowering contracts.

The host projection contract now distinguishes the representation needed for a
bound host from the representation needed by a standalone component export.
The runner detects actual JSX/template use before applying a host rewrite, and
target adapters receive the selected typed representation. This prevents
component factories from being assigned to `className`, preserves native
component targets for unused declarations, and keeps Pandwind's runtime
component carrier limited to function-valued cases.

Host conversion is executable rather than descriptive metadata. Target
policies may guard a source-to-target dialect conversion with `canConvert`; the
runner passes the target framework and original `sourceFramework` separately
to representation selectors and host rewrites. Static Solid JSX can therefore
project into React-bound Stitches, MUI, and StyleX targets and static
Vue-compatible Solid JSX can project into a Vue SFC, while Solid-only
signals/directives/attributes remain source-preserving capability residuals.
React-to-React Native rewrites use the same split for intrinsic hosts and
styled subjects. The focused target suite covers both classes of outcome.

The migration result now exposes a typed outcome for each parsed call in
addition to the lowering plan. `static` means no runtime carrier was needed;
`target-native` means the target's own map, component, or style-prop contract
was used; `host-runtime` means a validated runtime or host binding remains;
`portable-artifact` is a target-owned static fallback that preserves a
portable Pandwind class artifact when the target has no legal native carrier;
MUI is the first implementation; and
`residual` means the original source was preserved with an actionable reason.
This makes a capability report inspectable rather than a boolean gate and lets
the playground distinguish a real target gap from a successful projection.

MUI now demonstrates a target-owned component projection: React component
subjects are emitted through MUI's `styled` API, while Solid/Vue subjects are
blocked by an explicit framework residual. This is the required shape for
future non-class targets; adding a target means implementing its projection
and host-framework contract, not adding a central adapter branch.

MUI also demonstrates a target-owned style-prop projection. A Pandwind class
binding used by a React host is emitted as an object and rewritten from
`className={binding}` to `sx={binding}`. Intrinsic DOM hosts are first wrapped
as `Box component="..."`, because `sx` is not a native DOM prop; known MUI
components receive `sx` directly, while static unknown custom components use
the portable fallback and dynamic ones remain residuals. Hostless dynamic
values use the same portable Pandwind carrier as an explicit runtime fallback.
The target policy owns that rewrite; the runner only negotiates the typed
representation and applies the returned edit. Static bare unused
bindings use MUI's portable-artifact fallback because MUI has no standalone
`sx()` API; dynamic bare bindings use the portable runtime carrier, while
dynamic unknown hosts remain explicit residuals until their MUI ownership is
proven.

The lowering plan's `availableRepresentations` is now program-aware: static is
listed only when no dynamic or residual semantics remain, custom-property is
listed only when the lowered program actually carries a dynamic variable, and
function-valued programs do not claim scalar dynamic carriers. This keeps a
diagnostic from advertising a representation that the current program cannot
use. Tailwind also accepts static named maps and UnoCSS parses bracketed
conditional arbitrary utilities without splitting inside their brackets.

Scalar dynamic values now have a reusable static custom-property projection for
opt-in class targets. Bamboo, Vanilla Extract, JSS, Aphrodite, Style9,
Compiled, Treat, and Linaria declare that their emitted class carriers preserve
`var(...)`; the shared lowering binds the original expression on a React/Preact
host. This is target-owned through the adapter factory and is still
fail-closed for hostless values, existing style props, and complex
function-valued expressions.

Simple function-valued declarations on styled intrinsic subjects now use the
same static carrier when the target opts in: the host-aware lowering makes the
function a custom property in the generated stylesheet and evaluates it with
`props` inside the generated intrinsic wrapper. The generic lowering registry
does not perform that conversion without the host contract. The HIR classifies
complete arrow expressions as `function-values` even when a source parser
reports their inner expression shape. Targets without this carrier still
preserve the source with a `function-dynamic` residual.

StyleX now demonstrates a target-owned component-to-host projection. For a
static React intrinsic subject, the target emits a StyleX style object and
rewrites `<Card />` to `<div {...stylex.props(Card)} />`; StyleX is never
treated as if its style object were a DOM class string. The component rewrite
port remains conservative for non-React or unsupported attribute shapes.

JSS now demonstrates a target-owned static class projection. A static style
used by a React host is emitted through
`jss.createStyleSheet({ style: {...} }).attach().classes.style`, allowing
`className` to remain a class carrier without incorrectly generating a
`react-jss` hook. Imperative and dynamic JSS semantics remain separately
reported until their host context is available.

Style9 now uses the shared target-emission port for its callable class
contract: `style9(style9.create({ style: {...} }).style)`. Static React host
routes therefore preserve `className` without making the orchestrator aware
of Style9 syntax.

React Native now demonstrates a target-owned style-prop projection. For a
static class binding in a file importing `react-native`, the target emits
`StyleSheet.create({ style: {...} }).style` and rewrites the host use from
`className={binding}` to `style={binding}`. Host detection is source-aware and
specific React Native detection takes precedence over generic JSX metadata;
ordinary React files therefore cannot receive the native rewrite accidentally.

React Native also owns an explicit host-dialect conversion for the simple
static React layout-host case. Chakra/MUI/Mantine `Box` hosts and intrinsic
layout hosts such as `div` can become native `View` hosts, with source style
attributes removed and the generated `StyleSheet` carrier attached as `style`.
The target preflights the host before emission, removes an unused source host
import when it owns that conversion, and leaves unknown tags, existing style
props, dynamic declarations, and other DOM behavior as source-preserving
`host-framework` residuals.

Standalone static styled subjects now use Pandwind's component representation
when no local host use is present. React-family and Solid output keeps the
static `css.class(...)` carrier inside a JSX wrapper, while Vue emits a
`defineComponent`/`h` wrapper with imports placed inside `<script setup>`. This
closes the common no-use declaration gap without introducing runtime CSS for
static input; dynamic interpolations still use the validated runtime fallback.

Class-oriented targets now also receive a shared declaration projection when a
static styled subject has no local JSX/template use. The target emits its
native class carrier, then the host port wraps that carrier back into an
intrinsic component. This prevents a valid CSS comparison from hiding an
invalid `const Card = "class-name"` result.

StyleX owns a target lowering for numeric CSS dimensions. Values such as
`padding: 16` are normalized to the target's equivalent `16px` before
differential validation, while unitless properties remain numeric. This is a
semantic normalization, not a validator relaxation.

The same contract now describes Stitches and styled-components as native React
component targets rather than class-string targets. Their component subjects
remain component expressions in host usage, while class-oriented targets still
perform explicit declaration/use-site rewrites. This removes a class/component
shape mismatch that previously could pass canonical-CSS validation while
emitting an invalid `className={component}` value.

Scalar dynamic styled subjects now use the same shared class-target projection
as dynamic style-prop hosts. When a React/Preact class target advertises
`dynamicClassCarrier`, registry normalization selects the custom-property
representation, keeps the generated CSS static, and rewrites
`const Card = ...; <Card />` into a component wrapper that binds the original
theme expression through an inline custom-property style object. The original
component use remains `<Card />`; it is never rewritten to `className={Card}`.
This is intentionally implemented by the registry projection and target
carrier contract, so Tailwind, UnoCSS, and extra class adapters receive the
same behavior without target branches in the migration runner.

Panda and Tokenami now advertise this carrier as well. Their object-style
class emitters accept the static `var(--pandwind-dynamic-*)` declaration, so a
styled-components or Emotion subject with a scalar theme expression can move
to either target without a capability skip. The host wrapper evaluates the
original expression while the target stylesheet remains statically
extractable. Function-valued styles, unresolved project configuration, and
framework-specific host behavior still require their own target contracts.

The old diagnostic text `adapter capability mismatch` is not a current
production diagnostic. Capability failures are now typed (`capability-blocked`,
`lowering-residual`, `host-rewrite-required`, or `configuration-residual`) and
include the selected/available representations. If that exact text appears in
a running playground, the loaded bundle is stale or the output is a historical
artifact; current source and the browser-safe matrix assert that it is absent.

## Completed codemod verification slice

The bidirectional codemod proof work is complete for the registered adapter
matrix:

- 26 contract fixtures cover detection, configuration, parsing, capabilities,
  emission, and validation for every registered adapter.
- `createAdapterConformanceSuite()` directly exercises every adapter-owned
  detection, configuration, parsing, emission, and validation port before the
  ordered route matrix runs. Source-side semantic metadata is not judged as a
  target capability; that negotiation remains an ordered-route concern.
- 4,056 Cartesian route cases cover every ordered source/target pair, both
  capability modes, and all three proof scenarios (26 × 26 × 2 × 3).
- 104 per-adapter CLI end-to-end cases spawn the real command, write temporary
  files, parse JSON reports, and cover every adapter in both `adapter →
Pandwind` and `Pandwind → adapter` directions, including edge inputs. The full
  public-boundary suite runs all 676 ordered source/target pairs through the
  real CLI, passing happy, edge, and malformed files together for every pair.
  The expensive suite is invoked with `pnpm --filter pandwind-codemod test:e2e`;
  the default coverage suite runs the same corpus in-process.
- The same proof corpus is owned by `packages/codemod/proof` and consumed by
  both Vitest and `pnpm pivot:proof`; the proof command reports the same 4,056
  route cases as the test suite.
- Every skipped route must preserve its source and carry a typed residual;
  the obsolete generic `adapter capability mismatch` marker is rejected.
- Every clean route now has one target validation per conversion and must prove
  canonical source/target CSS equality. The direct conformance suite invokes
  every registered adapter's representation negotiation, dynamic preparation,
  host rewrite, component rewrite, and final rewrite hooks, so a green route
  count cannot hide an untested adapter-owned policy port.
- Class-producing JSS, Aphrodite, and Style9 targets accept static JSX and
  template hosts without requiring React-specific component semantics. The
  React Native target also owns static intrinsic styled-subject conversion to
  `View`/`style`, while rejecting dynamic declarations and conflicting
  `style`, `className`, `class`, or `as` props with typed residuals.
- The flat `SwapIR` matrix also covers every legacy source-to-target route,
  including unknown utilities and malformed calls. The runner is fail-closed
  when an emitter reports a residual alongside non-empty output; only a
  residual explicitly marked as preserved by a target carrier (for example
  `$raw`) may accompany an applied replacement.

This slice proves route orchestration and no-silent-loss behavior. It does not
turn fixture evidence into a browser/SSR promotion claim; those dimensions
remain governed by the real-repository proof matrix below.

The package-level coverage gate also requires a V8 entry for every source
module and every concrete adapter implementation. The current run covers all
31 adapter implementation files with at least 50% lines and 30% branches, in
addition to the route and direct-hook contracts. This is a code/test ownership
gate, not a claim that an unpromoted ecosystem has universal runtime parity.

The named-map projection slice is now implemented for target adapters that
declare `native-map` or `class-map`. The generic adapter emitters only apply
that projection to named style rules, so keyframe names cannot be accidentally
wrapped as style-map entries. UnoCSS emits and parses a named lookup projection
for its class/compiler target; project-specific presets still require the
official generator context and unresolved utilities remain explicit residuals.

Blocked source markers now include the ordered source and target adapter IDs,
so a playground or CLI user can see which target contract is missing instead of
receiving an undifferentiated capability message.

Host representation negotiation is fail-closed: an explicit target refusal for
the detected framework or host shape is never replaced by the target's
default representation. The runner preserves the source with a typed
`host-framework` residual before emission. Same-adapter routes are identity
no-ops, so partial cross-framework component capability metadata cannot create
a false skip on a route that does not need conversion.

Framework provenance is not itself a target obligation for a hostless style
carrier. The capability planner now requires `framework-semantics` only for a
component subject or host-bound style attributes. Runtime-capable adapters own
their dynamic-value promotion in their adapter module; Goober and Fela now
declare and test exact scalar-dynamic carriers. The shared extra-adapter
baseline remains partial so an adapter cannot claim runtime preservation merely
because its generic object renderer happens to echo an expression.
Chakra UI and next-yak now make the same decision through explicit
`RuntimeCarrier` negotiation; static/compiler targets remain fail-closed until
they own a host-bound custom-property projection.
Chakra UI also opts into the shared class-host carrier, so scalar dynamic
styled subjects can become Chakra-backed static custom-property classes with a
generated React host wrapper rather than a capability skip. MUI preserves the
same scalar expression in its target-native `styled()` carrier for styled
subjects; callback-valued styles remain outside that contract.
Next-yak now makes the equivalent target-native choice for scalar dynamic
styled subjects and preserves `${expression}` in emitted runtime templates;
function-valued callbacks remain an explicit boundary.
Mantine uses its actual host `style` prop for dynamic JSX programs and falls
back to the portable Pandwind artifact for standalone programs rather than
emitting an unsupported standalone style factory.
Tailwind now owns that projection for React/Preact named class bindings: the
lowering emits a `var(--pandwind-dynamic-...)` utility and the adapter's host
rewrite binds the original expression inline. Existing style props and
non-JSX hosts remain explicit residuals. UnoCSS uses the same shared class-host
port and retains the same fail-closed behavior for unsupported host shapes.

The target policy also carries an explicit `requiresHostContext` contract and
an adapter-owned explanation. MUI uses it for `sx`: bare style values now stop
before target emission, while a real host prop can still receive the projected
object representation.

The reverse-route contract now checks the emitted syntax itself. A clean
forward route must either convert or report an explicit residual when the
generated file is fed back through the source adapter; a no-op with no
diagnostic is a contract failure. Tailwind and UnoCSS arbitrary utility
literals, named lookup maps, and standalone projections are parsed by their
own adapters, while comment literals remain excluded.

The remaining production-proof and semantic families are:

- runtime interpolations, themes, and function-valued styles;
- composition, recipes, and variant systems;
- custom styled-component subjects, `attrs`, polymorphism, and complex
  use-site rewrites (static intrinsic class subjects are now covered);
- JSS imperative rule application and plugin-generated styles;
- globals, keyframes, font-face, layers, supports, selectors, nesting, and
  ordering;
- framework props/bindings across React, Preact, Vue, Svelte, Astro, Solid,
  React Native, and OpenTUI;
- official project configuration, presets, plugins, generated CSS, and custom
  token/shortcut/variant context;
- SSR, hydration, streaming/RSC, injection order, and dependency changes.

The remaining skips are therefore not evidence that the HIR is missing. They
identify target projections or host facts that still need an implementation:
for example, a dynamic value without a host binding, MUI's `sx` object prop
on an unsupported framework, or a custom component whose prop-forwarding
contract is unknown. The current representative static fixture audit has no
framework-boundary skips: static styled-components → Solid-styled and
styled-components → Vue-styled are handled by their target-owned component
projections. Dynamic/function-valued subjects, React-specific props, and
template-only framework behavior remain explicitly residual and still require
their own target-owned rewrites and proofs.

The diagnostic is intentionally route-specific. `capability-blocked` means the
target adapter's declared representations were exhausted after lowering and
host negotiation; `lowering-residual` means the IR contains a semantic that no
registered lowering can carry; `host-framework` means syntax or prop ownership
cannot be rewritten safely. In each case the source remains intact. A target
adapter becomes bidirectionally usable by adding a representation and its
substitution proof, not by making the capability report permissive.

After the class-host projection revision, the deterministic matrix reports
`4,056` cases, `0` route failures, `274` cases with typed residuals, and `271`
source-preserving skips. The largest remaining groups are free theme
expressions inside styled subjects, framework-specific component subjects,
and project utilities whose official preset/generator context is unavailable.
They are actionable semantic/configuration gaps, not the obsolete generic
`adapter capability mismatch` diagnosis. If that exact text appears in the
playground, its bundle or migrated artifact is stale and must be rebuilt.

The shared host boundary also distinguishes a discarded static styled
expression from a component-valued subject. The former can be lowered directly
to a class carrier because no component value escapes; the latter remains
subject to host/component negotiation. This removes a common false-positive
`components` blocker without weakening safety for assignments, calls, returns,
exports, or JSX/template uses.

### Why the playground shows capability skips

The playground currently invokes the semantic runner in `safe` mode. In that
mode, an adapter capability marked `partial` is intentionally treated as a
blocker, even when the adapter can emit a useful projection for a narrower
host shape. The route planner now asks target-owned lowering and host ports for
a static or target-native representation first. A remaining skip therefore
means that negotiation found no proven carrier for the actual program and
exposes the exact missing host/configuration input.

In particular, a bare Pandwind style binding cannot be rewritten to MUI's
`sx` prop without knowing its host component. Inventing a component or
changing a class-valued binding into an object would change the program's
contract. The completion work therefore has two obligations: discover host
context through the shared workspace when it exists, and preserve a typed
residual when it does not. Switching every route to partial mode is not a
completion strategy because it can report a conversion while dropping the
source value's host semantics.

The canonical route outcome is consequently one of `static`, `target-native`,
`host-runtime`, `portable-artifact`, or `residual`. Capability negotiation is
complete only when the outcome is explicit, the selected representation is
validated, and the route report explains why a later representation was not
selected.

## Workstreams

### 1. Freeze one route architecture

- Keep one versioned adapter/plugin contract containing identity, detection,
  configuration, parsing, emission, dependencies, capabilities, lowering,
  validation, lossiness, host rewrites, and provenance.
- Keep ecosystem behavior inside one adapter plugin/folder. Shared orchestration
  must only depend on ports and registries.
- Make representation negotiation explicit: static map, class map, native
  map, component wrapper, custom property, runtime carrier, or residual.
- Make capability and representation IDs typed and registry-owned.
- Add substitution tests proving that a fake source/target/lowering/host can be
  registered without editing the orchestrator.
- Promote Panda, Tailwind, and the core Pandwind dialects from the legacy
  `SwapIR` registry into this same adapter registry. Keep `SwapIR` behind a
  source/target compatibility projection so the fast path remains cheap.
- Derive CLI, playground, conformance, and differential route lists from the
  unified registry; no proof may maintain a second hardcoded adapter list.

### 2. Complete semantic lowering

For every HIR node and metadata field, add a registered lowering strategy and
target-specific proof:

- literal and token values;
- theme reads, theme callbacks, and project token context;
- dynamic scalar values and function-valued styles;
- named maps, variants, recipes, composition, and ordered precedence;
- component subjects, custom subjects, `attrs`, polymorphic `as`, and wrapper
  props;
- globals, keyframes, font-face, layers, supports, property rules, selectors,
  nesting, and order;
- plugin transforms and generated declarations;
- framework-specific prop/style/class bindings;
- runtime context, SSR, hydration, RSC, and streaming metadata.

Every lowering must state whether it is static, target-native, host-runtime,
or residual-producing, preserve provenance, and be independently unit tested.

### 3. Complete official project context

- Use official loaders when an ecosystem exposes them.
- Load custom presets, plugins, themes, tokens, shortcuts, variants, generated
  CSS, and framework configuration through adapter-owned ports.
- Pass normalized context into parsing, lowering, emission, and validation.
- If a loader is missing, fails, or cannot evaluate a construct, emit an
  explicit configuration residual; never silently fall back while claiming
  full parity.
- Add fixtures for customized Panda, Tailwind, UnoCSS, Chakra, MUI, Mantine,
  Tokenami, StyleX, Stitches, Vanilla Extract, and the remaining adapters.

### 4. Make every direction testable

For every unified registered pair `X × Y`, test both directions and both
capability modes:

- unit: parser, semantic normalization, lowering, emitter, validator, and
  residual edge cases;
- integration: real registry, scanner, project context, route orchestration,
  import/dependency rewrite, and idempotency;
- browser: computed styles, pseudo states, responsive states, injection order,
  and host behavior;
- SSR/hydration: markup, CSS, style deduplication, and client replacement;
- streaming/RSC where the host supports it;
- canonical CSS and size comparison;
- structured residual and lossiness assertions.

The matrix must include legacy `SwapIR` endpoints after promotion, not merely
the modern external-adapter subset. Every route must have a source fixture and
a target fixture; source-only or target-only adapters are incomplete unless
their declared role explicitly excludes that direction and the exclusion is
represented as a typed contract result.

A route that cannot be fully represented is still a passing safety outcome only
when its residual is explicit, source-preserving, and actionable. A green route
count alone is not proof.

### 5. Promote reproducible real repositories

- Pin one or two real repositories per supported source ecosystem by commit.
- Keep repositories out of the product tree; provide a deterministic materialize
  and migration script with commit hashes and dependency lock information.
- Run every supported Pandwind target API against each corpus where the source
  semantics make that route meaningful.
- Require build, typecheck, lint, browser, SSR, hydration, applicable streaming,
  canonical CSS, bundle-size, and residual checks.
- Record per-adapter/per-capability evidence, manual fixes, and remaining
  residual classes.

### 6. Enforce completion gates

CI must fail when:

- a registered adapter lacks direct, integration, and real-corpus evidence;
- a declared capability has no lowering and meaningful proof;
- unsupported semantics disappear without a residual;
- a static input unnecessarily uses a runtime carrier;
- a runtime fallback lacks a host/configuration proof;
- a route emits the obsolete generic capability marker;
- browser output includes Node-only code;
- canonical CSS, browser, SSR, hydration, streaming, or size parity regresses;
- Knip finds unowned exports or generated artifacts are mistaken for source.

## Definition of done

The plan is complete only when each registered adapter can be selected as source
or target, every pair is exercised in both directions, every declared
capability has a passing proof, and every undeclared/unrepresentable semantic
produces a structured residual. Static extraction wins whenever source meaning
is statically knowable; runtime is a rare, validated fallback. The final docs
must state the exact proven capability boundary and include reproducible commands
for the matrix and real-repository corpora.

## Execution order

`route architecture → semantic lowering → official context → bidirectional
contract suites → real-repository promotion → browser/SSR/RSC proof → CI/docs
completion`.

Each workstream is delivered in focused JJ revisions with its own tests and
evidence. Do not mark this plan complete because a residual matrix is green;
completion requires the stronger gates above.
