# Idiomatic Tailwind utility lowering plan

## Context

The Tailwind target currently emits arbitrary-property utilities for generic
CSS declarations, for example `[color:red] [padding:1rem]`. This is a valid,
conservative representation: it preserves the original property exactly and
works for custom properties and unusual values. However, Tailwind also has
property-aware arbitrary-value utilities such as `text-[red]` and `p-[1rem]`.

Pandwind already has the required architectural boundaries:

- `StyleProgram` carries rich semantic declarations and token provenance;
- flat `SwapIR` remains the fast path for simple declaration swaps;
- the Tailwind adapter owns target-specific emission;
- official Tailwind project context can expose configured utilities, tokens,
  variants, and plugins;
- differential validators can compare canonical CSS, browser behavior, SSR,
  hydration, and output size.

The current emitter does not yet have a verified property-aware candidate
selection policy. Related work includes [Plan 040](./040-pivot-any-to-any-lowering.md),
[Plan 041](./041-any-direction-adapter-completeness.md), and
[Plan 044](./044-ast-config-and-project-context.md).

## Goal

Emit the most idiomatic Tailwind utility that is provably equivalent to the
source declaration, while retaining the arbitrary-property form whenever a
candidate is ambiguous, unsupported, custom, or not verified by the effective
project configuration.

The improvement is primarily about target-native source quality and secondarily
about CSS size. It must never trade semantic equivalence for a shorter or more
familiar class string.

## What

Add a target-owned, property-aware utility selection policy to the Tailwind
adapter. For each statically known declaration it should:

1. preserve an exact verified target token when one exists;
2. generate a small set of property-aware arbitrary-value candidates;
3. reject candidates whose Tailwind namespace is ambiguous or whose generated
   CSS does not match the source declaration;
4. use the candidate only when the official Tailwind engine and canonical CSS
   validator prove equivalence;
5. fall back to `[property:value]` for custom, ambiguous, dynamic, or
   unverified declarations;
6. retain structured provenance explaining the selected representation.

The policy is internal to the Tailwind target adapter. It must not add a new
author-facing Pandwind API or leak Tailwind-specific branches into the route
runner, semantic core, or generic serializer.

Candidate families should initially cover only unambiguous, high-value
properties:

| Source property family              | Candidate shape                                 | Constraint                                                   |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `padding`, `padding-*`              | `p-[value]`, `px-[value]`, `py-[value]`, etc.   | Preserve the exact longhand/shorthand semantics.             |
| `margin`, `margin-*`                | `m-[value]`, `mx-[value]`, `my-[value]`, etc.   | Preserve negative and logical-value behavior.                |
| `gap`, `row-gap`, `column-gap`      | `gap-[value]`, `gap-x-[value]`, `gap-y-[value]` | Verify the axis mapping.                                     |
| `background-color`                  | `bg-[value]`                                    | Verify color parsing and opacity behavior.                   |
| `color`                             | `text-[value]`                                  | Use only after value-type disambiguation.                    |
| `border-radius` and logical radii   | `rounded-[value]`, axis variants                | Preserve each corner and logical side.                       |
| `width`, `height`, min/max variants | `w-[value]`, `h-[value]`, etc.                  | Verify intrinsic, percentage, viewport, and `calc()` values. |

This table is a candidate catalog, not a hardcoded source of truth for project
support. Custom utilities, aliases, variants, and plugin output must come from
the effective Tailwind context and official engine.

## Why

The arbitrary-property form is correct but is not the form a Tailwind expert
would normally author for common declarations. Idiomatic output improves
readability, interoperability with Tailwind tooling, reviewability, and the
chance of reusing configured utilities or tokens.

Blanket conversion is unsafe. Tailwind namespaces can be ambiguous, CSS
variables may need explicit type hints, plugins may redefine utilities, and
custom properties may not have a native namespace. The expert choice is a
verified candidate policy with a precise fallback, not a larger list of
guesses.

## How

### Conceptual model

```text
StyleProgram / SwapIR declaration
              |
              v
     verified token matcher
              |
              v
 property-aware candidate generator
              |
              v
 official Tailwind engine verification
              |
       +------+------+
       |             |
 exact candidate   rejected / ambiguous
       |             |
       v             v
 target utility   [property:value]
       |             |
       +------v------+
        canonical CSS + browser/SSR validators
```

### Operations / behavior

#### Candidate generation

For a declaration `(property, value, conditions, projectContext)`, the policy
produces ordered candidates with a reason and confidence:

```ts
interface TailwindUtilityCandidate {
	readonly className: string;
	readonly property: string;
	readonly value: string;
	readonly source: "token" | "property-aware" | "arbitrary-property";
	readonly requiresTypeHint: boolean;
}
```

