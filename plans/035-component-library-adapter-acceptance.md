# Component-library adapter acceptance

Status: complete for the static and statically-resolvable host-style lanes.

This wave makes Chakra UI, MUI, and Mantine first-class source adapters beside
the existing Emotion, styled-components, Panda, Next-yak, and other CSS-in-JS
adapters. Each ecosystem owns one adapter module. The adapter only declares
source syntax, aliases, token policy, and capabilities; the shared
`JsxStyleHost` port owns opening-tag parsing and host-attribute reconstruction.

## Acceptance contract

- Component imports remain in the file when migrated style props belong to the
  component library. They are not incorrectly removed as source-runtime
  imports.
- Existing `className`/`class` attributes are merged through Pandwind `cx()`.
- Chakra aliases and pseudo props lower to canonical properties and selectors;
  known Chakra token names use Chakra CSS variables.
- MUI `sx` spacing aliases use the documented default spacing scale, inline
  palette literals are resolved when statically available, and custom theme
  callbacks remain safe residuals.
- Mantine style props and `style`/`sx` objects lower to canonical properties;
  known Mantine token values use Mantine CSS variables.
- Callback, array, spread, project-specific theme, and framework-specific
  forms that cannot be proven equivalent remain in place with a residual and a
  migration marker. They are never silently emitted as invalid CSS.
- The pinned real-repository report covers 22 source files, including one
  Chakra UI, one MUI, and one Mantine source file. The report records source
  and output bytes, canonical CSS parity/bytes where the adapter validator can
  expose the pair, plus dependency ownership; it deliberately does not claim a
  production bundle measurement without installing and building each project.

## Verification

The codemod package suite covers the registry, host rewrites, dynamic residuals,
real-repository corpus, and adapter validations. The generated evidence is
`plans/evidence/real-repository-migrations-v2.json`.

The adapter boundary remains open for additional host frameworks: a future Vue,
Svelte, or Astro style-prop adapter can reuse `JsxStyleHost` or provide its own
language host port without adding ecosystem branches to the migration
orchestrator.
