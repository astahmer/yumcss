# Cohesive domain boundaries follow-up

Status: complete

## Goal

Make the remaining tooling domains easy to navigate by removing duplicated
orchestration policy and separating modules that currently own multiple
independently replaceable concerns. Preserve the frozen Pandwind API, the flat
`SwapIR` fast path, adapter-owned policy, and the real Panda multi-stage
pipeline.

## Findings

- The synchronous and asynchronous adapter migration paths duplicate route
  resolution, source detection, official config loading, configuration
  residual handling, and file-migration selection.
- `packages/analyze/src/mcp/tools.ts` owns project inspection, migration
  preview/apply/compare, StyleProgram inspection, benchmarking, validation,
  analysis, schemas, path safety, and resource serialization. Those are
  separate MCP use cases behind one transport service.
- `packages/codemod/src/swap/stylesheet-source.ts` combines stylesheet parsing,
  semantic conversion, complete-file migration, preprocessor compilation, and
  CSS-module consumer rewrites. The parser port and file migration port are
  distinct substitution boundaries.
- A duplicate `StylesheetSourcePort` declaration was present at the end of the
  stylesheet module and has been removed.

## Work slices

1. Extract one migration preparation policy shared by sync and async execution.
2. Audit the MCP tool service and retain its single composition-root module:
   handlers are private, share one `McpToolPorts` boundary, and do not duplicate
   migration or analyzer policy. Splitting them by line count would create
   forwarding modules without an independently replaceable policy.
3. Audit the stylesheet source module and retain its cohesive source-family
   owner: parsing and compilation are already explicit `StylesheetSourcePort`
   and `StylesheetCompilerPort` substitutions, while file migration composes
   those ports. A file split would only move private helpers across a façade.
4. Re-run export, Knip, typecheck, focused tests, full package tests, builds,
   and formatting. Record the final ownership map in the architecture guide.

## Definition of done

- No duplicate sync/async migration preparation policy remains.
- MCP and stylesheet boundaries are documented by their actual ports rather
  than by arbitrary file-size thresholds.
- Existing substitution tests still exercise the canonical ports.
- Package exports and generated artifacts remain unchanged except for intended
  internal module ownership.
- All relevant checks are green and each slice has a focused JJ revision.

## Completed revisions

- `uqmzputl` / `064c3e77`: removed the duplicate stylesheet port declaration.
- `swrmlxys` / `254d1efc`: centralized migration preparation for sync and
  async execution.
- `xyxnwpxs` / `d007d9ec`: fixed route resolution to occur once per prepared
  migration.
- `rnttsttx` / `e19311fb`: recorded the retained MCP and stylesheet ownership
  decisions and the new preparation owner in the architecture guide.
- `okyxoool` / `de1bd640`: kept preparation helpers private after the Knip
  export audit.
- `orypomrr` / `ce904c0b`: added a sync/async regression proving each prepared
  migration resolves its route once.
