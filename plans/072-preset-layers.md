# Feature Plan: Explicit preset layers

**Status:** Complete
**Created:** 2026-09-16
**Owner:** Pandwind maintainers

## 1. Summary and context

Pandwind currently exposes `pandwindPreset` as a single built-in preset. Its
public token catalog is empty, but its property definitions embed the
opinionated Pandwind color, spacing, sizing, typography, border, radius, and
other scales. The separate `@pandwind/example-preset` package already serves a
different purpose: a rich showcase with application tokens, semantic tokens,
palettes, and theme composition.

These concerns should be explicit before more examples and ecosystem-flavored
presets are added. A consumer who wants only Pandwind's structural CSS
vocabulary should not accidentally opt into stock design tokens, while an
ordinary app should have a discoverable ready-to-use preset.

## 2. Goals

- Add a tokenless `basePreset` containing the structural property and condition
  contract.
- Add a ready-to-use `defaultPreset` containing the existing stock Pandwind
  token-aware property mappings.
- Publish both through dedicated `pandwind/preset/base` and
  `pandwind/preset/default` subpaths without creating another package.
- Keep `examplePreset` in `@pandwind/example-preset` as a rich showcase fixture,
  and make its role clear in docs and examples.
- Update internal consumers, documentation, package-surface evidence, editor
  declarations, and type/runtime tests to use the new names and paths.
- Preserve the existing structural property and condition coverage for the
  default preset while making the base contract independently importable and
  free of the stock token catalog.

## 3. Non-goals

- Do not add Tailwind-, Panda-, or Chakra-flavored presets in this change.
- Do not create a second package for preset layers.
- Do not add shorthands, `styled-system`, recipes, patterns, JSX factories, or
  a prebuilt-CSS publishing mode.
- Do not retain `pandwindPreset` as a deprecated compatibility alias; this is a
  pre-launch API rename and all repository callers will migrate atomically.

## 4. Proposed design

### Public API

```ts
import { createCss } from "pandwind/css";
import { basePreset } from "pandwind/preset/base";
import { defaultPreset } from "pandwind/preset/default";

const structuralCss = createCss(basePreset);
const appCss = createCss(defaultPreset);
```

`basePreset` will expose the common property names with open CSS values and no
opinionated token groups. `defaultPreset` will use the existing built-in
token-aware property mappings. The root `pandwind/preset` entry
will expose the shared builders/catalog values and the two named presets as
appropriate for the package's existing API shape; the dedicated subpaths are
the canonical imports used by docs and tooling.

The existing condition catalog remains shared because conditions describe
selector/media behavior rather than a design-token scale. The property catalog
will be split so the base subpath does not import the default token mappings.

### Data model

- `basePreset`: `define.preset({ config: {}, tokens: {} }, { strict: true,
conditions: presetConditions, properties: baseProperties })`.
- `defaultPreset`: `define.preset({ config: {}, tokens: {} }, { strict: true,
conditions: presetConditions, properties: presetProperties })`.
- `baseProperties`: the structural property-name catalog, with no embedded
  stock token maps.
- `presetProperties`: the existing token-aware default property catalog.
- `examplePreset`: unchanged semantically and still composed in its separate
  example package.

### Runtime behavior

Both presets continue to use the existing strict preset machinery and CSS
resolution paths. The base preset accepts raw CSS values for its structural
properties; it must not resolve stock `$token` references because it has no
token catalog. The default preset retains current token resolution and emitted
CSS behavior.

### Documentation and tooling

- Update README, docs, inspector, codemod defaults, and ordinary examples from
  `pandwindPreset` to `defaultPreset` and the explicit default subpath.
- Document the three tiers and when to choose base, default, or example.
- Add concise base/default usage examples and keep rich token/palette examples
  in the example-preset showcase.
- Add package export and checked-in evidence entries for both subpaths.
- Regenerate Playground editor declarations from workspace package exports.

## 5. Implementation steps

1. Add this plan and record the decision in a focused JJ revision.
2. Split the structural property catalog from the token-aware default catalog;
   introduce `basePreset` and rename the built-in preset to `defaultPreset`.
3. Add package exports/build entries and root re-exports, then migrate all
   repository consumers and remove the obsolete name.
4. Add runtime and type tests proving base has no stock token groups, default
   retains token-aware behavior, and both subpaths resolve correctly.
5. Update docs, examples, package-surface evidence, and generated editor types.
6. Run focused tests, package builds/typechecks, generated/surface checks, and
   inspect the final JJ diff and revision boundaries.

## 6. Risks and mitigations

- **Accidental token coupling:** keep base property definitions in a module
  that does not import the stock token map; verify its public declarations and
  runtime exports.
- **Silent API drift:** add negative/positive type tests and update every
  in-repo import with `rg` before validation.
- **Incorrect package metadata:** update `package.json`, build entries, and
  package-surface evidence together, then run the repository surface check.
- **Example confusion:** explicitly label `examplePreset` as showcase-only and
  use `defaultPreset` for ordinary app/docs paths.
- **Scope creep into ecosystem presets:** leave those as a later benchmarked
  design task; this change only establishes the three tiers.

## 7. Validation and acceptance criteria

- [x] `pandwind/preset/base` exports `basePreset` and its declarations contain
      no stock token catalog dependency.
- [x] `pandwind/preset/default` exports `defaultPreset` with the current
      token-aware CSS behavior.
- [x] No consumer source, docs, tests, or tooling references the removed
      `pandwindPreset` name.
- [x] Base/default runtime and type tests pass, including strict token behavior.
- [x] README/docs/examples describe and demonstrate the three tiers.
- [x] Package build, package-surface, generated-type, typecheck, and focused
      test checks pass.
- [x] JJ revisions are focused and the final working-copy revision is empty.

## 8. Open questions

None for this slice. Ecosystem-flavored starter presets remain intentionally
deferred until the styling ecosystem benchmark exists and can measure their
type-graph cost.
