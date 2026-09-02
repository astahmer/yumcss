# Virtual bundler migrations plan

## Context

Pandwind already has a bidirectional adapter pipeline and Vite/unplugin
composition roots. The CLI codemod materializes the result in the source tree,
which is ideal for a committed migration but expensive for a large repository
that first wants to evaluate a target ecosystem. The bundler can instead
present migrated module text to the downstream graph without writing source
files.

Related contracts are `StyleAdapter`, `StyleProgram`, `SwapIR`, the shared
source scanner, and the existing `pandwindVite`/unplugin ports. This feature is
tooling-only and does not change the shipped styling runtime.

## Goal

Allow a Vite build to consume a configured source-adapter → target-adapter
migration virtually, leaving the user's files unchanged while still allowing
the target ecosystem's official bundler plugin to process the migrated output.

The first useful example is styled-components source transformed to Tailwind
class attributes before the official Tailwind Vite plugin scans and emits CSS.

## What

Add a Vite migration plugin with one route configuration:

```ts
import { pandwindMigrateVite } from "pandwind-codemod/swap/vite";
import tailwindcss from "@tailwindcss/vite";
import { CodemodAdapterId } from "pandwind-codemod/swap";

export default {
	plugins: [
		pandwindMigrateVite({
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Tailwind,
		}),
		tailwindcss(),
	],
};
```

The plugin transforms only source modules claimed by the shared scanner,
honors include/exclude policies, forwards residuals to a diagnostic callback,
and exposes target-generated files through virtual module ids. It is
idempotent and cacheable by module id plus source content. It does not
fabricate a source map when the underlying migration engine has not produced
one.

## Why

Virtual migration gives teams a reversible evaluation lane, avoids a noisy
million-line source diff, makes progressive adoption possible, and lets a
target's existing ecosystem plugin remain the CSS/compiler authority. It is
also useful for preview builds and migration dashboards.

The trade-off is operational: a virtual migration can hide source-level
changes from editors and search, must run in every relevant build (including a
separate SSR build), and can diverge from a later committed codemod if config
or plugin versions differ. The plugin must therefore report its route,
residuals, generated modules, and cache behavior clearly.

## How

### Conceptual model

```text
source file on disk
        │
        ▼
shared scanner → configured source adapter → StyleProgram / SwapIR
        │                                      │
        │                                      ▼
        └──────────────────────────────→ target adapter
                                               │
                                               ▼
                                  virtual transformed module
                                               │
                                               ▼
                         official target plugin (Tailwind, StyleX, ...)
                                               │
                                               ▼
                                      browser / SSR bundle
```

### Operations / behavior

- `configResolved` captures the actual project root.
- `transform` runs the existing async adapter migration for eligible modules.
- unchanged or residual-bearing safe results remain source-preserving and are
  reported without pretending the route succeeded.
- generated target files are deduplicated by normalized project-relative path,
  stored per plugin instance, and served through `resolveId`/`load`.
- `watchChange` invalidates transformed modules and generated artifacts.
- the plugin exposes a Vite implementation first; a later unplugin wrapper can
  reuse the same core when another bundler has equivalent virtual-module hooks.

### Tech choices

| Choice           | Decision                                       | Rationale                                                           |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| Migration engine | Existing `runAdapterMigrationAsync`            | One semantic implementation; no bundler-specific adapter logic      |
| Ordering         | Vite `enforce: "pre"`                          | The target plugin sees migrated source and can remain authoritative |
| Generated files  | Virtual modules                                | No source writes or duplicate artifacts during evaluation           |
| Diagnostics      | Injected callback plus optional `warn` default | Hosts decide presentation; residuals stay structured                |
| Cache            | Per-plugin source-content cache                | Avoid repeated config/parse work without stale cross-build state    |
| Target plugins   | Composed by the host                           | Tailwind/StyleX/etc. keep their official compilation semantics      |

### Architecture

```text
ViteMigrationPlugin
  ├─ MigrationRoute (source/target ids)
  ├─ EligibilityPolicy
  ├─ MigrationService (existing adapter ports)
  ├─ VirtualArtifactStore
  └─ DiagnosticSink
```

