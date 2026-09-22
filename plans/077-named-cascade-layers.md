# Named cascade layers plan

Status: accepted and implemented in the current work.

## Context

- Pandwind already supports `cascade: "specificity"` and `cascade: "layers"`.
- Layer mode currently wraps the complete generated sheet in a fixed
  `@layer pandwind` block.
- The same cascade policy is consumed by pure stylesheet generation, the Vite
  extractor, runtime sheets, and publishable library-artifact compatibility.
- `createCss`, `createDesignCss`, and `createGeneratedCss` are composition
  factories; `createCss` carries factory metadata but does not emit CSS itself.
- The public CSS API is intentionally small, so the addition must remain
  opt-in and must not create a per-call styling surface.

## Goal

Allow an application or component library to choose the native cascade layer
that contains Pandwind's generated rules while preserving the current default.

The configured layer must stay consistent across static extraction, runtime
SSR/DOM output, Vite HMR, and library artifacts.

## What

Extend the cascade policy with a structured named-layer form:

```ts
type CssCascade = "specificity" | "layers" | { mode: "layers"; layer: string };
```

`cascade: "layers"` remains the shorthand for `@layer pandwind`. The
structured form accepts a validated dotted CSS identifier path such as
`app.utilities`.

The layer applies to the generated sheet as a whole: token declarations,
keyframes, atomic rules, and variable-carrier rules share the configured outer
layer. It does not change atomic ordering, specificity bands, class names, or
rule-level authored `@layer` semantic rules.

## Why

Applications embedding Pandwind commonly already have an ordered layer plan,
and component libraries may need generated rules to live under an owned layer
such as `components` or `app.utilities`. Requiring every consumer to rename or
wrap the emitted virtual stylesheet externally weakens the composition
boundary and cannot describe the policy in a publishable library artifact.

## How

### Conceptual model

```text
createCss(preset, cascade policy)
             |
             v
   factory metadata / runtime options
       |          |          |
       v          v          v
  Vite CSS   pure sheet   runtime sheet
       |          |          |
       +----------+----------+
                  v
       @layer <configured layer> { ... }
```

### Operations / behavior

- Normalize the legacy string forms and structured named-layer form through
  one shared cascade helper.
- Validate layer paths before serializing them into CSS.
- Preserve `pandwind` for the existing `"layers"` shorthand.
- Carry the resolved layer into library-artifact compatibility fingerprints.
- Bump the publishable artifact envelope to `pandwind.lib/2`; old artifacts
  fail closed rather than being interpreted with incomplete compatibility data.
- Expose `--cascade-layer <name>` for `pandwind-codemod lib build`, requiring
  `--cascade layers`.

### Tech choices

| Choice             | Decision                                | Rationale                                                                                                                          |
| ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| API shape          | Structured value nested under `cascade` | Prevents a loose layer option from silently doing nothing when layering is disabled.                                               |
| Existing shorthand | Keep `cascade: "layers"`                | Preserves the current default and keeps the common case compact.                                                                   |
| Layer scope        | One outer generated-sheet layer         | Keeps class generation and cascade ordering unchanged; per-call layers would require separate rule registries and split semantics. |
| Validation         | Unescaped dotted CSS identifier path    | Prevents CSS injection and keeps serialization deterministic without inventing an escaping contract.                               |
| Artifact version   | `pandwind.lib/2`                        | The compatibility schema gains a required layer field; stale v1 artifacts must fail closed.                                        |

### Architecture

The shared cascade module resolves the policy. Every emitter calls the same
wrapper, while artifact compatibility stores the normalized mode and layer
separately so JSON remains explicit and easy to validate.

## What this allows

- `@layer components`, `@layer app.utilities`, and other valid dotted layer
  paths for generated Pandwind CSS.
- Factory-owned layer policy inherited by `pandwindCssVite(css)`.
- Matching named-layer policy for runtime sheets and publishable artifacts.
- Host-controlled ordering through an authored `@layer` statement.

## What this does not allow

- A different layer for individual `css()` calls or individual declarations.
- A custom layer while using the `specificity` cascade mode.
- Layer names containing arbitrary CSS syntax or comma-separated layer lists.
- Automatic merging of artifacts built for a different layer.

## UI & UX

Not applicable. This is a TypeScript/CSS compiler and runtime option.

## Data model

The runtime option is a discriminated TypeScript value. Library artifacts store
the normalized representation:

```json
{
	"cascade": "layers",
	"cascadeLayer": "app.utilities"
}
```

## Implementation steps

1. Add the shared `CssCascade` type, default, validator, and resolver.
2. Thread the policy through CSS factories, pure stylesheet generation, Vite,
   runtime sheets, and tests.
3. Version and validate library-artifact compatibility, then add the codemod
   CLI flag and parser coverage.
4. Document application, reset/prose, component-library, and artifact usage.
5. Run focused CSS/Vite/runtime/artifact tests and package typechecks.

## Open questions

None for this implementation. Per-rule layer assignment remains a separate
semantic CSS feature and is intentionally not part of this change.

## Acceptance criteria

- [x] Existing `cascade: "layers"` output remains `@layer pandwind`.
- [x] A structured named layer is emitted identically by pure, Vite, and
      runtime paths.
- [x] Invalid layer paths fail closed before CSS serialization.
- [x] Library artifacts record and validate the selected layer.
- [x] The codemod library-build CLI accepts and documents named layers.
- [x] Focused tests and package typechecks pass.

## Decisions log

| Date       | Decision                                                 | Rationale                                                                                      |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-09-21 | Use a structured `cascade` value with a legacy shorthand | Keeps mode and layer ownership explicit without adding a silently inert top-level option.      |
| 2026-09-21 | Version artifacts as `pandwind.lib/2`                    | Layer identity is part of compatibility; old artifacts lack the field and must not be trusted. |

The later `plans/028-define-preset-web-notes.md` completion wave supersedes
the artifact envelope with `pandwind.lib/3` so generated preset-owned web CSS
is carried and validated alongside the existing rule entries.
