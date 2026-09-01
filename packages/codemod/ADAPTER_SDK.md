# Pandwind adapter SDK

The adapter SDK is the integration boundary for moving style programs between
CSS-in-JS systems. A package can provide one `StyleAdapter`, a
`StyleAdapterPlugin`, or an object containing `adapters`; consumers register it
with `createStyleAdapterRegistry` and may explicitly discover it with an
injected loader.

## Contract

The current protocol is `pandwind.style-adapter/2`. An adapter owns five
operations:

1. `detect` identifies source code and reports evidence and confidence.
2. `loadConfig` reads project configuration through the supplied `readFile`.
3. `parse` produces versioned semantic `StyleProgram` matches and residuals.
4. `emit` lowers a program into target source plus imports, dependencies, and
   residuals.
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

The manifest is `pandwind.style-adapter-manifest/1` and records each adapter's
ID, implementation version, contract version, capabilities, and dependencies.
Hosts can inspect it before loading code and the registry verifies it again at
registration time.

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
`pandwind.style-program/4` schema. It owns rule ordering, value classification,
dynamic normalization, metadata, provenance, and residual accumulation; it
does not own target emission. Keep target syntax in the adapter's `emit`
implementation, and keep simple literal paths on `SwapIR`.