The plugin is a composition root only. It must not contain ecosystem checks;
all source and target policy remains in registered adapters. Route identities
use the existing typed adapter identifiers.

## What this allows

- Try styled-components → Tailwind, Panda → Pandwind, or any registered route
  without changing the source checkout.
- Chain the migrated output with the target ecosystem's official Vite plugin.
- Preview static extraction and CSS output before committing a codemod.
- Reuse generated target modules without writing or duplicating them.
- Run the same route in development, production, and a separately configured
  SSR build.

## What this does not allow

- It does not mutate files, update package manifests, or remove source runtime
  dependencies.
- It does not make residual-bearing or unsupported semantics lossless.
- It does not transform `node_modules` by default.
- It does not replace the target plugin, target config, SSR setup, or framework
  compiler.
- It does not claim source-level editor/typecheck parity; committed codemod
  output remains the adoption path.

## UI & UX

There is no new runtime UI. CLI and build logs should identify the configured
route and summarize transformed, unchanged, generated, and residual-bearing
modules. A future playground can expose this plugin as a preview mode, but
that is not part of this implementation.

## Data model

```ts
interface VirtualMigrationOptions {
	readonly from: CodemodAdapterId;
	readonly to: CodemodAdapterId;
	readonly root?: string;
	readonly include?: readonly RegExp[];
	readonly exclude?: readonly RegExp[];
	readonly mode?: AdapterCapabilityMode;
	readonly onResidual?: (event: VirtualMigrationResidual) => void;
}
```

The virtual artifact store maps normalized absolute ids to generated file
contents and is scoped to one plugin instance. It is not persisted as project
state.

## Implementation steps

1. Add the route/options and virtual-artifact ports in the codemod package.
2. Implement `pandwindMigrateVite` as a pre-transform composition root over
   `runAdapterMigrationAsync` and the shared scanner.
3. Add generated-file resolution/loading and cache invalidation.
4. Add inline-snapshot tests for static conversion, residual preservation,
   include/exclude behavior, idempotence, diagnostics, generated artifacts,
   and target-plugin ordering.
5. Add a focused Vite-host fixture proving the transformed module is handed to
   a later target plugin without touching its source files.
6. Document the reversible lane and keep the committed codemod as the source
   migration path.

## Open questions

1. Should the universal unplugin wrapper be added now or after the Vite contract
   is proven? Initial implementation: Vite only.
2. Should a host opt into virtual generated modules by default? Initial
   implementation: yes, because otherwise generated-file routes cannot work;
   conflicts remain safe failures.

## Acceptance criteria

- [x] The Vite migration plugin uses only the existing adapter/scanner/lowering
      ports and has no ecosystem switch statements.
- [x] A styled-components → Tailwind fixture produces idiomatic classes before
      Tailwind's official plugin and leaves the source file unchanged.
- [x] Inline snapshots show transformed output; ordinary assertions guard route,
      residual, generated-file, and idempotence behavior.
- [x] Residual-bearing safe migrations remain source-preserving and observable.
- [x] Generated files resolve/load virtually and deduplicate deterministically.
- [x] Typecheck, lint, format, Knip, and focused codemod/Vite tests pass.
- [x] A static import check confirms no new dependency enters the shipped
      Pandwind runtime.

## Status

Implemented in the focused revisions following this plan. The plugin contract
is Vite-shaped and intentionally dependency-free; the host-composition test
proves that migrated source is available to a later target plugin while the
codemod tests exercise the real adapter pipeline. A future Vite-version
integration fixture may add host-specific regression coverage, but it is not
needed to establish a second migration engine or to change the source/runtime
contracts.

## Decisions log

| Date       | Decision                                                     | Rationale                                                                                   |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 2026-09-02 | Start with a Vite plugin over the existing migration service | Vite is the proven composition root and already supports pre-transforms and virtual modules |
| 2026-09-02 | Keep source files immutable and generated artifacts virtual  | This is the reversible evaluation lane; committed codemods remain explicit                  |
| 2026-09-02 | Compose the target's official plugin after migration         | The target ecosystem should remain the authority for final CSS generation                   |
