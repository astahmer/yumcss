# Codemod conversion audit

Status: in progress  
Started: 2026-09-06  
Scope: every generated directional scenario in `packages/codemod/tests/routes` and every generated round-trip scenario in `packages/codemod/tests/roundtrips`.

This is a review ledger, not a snapshot approval list. A scenario is only marked
checked after its source uses a documented API, its configured and unconfigured
inputs are meaningful for that adapter, its result is classified correctly, and
the test has assertions for conversion, residuals, emitted API shape, and
configuration evidence where those concepts apply. A passing snapshot by itself
does not close an item.

## Inventory

The generated matrix currently contains 31 adapters, 930 directional files, and
930 round-trip files. Each directional file contains five scenarios; each
round-trip file contains four scenarios. The files are generated, but the
adapter-specific source catalog and the assertions remain part of the audit
surface.

| Source adapter | Directional routes | Round trips | Source API/config review | Status |
| --- | ---: | ---: | --- | --- |
| pandwind | 30 | 30 | pending | pending |
| panda | 30 | 30 | pending | pending |
| stylex | 30 | 30 | pending | pending |
| emotion | 30 | 30 | pending | pending |
| styled-components | 30 | 30 | pending | pending |
| vanilla-extract | 30 | 30 | pending | pending |
| stitches | 30 | 30 | pending | pending |
| linaria | 30 | 30 | pending | pending |
| jss | 30 | 30 | pending | pending |
| fela | 30 | 30 | pending | pending |
| goober | 30 | 30 | pending | pending |
| aphrodite | 30 | 30 | pending | pending |
| treat | 30 | 30 | pending | pending |
| compiled | 30 | 30 | pending | pending |
| chakra-ui | 30 | 30 | pending | pending |
| mui | 30 | 30 | pending | pending |
| mantine | 30 | 30 | pending | pending |
| next-yak | 30 | 30 | pending | pending |
| bamboo | 30 | 30 | pending | pending |
| style9 | 30 | 30 | pending | pending |
| solid-styled | 30 | 30 | pending | pending |
| vue-styled | 30 | 30 | pending | pending |
| react-native | 30 | 30 | pending | pending |
| tailwind | 30 | 30 | pending | pending |
| tokenami | 30 | 30 | pending | pending |
| unocss | 30 | 30 | pending | pending |
| tamagui | 30 | 30 | pending | pending |
| css-modules | 30 | 30 | pending | pending |
| sass | 30 | 30 | pending | pending |
| less | 30 | 30 | pending | pending |
| authored-css | 30 | 30 | pending | pending |

## Initial findings

These are fixture/test defects found before the adapter-by-adapter review. They
are intentionally recorded before fixes so later revisions can show what was
actually corrected.

- **AUDIT-001 — generated routes used a synthetic source catalog instead of the
  official API catalog.** `scripts/generate-adapter-route-specs.ts` has a second
  `happySource` switch. It diverges from `official-api-cases.ts` and contains
  source-specific forms that are not consistently the documented API. This makes
  a green matrix insufficient evidence for the real adapter API. The generator
  now consumes `officialApiCases()` and the documented family catalog; the
  focused change is `cee23b7f`. Status: fixed, pending the full regenerated
  evidence run.
- **AUDIT-002 — configured and unconfigured route scenarios are not distinct in
  a useful way.** The generated `themedSource` and `tokenSource` helpers mostly
  replace the same literal or append an unused variable, and several project
  config shapes are not consumed by the relevant adapter. The tests often only
  assert that some result exists, so they can pass without proving config
  resolution. The route harness now supplies an in-memory project boundary,
  invokes the asynchronous official loaders, and records loader package calls.
  The blue/amber fixtures now differ in resolved theme values. Status: partial;
  target-specific token assertions and the remaining adapter batches are open.
- **AUDIT-003 — generated route assertions are outcome-shaped but not
  semantics-shaped.** Most route scenarios only assert `> 0`, residual marker
  presence, and a snapshot. They do not require the expected target carrier,
  token/condition spelling, or source preservation for the particular adapter
  pair. The shared route helper now checks actionability, lowering plans,
  outcomes, validations, generated-file integrity, and emitted slot artifacts.
  Target-specific carrier/token assertions are still open.
- **AUDIT-004 — round-trip fixtures can round-trip a residual marker without
  exercising the target adapter.** `expectActionableRoundTrip` now requires the
  reverse leg to act when the forward leg fully converted. The only unchanged
  fallback allowed is an explicit source-preserving residual or a generated
  Pandwind portable artifact. Status: fixed in the harness; the full round-trip
  matrix still needs to be run so every failure can be classified.
- **AUDIT-005 — the matrix has no durable per-scenario review ledger.** The
  generated file count is easy to verify mechanically, but there was no place to
  record which source API, configuration shape, target representation, and
  residual policy had been checked. This file is the ledger; it will be updated
  after each adapter batch and before each focused JJ revision is closed.

- **AUDIT-006 — the route generator erased inline snapshots before review.**
  The first regeneration wrote the new generated test bodies with empty
  `toMatchInlineSnapshot()` calls, leaving 1,849 files without evidence. This
  is a tooling/process defect even though snapshot regeneration is allowed after
  a deliberate fixture change. Status: open; snapshots are being restored in
  reviewed source and round-trip batches, and the generator needs a safer
  two-phase workflow before this audit closes.
- **AUDIT-007 — official UnoCSS context could reject target-generated arbitrary
  utilities.** The official loader replaced the fixed arbitrary-property
  resolver instead of composing with it, so an Emotion -> UnoCSS configured
  route reported a canonical validation residual for `[padding:1rem]`. The
  resolver now delegates to official generated CSS first and uses the narrow
  arbitrary syntax fallback second. Status: fixed in the working tree; focused
  official-context and route tests pass.
- **AUDIT-008 — portable target artifacts need an explicit round-trip policy.**
  Emotion -> MUI emits a valid Pandwind portable artifact for a standalone style;
  the Emotion reverse adapter correctly leaves that artifact unchanged. The
  round-trip assertion initially treated this as a broken no-op. The harness now
  accepts only an unchanged, explicitly portable `pandwind/` result, while still
  rejecting a no-op after a fully target-native conversion. Status: fixed and
  covered by the focused round-trip fixture.

## Review protocol

For each source adapter, review the source fixture against the adapter's official
API declarations and family cases, then inspect representative targets across
the target families. Every route/round-trip file generated from that source must
be regenerated only after the source fixture and assertions are correct. Tests
must cover:

1. a no-config documented API form;
2. a real project-config form when the adapter supports configuration;
3. a source token/theme/condition or an explicit reason that the concept does
   not exist for that adapter;
4. a dynamic or unsupported form that preserves source and reports a typed
   residual;
5. target-native output and ordinary assertions in addition to snapshots.

## Checkpoints

- 2026-09-06: inventory created; no adapter batch is closed yet.
- 2026-09-06: sampled primary/configured scenarios for emotion, panda, pandwind,
  styled-components, and tailwind; fixed the UnoCSS configured arbitrary utility
  path; no source adapter is closed until its full directional and round-trip
  batch is reviewed.