Candidates must retain the original conditions, declaration priority, and
provenance. A candidate generator must never convert a shorthand into a
different set of longhands merely because the class name looks shorter.

#### Type disambiguation

For ambiguous namespaces such as `text-*`, use the effective Tailwind value
type and generated CSS to distinguish color, font size, line height, and other
interpretations. If the value cannot be proven, emit the arbitrary-property
fallback. For CSS variables, use an explicit Tailwind type hint only when the
official engine accepts it and the resulting declaration is equivalent.

#### Official verification

The adapter should batch candidate verification by project-context fingerprint
and cache results by `(context, candidate, conditions)`. Verification should
use the official Tailwind engine already loaded for the project, including:

- custom `@utility` definitions;
- `@plugin` output;
- imported CSS entries and `@reference` graphs;
- custom variants and theme values;
- preset and plugin configuration.

The verifier returns generated CSS or a typed rejection. It must not infer
support from a candidate spelling alone.

#### Token preference

Before generating arbitrary values, match the resolved declaration against the
project's verified Tailwind token/utility catalog. Use a token only when the
property-aware resolved value is an exact, unique match. Preserve the source
token provenance in `StyleProgram`; do not invent a token name from a similar
literal.

#### Fallback

The fallback remains `[property:value]`. It is required for:

- custom properties and unknown CSS properties;
- ambiguous or rejected namespaces;
- plugin/configuration contexts that cannot be loaded or verified;
- values whose static meaning is incomplete;
- declarations where canonical CSS differs;
- candidates that increase output beyond the configured policy without a
  justified target-native benefit.

Fallback selection is a successful safe outcome, not an unexplained residual.
The migration report should identify whether it was selected because of
ambiguity, unavailable configuration, unsupported syntax, or validator failure.

### Tech choices

| Choice              | Decision                                 | Rationale                                                               |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Candidate authority | Effective official Tailwind engine       | Custom utilities, plugins, variants, and presets are project semantics. |
| Generic fallback    | Keep `[property:value]`                  | It is exact for arbitrary declarations and custom properties.           |
| Token matching      | Exact, property-aware, unique match only | Prevents plausible but incorrect token substitutions.                   |
| Verification scope  | Batch and cache by project context       | Avoids invoking the engine once per declaration.                        |
| Rich path           | `StyleProgram`                           | Carries conditions, rules, provenance, and representation decisions.    |
| Fast path           | Preserve flat `SwapIR`                   | Simple migrations should not pay for the richest planner.               |
| Public API          | No new author-facing API                 | The improvement belongs to the existing Tailwind target adapter.        |

### Architecture

```text
Tailwind target adapter
  ├─ TailwindContextLoader
  ├─ TailwindTokenMatcher
  ├─ TailwindUtilityCandidatePolicy
  ├─ TailwindOfficialVerifier
  ├─ TailwindFallbackEmitter
  └─ TailwindRepresentationValidator

StyleMigrationUseCase
  └─ target adapter interface only
```

The route runner sees a target representation and validator result. It must not
know that Tailwind chose `p-[1rem]` rather than `[padding:1rem]`.

## What this allows

- Common declarations to migrate into idiomatic Tailwind utilities.
- Exact custom tokens to remain tokens instead of becoming arbitrary values.
- Custom `@utility`, `@plugin`, preset, variant, and imported-CSS behavior to
  participate in candidate verification.
- Ambiguous or unsupported values to remain correct through the existing
  arbitrary-property fallback.
- Candidate verification to be cached and batched without changing semantics.
- Inline snapshots to show why each candidate or fallback was selected.

## What this does not allow

- Blindly translating every CSS property into a guessed Tailwind namespace.
- Treating a shorter class string as proof of equivalent CSS.
- Loading arbitrary project configuration in the browser or bundler runtime.
- Inventing token names when project metadata is absent or ambiguous.
- Claiming that arbitrary plugin-generated behavior is supported without
  official-engine and differential evidence.
- Changing the frozen `tw`, `css`, `cx`, or design API surface.

## UI & UX

This is primarily a codemod and adapter-output change. No new runtime UI is
required.

### Desktop

Migration reports and inspector output should show the selected form:

```text
padding: 1rem
→ p-[1rem]
  verified by: tailwind official engine

color: red
→ [color:red]
  fallback: text namespace is ambiguous in this project
```

### Mobile

The same representation reason should be available in the compact residual or
conversion detail; the source output remains unchanged by the reporting mode.

### Common interactions

| Action                          | Result                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| Run a Tailwind migration        | Candidate selection is verified against the effective project context.  |
| Inspect a converted declaration | The report explains token, property-aware, or fallback selection.       |
| Run with unavailable config     | The safe fallback or structured configuration residual remains visible. |
| Re-run the migration            | Candidate decisions are deterministic and idempotent.                   |

