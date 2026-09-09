# pandwind-analyze

Build-time CSS usage, provenance, coverage, and budget analysis for pandwind
projects. The CLI emits human-readable reports and versioned JSON suitable
for CI and editor tooling.

## MCP tooling

The existing `pandwind-analyze` CLI also exposes an MCP server over stdio using
the official Model Context Protocol server SDK. It uses the registered adapter
catalog, the shared source workspace, the migration contract, and the analyzer
directly:

```sh
# The server root is fixed at startup; tool paths are project-relative.
pnpm exec pandwind-analyze mcp --root .

# Also run supported package.json validation scripts in an isolated copy.
pnpm exec pandwind-analyze mcp --root . --host-checks
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
`pandwind.interop.json`, and the latest StyleProgram snapshots.
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
`pandwind-analyze/mcp/http` subpath and the official Streamable HTTP handler.
