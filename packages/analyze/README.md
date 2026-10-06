# yumcss-analyze

Build-time CSS usage, provenance, coverage, and budget analysis for yumcss
projects. The CLI emits human-readable reports and versioned JSON suitable
for CI and editor tooling.

## Use it when you have a question

- **Did the build fold my style calls?** Run the analyzer on your source files.
- **Did a dynamic value leave CSS behind?** Ask for CSS provenance and
  diagnostics.
- **Did the stylesheet grow past its budget?** Add a CSS ceiling for CI.
- **Do I need to inspect generated styles and token use?** Open the project
  Inspector with `pnpm run inspect` in this repository.
- **Do I need to review a migration before editing files?** Use Migration
  Preview to inspect a project workspace without writing to it.

The shortest useful command is:

```sh
pnpm exec yumcss-analyze src --tw src/tw.ts
```

Add --json for a machine-readable report, --css for generated CSS
measurements, or --governance for token-usage checks. The analyzer reads
the project and reports what it found; it does not rewrite your source files.

## Token release impact

Compare a prior token document with the generated `yumcss.interop/1` token
snapshot, then attach exact usage and coverage evidence from declared consumer
roots:

```sh
pnpm exec yumcss-analyze \
  --root apps/store-a \
  --consumer-root apps/store-b,apps/store-c \
  --release-baseline releases/v1.tokens.json \
  --release-current apps/store-a/src/yumcss.interop.json \
  --json
```

The baseline defaults to DTCG; `--release-format` selects another registered
token input adapter. The current artifact must be a validated `/1` snapshot
with token data. With one consumer, `--release-current` defaults to that
consumer's `src/yumcss.interop.json`; multiple consumers require an explicit
current artifact. The report lists path additions and removals, value, type,
deprecation, metadata, group, and context changes, and joins exact token paths
to existing governance usages, suggestions, removal-safety reasons, and
unknown coverage boundaries. Path changes remain remove-plus-add; the analyzer
does not guess renames. It reads only the supplied roots and artifact and never
writes project files.

## Migration Preview

Open a consumer project in a read-only migration workspace:

```sh
pnpm exec yumcss-migration-preview /path/to/project --no-open
```

The local browser UI lets you choose registered source and target adapters,
inspect generated code and diagnostics, and try in-memory edits. It does not
write to the project; use `yumcss-codemod migrate` when you are ready to
review a real diff.

For a visual explanation of the reports, start with the
[tooling workflows guide](../../docs/src/content/docs/tools/playground.mdx).

## Compiler Preview

Run the project's Vite config and inspect the source modules after its real
plugin transforms, including YumCSS's compile-time optimizations:

```sh
pnpm exec yumcss-compiler-preview /path/to/project
```

The browser UI compares each supported source file with Vite's transformed
module and reports transform errors. It is read-only and serves only on
localhost. Vite automatically discovers its conventional config in the input
folder. Override discovery with `--config` when you use a custom filename or
need a different config; the path is relative to the input folder:

```sh
pnpm exec yumcss-compiler-preview /path/to/project --config vite.preview.config.ts
```

To inspect YumCSS's real-world compiler fixture from the repository root:

```sh
pnpm run compiler-preview "$PWD/packages/yumcss/tests/fixtures/tsc"
```

Vite is resolved from the selected project first, and its config and plugin
options are used for every transform. In this monorepo, the analyzer's
development Vite dependency is a fallback when the selected root has no local
Vite install. Vite config code executes as part of starting the preview.

## MCP tooling

The existing `yumcss-analyze` CLI also exposes an MCP server over stdio using
the official Model Context Protocol server SDK. It uses the registered adapter
catalog, the shared source workspace, the migration contract, and the analyzer
directly:

```sh
# The server root is fixed at startup; tool paths are project-relative.
pnpm exec yumcss-analyze mcp --root .

# Also run supported package.json validation scripts in an isolated copy.
pnpm exec yumcss-analyze mcp --root . --host-checks
```

The tools are:

- `inspect_project` — detect ecosystems, official-loader evidence, generated artifacts, and registered adapters;
- `analyze_project` — return fold coverage, dynamic sites, missing CSS, CSS diagnostics and budgets, token governance, and adapter coverage;
- `preview_migration` — emit diffs, lowering plans, residuals, validations, and generated files;
- `apply_migration` — write only after `confirm: true`, with stale and conflict checks;
- `validate_migration` — run adapter and canonical-CSS checks, plus named typecheck/build/SSR/hydration/browser/bundle checks through an injected host validation port;
- `compare_migrations` — compare several registered routes;
- `inspect_style_program` — inspect StyleProgram and lowering-plan snapshots;
- `benchmark_project` — measure bounded scan/migration throughput and existing artifact sizes.

The server also exposes resources for the adapter/API matrix, the registry-
expanded migration route proof catalog, project evidence and configuration, the
latest migration, comparison, and residual reports, the generated
`yumcss.interop.json`, and the latest StyleProgram snapshots.
Preview, comparison, inspection, analysis, and benchmarking never write files
or execute project commands. Validation is read-only; project commands remain
explicit host actions supplied through the typed validation port, so the MCP
boundary never accepts arbitrary shell commands. The `--host-checks` CLI flag
installs the built-in Node host: it copies the project to a temporary
workspace, overlays the preview and generated files, and runs only recognized
scripts from `package.json`; it never installs dependencies or changes the
source project. HTTP and IDE integrations can provide their own validation
port when they have richer framework or browser runners. Every structured
result also contains `executionEvidence`, which labels the execution lane and
reports verified, unavailable, or failed evidence. The same server
registration can also be mounted in a Hono app through the
`@yumcss/analyze/mcp/http` subpath and the official Streamable HTTP handler.
