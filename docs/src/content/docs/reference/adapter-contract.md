---
title: CSS-in-JS adapter contract
description: The versioned semantic adapter protocol used by pandwind migrations.
sidebar:
  order: 7
---

pandwind adapters implement `pandwind.style-adapter/2`. An adapter is both a
source reader and a target writer around the versioned semantic style program.
Our own `/2` contract is intentionally breaking; adapters should declare their
version rather than silently accepting a different schema.

## Adapter responsibilities

Every adapter provides:

- `detect(context)` — ownership evidence and confidence for a source file;
- `loadConfig(context)` — project-root configuration and generated metadata;
- `parse(source, context)` — source ranges and semantic rule programs;
- `emit(program, context)` — target text, imports, dependencies, and residuals;
- `validate(source, target, residuals)` — canonical equivalence diagnostics and
  explicit `lossless`, `lossy`, or `unsupported` classification;
- `capabilities` and `dependencies` — explicit support and installation data.

The built-in registry currently includes pandwind, Emotion,
styled-components, vanilla-extract, and Stitches. The common migration entry
point is `runAdapterMigration`, while `runDifferentialFixture` reparses the
emitted target and can add browser-state and SSR/hydration checks.

## Safety modes

`safe` rejects partial or unsupported capabilities and leaves the source in
place with a residual marker. `partial` permits only capabilities explicitly
declared as partial. Neither mode drops an unsupported rule or dynamic value.

The semantic rule graph is the portability boundary. The old flat `SwapIR`
projection remains available for literal declaration swaps because it is
faster and lossless for that subset.

## Integration boundary

The adapter protocol does not assume React or a DOM. Runtime CSS sheets,
browser fixtures, SSR, hydration, and host-framework bindings are separate
contracts so a native or server-only target can opt out explicitly.
