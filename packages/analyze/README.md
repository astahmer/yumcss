# pandwind-analyze

Build-time CSS usage, provenance, coverage, and budget analysis for pandwind
projects. The CLI emits human-readable reports and versioned JSON suitable
for CI and editor tooling.

## MCP tooling

The existing `pandwind-analyze` CLI also exposes a read-only MCP server over
stdio. It uses the registered adapter catalog, the shared source workspace,
the migration contract, and the analyzer directly:

```sh
# The server root is fixed at startup; tool paths are project-relative.
pnpm exec pandwind-analyze mcp --root .
```

The initial tools are `inspect_project`, `preview_migration`,
`validate_migration`, and `analyze_project`. Preview and validation never write
files or execute project commands. Validation checks the adapter's own
contract results, residuals, and generated-file conflicts; typecheck, build,
browser, and SSR commands remain explicit host actions until a command runner
with an auditable allowlist is added.
