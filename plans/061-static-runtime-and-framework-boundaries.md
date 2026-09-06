# Plan 061: make static, runtime, and framework boundaries explicit

## Goal

Make every styling construct in Pandwind choose an explicit, testable execution
lane: build-time static output, runtime output, authored CSS, or host/framework
integration. The user should get an actionable diagnostic when a construct
cannot use the selected lane, and a migration should preserve source semantics
when it cannot lower safely.

This plan addresses the main semantic criticism of the current product: the
static/runtime boundary is real, but it is spread across APIs, generated
artifacts, adapters, and host integrations. A user can currently discover the
boundary only after reading several documents or observing a generated result.

## Context

The current implementation already has useful escape hatches and diagnostics:

- dynamic `tw()` values can require a safelist;
- dynamic `css()` values can use runtime variables;
- globals, keyframes, font-face rules, layers, and authored CSS are not all
  equivalent to declaration-first style objects;
- framework and SSR semantics belong to the host integration;
- adapter loaders may depend on unstable or optional ecosystem APIs.

The problem is not that every construct must become static. The problem is that
the supported lane, required evidence, and failure mode are not represented by
one coherent capability contract.

## Scope

- Define a neutral capability matrix for style constructs, properties, values,
  conditions, compositions, authored CSS, and host lifecycle requirements.
- Make static, runtime, authored-CSS, and host-owned lanes visible in the
  existing StyleProgram/adapter metadata and reports.
- Ensure dynamic `tw()` and `css()` paths produce typed diagnostics with the
  exact reason, required runtime support, and safe next action.
- Prove CSS variables and runtime values preserve semantics through browser,
  SSR, and hydration fixtures.
- Give globals, keyframes, font-face, layers, and authored CSS an explicit
  ownership boundary instead of treating them as ordinary local declarations.
- Define framework host contracts for React, Vue, Solid, and server rendering
  where the current implementation claims support.
- Isolate official ecosystem loader compatibility behind an injectable adapter
  boundary and a compatibility probe, so an unstable loader failure cannot be
  mistaken for an empty project configuration.
- Derive the limitations reference and playground/MCP capability labels from
  the same registry where practical.

## Non-goals

- Making every dynamic value statically enumerable.
- Adding a new public styling API or changing the frozen `tw()`/`css()`/`cx()`
  surface.
- Reimplementing Tailwind, Panda, UnoCSS, or another ecosystem's resolver.
- Hiding an unsupported construct by dropping it or silently replacing it with
  a guessed token.
- Promising framework behavior that is owned by a host plugin or application.

## Proposed shape

```text
source expression / authored CSS
              |
      language + source adapter
              |
      StyleProgram + provenance
              |
     capability / lane registry
       /          |          \
   static      runtime      authored CSS
       \          |          /
          host/framework contract
              |
      lowering + diagnostic report
```

The registry describes semantic requirements rather than ecosystem names. An
adapter supplies the evidence it owns; the runner asks the registry whether a
target lane is valid. The result contains the selected lane, required inputs,
and a typed residual/diagnostic when the lane is unavailable.

## Architecture

Introduce or consolidate these internal ports at the owning boundaries:

- `StyleCapabilityRegistry`: resolves construct and property requirements from
  neutral StyleProgram metadata.
- `ExecutionLanePolicy`: selects static, runtime, authored-CSS, or host-owned
  output and explains why.
- `RuntimeValueCarrier`: describes the existing runtime variable/safelist
  mechanisms without exposing a second authoring API.
- `AuthoredCssBoundary`: represents CSS that must remain in a stylesheet or
  official host pipeline, including provenance and ordering requirements.
- `FrameworkHostContract`: validates the host obligations for rendering,
  SSR, hydration, and component props.
- `ConfigLoaderPort`: loads official project configuration asynchronously and
  returns structured unavailable/error evidence instead of an empty catalog.

Each default implementation remains replaceable in tests. Shared orchestration
must consume the ports and neutral metadata; ecosystem-specific vocabulary and
loader behavior remain in the owning adapter.

## Implementation steps

1. Inventory the current StyleProgram, SwapIR, runtime-sheet, safelist, CSS
   emission, and host integration metadata. Mark which existing fields already
   represent a capability and which are only residual prose.
2. Define the capability and execution-lane contract with stable identity tags,
   serialization types, provenance, and a structured explanation shape.
3. Register the current supported constructs and deliberately unsupported
   constructs. Cover static values, dynamic values, conditions, compositions,
   token references, CSS variables, authored CSS, globals, keyframes,
   font-face, layers, and runtime theme context.
4. Route lowering decisions through the registry while preserving the flat
   SwapIR fast path. Add conservative fallbacks that retain source and emit a
   typed residual when evidence is missing or ambiguous.
5. Move dynamic-value diagnostics into the owning target/source adapters. A
   diagnostic must state whether the user needs a safelist, runtime sheet,
   authored CSS, host integration, or manual review.
6. Add browser, SSR, and hydration fixtures for representative runtime values,
   CSS variables, conditions, theme changes, and composed classes. Assert the
   actual emitted CSS and rendered behavior.
7. Add authored CSS fixtures for globals, keyframes, font-face, layers, import
   ordering, and CSS-module boundaries. Verify that the output keeps ordering
   and ownership instead of pretending the rule is a local class.
8. Add loader compatibility probes for the supported Tailwind/Panda/UnoCSS
   paths. Test official/default metadata, custom metadata, disabled features,
   missing optional packages, and loader failure diagnostics.
9. Generate or validate the limitations/scorecard entries from capability
   evidence where doing so does not couple documentation to runtime code.
10. Update the playground and MCP reports to show the selected lane and
    evidence. A successful static lowering must not imply that runtime,
    authored CSS, or framework behavior was verified.

## Tests and evidence

- Unit tests for each capability and lane policy, including a fake registry
  implementation registered without changing shared orchestration.
- Source-specific issue fixtures with inline snapshots plus ordinary asserts
  for lane, output, residuals, provenance, imports, and ordering.
- Positive and conservative tests for every dynamic and unsupported construct.
- Browser tests for generated CSS and runtime behavior.
- SSR/hydration tests for each supported host contract.
- Official-loader compatibility tests using a real temporary project fixture and
  an unavailable/failing-loader fixture.
- A report check proving that no capability is marked statically supported
  without an applicable proof fixture.

## Acceptance criteria

- Every supported construct has one explicit lane and a named evidence source.
- Every unsupported, dynamic, ambiguous, or unavailable case preserves source
  semantics and exposes a typed residual/diagnostic.
- Runtime values, CSS variables, globals, keyframes, font-face, layers, and
  authored CSS have browser or stylesheet-ordering proof where applicable.
- SSR and hydration checks distinguish host verification from pure codegen.
- Official-loader failures are visible and never become an empty successful
  configuration.
- The limitations reference, playground labels, MCP reports, and adapter
  validation agree on the same capability vocabulary.
- The frozen public authoring API is unchanged.

## Risks and trade-offs

- A richer capability contract adds internal structure and may initially expose
  more residuals. That is preferable to silently claiming support.
- Some host behavior cannot be proven in the core repository. Those checks must
  remain explicitly unavailable until a host fixture supplies them.
- Official loader APIs can change. The compatibility probe and injected loader
  port reduce coupling but cannot eliminate ecosystem churn.

## Decisions log

- **2026-09-07** — Treat the static/runtime/framework boundary as one semantic
  policy domain rather than adding more ad-hoc flags to individual APIs.
- **2026-09-07** — Preserve existing fast paths and public APIs; improve the
  evidence and diagnostics around them.
