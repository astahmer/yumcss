# Pandwind adapter SDK

The adapter SDK is the integration boundary for moving style programs between
CSS-in-JS systems. A package can provide one `StyleAdapter`, a
`StyleAdapterPlugin`, or an object containing `adapters`; consumers register it
with `createStyleAdapterRegistry` and may explicitly discover it with an
injected loader.

## Contract

The current protocol is `pandwind.style-adapter/4`. An adapter owns five
operations:

1. `detect` identifies source code and reports evidence and confidence.
2. `loadConfig` reads project configuration through the supplied `readFile`.
3. `parse` produces versioned semantic `StyleProgram` matches and residuals.
4. `emit` lowers a program into target source plus imports, dependencies,
   generated artifacts, and residuals. Its context includes the original
   `sourceText` when migration orchestration has it, so an emitter can produce
   target-owned source maps without re-reading the project.
5. `validate` compares source and target programs and reports lossiness.

Adapters also declare source modules, dependencies, versioned capabilities, and
lossiness behavior. Unsupported semantics must remain residuals; an adapter
must not silently drop a selector, dynamic value, theme edge, plugin transform,
or runtime/framework dependency.

## Plugin shape

```ts
import type { StyleAdapterPlugin } from "pandwind-codemod/swap";

export default {
	schema: "pandwind.style-adapter-plugin/1",
	id: "acme-css-in-js",
	version: "1.0.0",
	manifest: createStyleAdapterManifest("acme-css-in-js", "1.0.0", [adapter]),
	adapters: [adapter],
} satisfies StyleAdapterPlugin;
```

The package may advertise the same entry points in `package.json`:

```json
{
	"pandwind": {
		"plugin": "./dist/plugin.js",
		"manifest": "./dist/manifest.json"
	}
}
```

The manifest is `pandwind.style-adapter-manifest/2` and records each adapter's
ID, implementation version, contract version, capabilities, and dependencies.
It also carries a `pandwind.style-program-core-compatibility/1` requirement,
for example `{ schema: "pandwind.style-program-core-compatibility/1",
versionRange: "^1" }`. Hosts can inspect it before loading code and the
registry verifies the core range and capability declarations again at
registration time. A plugin built for an incompatible core is rejected before
its adapter participates in a migration.

Each adapter manifest also includes a versioned official-API evidence profile:

```ts
officialApi: {
	apis: [{ name: "css", status: AdapterOfficialApiStatusTag.Supported }],
	configEntrypoints: ["panda.config.ts"],
	pluginSystems: ["presets", "plugins"],
	compilerIntegrations: ["@pandacss/config"],
	ssrHooks: [],
}
```

The API list is the documented user surface, not an inventory of callable
internals. `supported`, `deprecated`, `internal`, and `compatibility-only` are
distinct statuses. The built-in Chakra adapter, for example, records its
documented `system.css()` source form without claiming a bare `css` export.

Project configuration results carry the matching evidence chain. The ordered
sources are official loader, generated artifact, project-source fallback, and
unresolved; every entry says whether it resolved, failed, or was not attempted.
Configured plugin chains and authoritative generated artifacts are retained in
the same result. Opaque plugin values remain unresolved and therefore cannot be
silently flattened into a supposedly complete semantic configuration.

Discovery is deliberately explicit. The host decides how package names are
resolved, which makes the same registry safe for CLIs, bundlers, tests, and
browser tooling. For a project package manifest, `discoverPackages()` first
selects dependencies whose own package metadata contains the `pandwind`
manifest field, then loads only those advertised plugins:

```ts
await registry.discoverPackages(projectPackageJson);
```

The package metadata loader and plugin loader are injectable for lockfile,
bundler, and test environments. Ambient `node_modules` scanning is not part of
the SDK.

## Versioning and fixtures

- A schema change creates a new contract version and a migration note.
- Adding an optional capability or adapter is non-breaking.
- Changing parsing or emission semantics requires a corpus fixture and a
  differential result showing canonical CSS, residuals, browser states, SSR,
  hydration, and dependency evidence.
- Safe migrations require exact target capabilities. Partial migrations must
  be explicit and retain actionable residual reports.
- Adapter packages should publish their own tests and keep the implementation
  in an independently owned module; the registry only composes implementations.

The semantic style-program IR is the complete interop model. `SwapIR` remains
the intentionally small, fast projection for literal utility swaps and is not
required to represent rule-level or runtime semantics.

`StyleProgramCore` is the invariant boundary for the semantic IR. Source
adapters and builders enter through its normalization contract; differential
proofs record its core version and fingerprint. Portable artifact encoding is
available to proof/cache tooling, while target emitters remain adapter-owned.

When an adapter needs to construct a rich program rather than parse directly
into low-level object literals, use `StyleProgramBuilder` from the `swap`
surface:

```ts
import { StyleProgramBuilder } from "pandwind-codemod/swap";

const program = StyleProgramBuilder.create({ source })
	.style({
		color: "red",
		padding: StyleProgramBuilder.token("space.2", { resolved: "0.5rem" }),
	})
	.build();
```

The builder is a construction façade over the existing
`pandwind.style-program/5` schema. It owns rule ordering, value classification,
dynamic normalization, metadata, provenance, and residual accumulation; it
does not own target emission. Keep target syntax in the adapter's `emit`
implementation, and keep simple literal paths on `SwapIR`.