## Data model

The internal target decision should be serializable in migration evidence:

```ts
interface TailwindUtilityDecision {
	readonly representation: "token" | "property-aware" | "arbitrary-property";
	readonly candidate: string;
	readonly property: string;
	readonly value: string;
	readonly verified: boolean;
	readonly reason:
		| "exact-token"
		| "verified-property-aware"
		| "ambiguous-namespace"
		| "custom-property"
		| "official-verification-unavailable"
		| "canonical-css-mismatch"
		| "unsupported-value";
	readonly contextFingerprint?: string;
}
```

The decision belongs in target-owned representation metadata and must not be
encoded only as an unstructured residual string.

## Implementation steps

1. Inventory the current Tailwind emitters and identify every path that emits
   `[property:value]`; preserve the existing behavior as the explicit fallback.
2. Define the internal candidate/decision contract and add a default policy
   implementation behind the Tailwind adapter interface.
3. Build the initial property-aware candidate catalog for padding, margin, gap,
   background color, color, radii, dimensions, and logical variants.
4. Add exact property-aware token matching using the effective Tailwind token
   and utility catalog; reject ambiguous or cross-preset matches.
5. Connect candidate verification to the official Tailwind engine, including
   imported CSS, `@utility`, `@plugin`, custom variants, presets, and
   `@reference` contexts. Batch and cache verification.
6. Integrate the decision policy into both rich `StyleProgram` emission and
   the flat `SwapIR` path without routing simple calls through unnecessary
   semantic machinery.
7. Add focused inline-snapshot tests for every candidate family, including
   ambiguous `text-*`, CSS variables/type hints, negative values, logical
   properties, custom properties, and plugin/custom-utility contexts.
8. Add ordinary assertions alongside every snapshot for exact conversion,
   canonical CSS equality, fallback reason, token provenance, idempotency, and
   no silent residuals.
9. Add browser, SSR, hydration, and CSS-size differential fixtures for the
   property-aware and fallback forms, including custom Tailwind configuration.
10. Update the Tailwind adapter documentation and proof matrix with the
    verified candidate boundary and measured output-size results.

## Open questions

1. Which official Tailwind engine API gives the most stable and efficient
   candidate verification boundary across supported Tailwind versions?
2. Should candidate verification compare only the affected declarations or
   the complete generated rule including ordering and layer metadata?
3. What output-size threshold should reject a verified idiomatic candidate when
   it is materially larger than the arbitrary-property fallback?
4. Which logical-property candidates should be enabled initially, given
   writing-mode and browser normalization differences?
5. Should verified candidate decisions be persisted in migration evidence for
   future deterministic replay, or recomputed from the pinned project context?

## Acceptance criteria

- [ ] The existing `[property:value]` output remains a correct explicit
      fallback for custom, ambiguous, dynamic, and unverified declarations.
- [ ] Property-aware candidates are generated only by the Tailwind target
      adapter through an injectable policy.
- [ ] Every emitted property-aware candidate is verified by the effective
      official Tailwind engine or rejected safely.
- [ ] Exact configured tokens win over arbitrary values when property-aware and
      uniquely proven equivalent.
- [ ] `text-*` ambiguity, CSS variables, custom properties, negative values,
      logical properties, and plugin utilities have explicit tests.
- [ ] Custom `@utility`, `@plugin`, presets, variants, imported CSS, and
      `@reference` contexts are covered without corpus-specific branches.
- [ ] `StyleProgram` provenance records the selected representation and reason.
- [ ] The flat `SwapIR` fast path remains available and behaviorally correct.
- [ ] Inline snapshots are paired with executable assertions and cannot be
      updated alone to hide a semantic regression.
- [ ] Browser computed-style, SSR, hydration, canonical CSS, and CSS-size
      differential checks pass for the supported candidate families.
- [ ] Re-running migration is deterministic and does not oscillate between
      candidate and fallback forms.
- [ ] No new author-facing Pandwind API or generic Tailwind branch is added.

## Decisions log

| Date       | Decision                                                         | Rationale                                                                         |
| ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-09-02 | Keep `[property:value]` as the correctness fallback              | It is exact for custom and ambiguous declarations.                                |
| 2026-09-02 | Prefer property-aware utilities only after official verification | Tailwind namespaces and plugins can be ambiguous; spelling alone is not evidence. |
| 2026-09-02 | Prefer exact project tokens before arbitrary values              | Expert target code reuses verified design-system context without inventing names. |
| 2026-09-02 | Keep the work inside the Tailwind target adapter                 | Candidate syntax is target policy, not semantic-core or route-runner policy.      |
