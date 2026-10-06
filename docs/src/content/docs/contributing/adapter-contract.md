---
title: CSS-in-JS adapter contract
description: The versioned semantic adapter protocol used by yumcss migrations.
sidebar:
  order: 7
---

yumcss adapters implement `yumcss.style-adapter/1`. An adapter is both a
source reader and a target writer around the versioned semantic style program.
The current contract adds target-owned named-style host projection; adapters
must declare their version rather than silently accepting a different schema.

## Adapter responsibilities

Every adapter provides:

- `detect(context)` — ownership evidence and confidence for a source file;
- `loadConfig(context)` — project-root configuration and generated metadata;
- `parse(source, context)` — source ranges and semantic rule programs;
- `emit(program, context)` — target text, imports, dependencies, generated
  artifacts, and residuals; the optional `sourceText` field supports target
  artifact source maps;
- `validate(source, target, residuals)` — canonical equivalence diagnostics and
  explicit `lossless`, `lossy`, or `unsupported` classification;
- `capabilities` and `dependencies` — explicit support and installation data.
- a target migration policy may additionally project a converted named style
  use onto its native JSX host, including host attributes and required imports.

For StyleX, converting a named style map is incomplete while a
`stylex.props` use still refers to it. A target-owned projection can lower a
single converted style reference in a JSX spread; unsupported or ambiguous
uses keep the original source document with a typed residual. This prevents a
converted map from remaining coupled to the StyleX runtime.

Adapters that need to evaluate project configuration may additionally expose
`loadConfigAsync(context)`. It is resolved through the migrated project's root
and should delegate to the ecosystem's official configuration package. Use the
async migration entry point for project-aware runs:

```ts
const result = await runAdapterMigrationAsync(source, {
	from: "unocss",
	to: "yumcss",
	file: "src/App.tsx",
	root: projectRoot,
});
```

The official loader is optional and injectable. Missing packages use the
adapter's syntax-level fallback or an explicitly supplied resolver; an
installed loader that cannot evaluate a custom configuration produces a
structured configuration residual. This keeps presets, plugins, merged themes,
shortcuts, and generated tokens from being silently mistaken for a small
handwritten approximation. The YumCSS target also discovers
`yumcss.interop.json` and its generated optional bridge/preset during async
migration, so code emission consumes the same project token context as the
generated runtime. The bridge is tooling metadata unless the project
explicitly imports its `twAdapter`; YumCSS does not add it to a runtime graph
automatically. An unreadable artifact is reported as a configuration residual;
when no artifact exists, the adapter safely keeps literal values instead of
guessing target token names.

The built-in registry currently includes yumcss, Panda, Tailwind, Emotion,
styled-components, Chakra UI, MUI, Mantine, vanilla-extract, Stitches,
Linaria, JSS, Fela, Goober, Aphrodite, Style9, Treat, Compiled, StyleX,
React Strict DOM, Solid/Vue styled systems, Bamboo, Next-yak, React Native, Tamagui, CSS
Modules, Sass, Less, and authored CSS. The common migration entry point is
`runAdapterMigration`, while `runDifferentialFixture` reparses the emitted
target and can add browser-state, SSR/hydration, streaming, dependency, and
framework checks. The stylesheet and component-source adapters are included in
the registry but are documented separately from the CSS-in-JS syntax corpus.

Third-party packages opt in through the explicit plugin manifest convention
documented in [`ADAPTER_SDK.md`](https://github.com/astahmer/yumcss/blob/main/packages/codemod/ADAPTER_SDK.md).
Discovery reads only packages advertised by the project metadata; YumCSS
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
