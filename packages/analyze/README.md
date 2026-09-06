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
```

The tools are:

- `inspect_project` — detect ecosystems, configuration evidence, and registered adapters;
- `analyze_project` — run the existing analyzer contract;
- `preview_migration` — emit diffs, lowering plans, residuals, validations, and generated files;
- `apply_migration` — write only after `confirm: true`, with stale and conflict checks;
- `validate_migration` — validate adapter results and generated-file conflicts;
- `compare_migrations` — compare several registered routes;
- `inspect_style_program` — inspect StyleProgram and lowering-plan snapshots;
- `benchmark_project` — measure bounded scan/migration throughput and existing artifact sizes.

The server also exposes resources for the adapter/API matrix, project evidence
and configuration, the latest migration and residual report, the generated
`pandwind.interop.json`, and the latest StyleProgram snapshots. Preview,
validation, comparison, inspection, analysis, and benchmarking never write
files or execute project commands. Typecheck, build, browser, and SSR commands
remain explicit host actions until a command runner with an auditable allowlist
is added.
