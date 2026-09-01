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

Adapters that need to evaluate project configuration may additionally expose
`loadConfigAsync(context)`. It is resolved through the migrated project's root
and should delegate to the ecosystem's official configuration package. Use the
async migration entry point for project-aware runs:

```ts
const result = await runAdapterMigrationAsync(source, {
	from: "unocss",
	to: "pandwind",
	file: "src/App.tsx",
	root: projectRoot,
});
```

The official loader is optional and injectable. Missing packages use the
adapter's deterministic fallback; an installed loader that cannot evaluate a
custom configuration produces a structured configuration residual. This keeps
presets, plugins, merged themes, shortcuts, and generated tokens from being
silently mistaken for a small handwritten approximation. The Pandwind target
also discovers `pandwind.interop.json` and its generated bridge/preset during
async migration, so code emission consumes the same project token context as
the generated runtime. An unreadable artifact is reported as a configuration
residual; when no artifact exists, the adapter safely keeps literal values
instead of guessing target token names.

The built-in registry currently includes pandwind, Panda, Tailwind, Emotion,
styled-components, Chakra UI, MUI, Mantine, vanilla-extract, Stitches,
Linaria, JSS, Fela, Goober, Aphrodite, Style9, Treat, Compiled, StyleX,
Solid/Vue styled systems, Bamboo, Next-yak, and React Native. The common
migration entry point is `runAdapterMigration`, while `runDifferentialFixture`
reparses the emitted target and can add browser-state, SSR/hydration,
streaming, dependency, and framework checks.

Third-party packages opt in through the explicit plugin manifest convention
documented in [`ADAPTER_SDK.md`](https://github.com/astahmer/pandwind/blob/main/packages/codemod/ADAPTER_SDK.md).
Discovery reads only packages advertised by the project metadata; Pandwind
does not scan or execute arbitrary `node_modules` code.

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
