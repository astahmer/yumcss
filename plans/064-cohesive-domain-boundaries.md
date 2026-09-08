# Cohesive domain boundaries follow-up

Status: in progress

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
2. Split MCP tool use cases and resource/path helpers while keeping one
   `McpToolService` composition root and one `McpToolPorts` boundary.
3. Split stylesheet parsing from file migration/compilation while retaining the
   existing package subpath contract and tests.
4. Re-run export, Knip, typecheck, focused tests, full package tests, builds,
   and formatting. Record the final ownership map in the architecture guide.

## Definition of done

- No duplicate sync/async migration preparation policy remains.
- Each extracted MCP or stylesheet module has one domain owner and no generic
  forwarding façade is introduced.
- Existing substitution tests still exercise the canonical ports.
- Package exports and generated artifacts remain unchanged except for intended
  internal module ownership.
- All relevant checks are green and each slice has a focused JJ revision.
