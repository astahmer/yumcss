# Plan 020 — Mining ultra + panda-cloud (abandoned panda-related projects)

Studied 2026-08-24. `~/dev/ultra` ("design token automation platform",
undeployed monorepo) and `~/dev/panda-cloud` (deeper second pass).

## Findings — ~/dev/ultra

### packages/token-graph — TOKEN REFERENCE DAG ⭐ adopt

`createGraph(group)` builds a directed graph where every TokenNode carries a
`references` map (token -> set of referenced tokens), laid out with dagre;
`get-css-vars` exports vars grouped `byCondition` and `byType`.
**Adopt:** our 3-tier system (raw -> semantic -> component) is exactly such a
DAG but we never visualize or compute over it. Steal:

1. reference-graph computation in generate-theme (which semantic tokens does
   each component scope touch; which raws are orphaned),
2. a studio "token graph" view (dagre is tiny; render as SVG),
3. cycle detection falls out of the graph for free (replaces ad-hoc checks).

### get-css-vars byCondition grouping — pattern note

Clean two-level Map grouping (condition x type) before emission - matches how
our splitTokens works; no action needed, validates the shape.

### is-token-ref / naming-convention validators — candidate

Small pure validators enforcing token naming conventions. Could back a lint
rule (`pandwind/naming-convention`) if users want convention enforcement.
Parked until requested.

### packages/schema — release/project/font entities

They modeled RELEASES of token sets (versioned snapshots). Validates our
studio history-persistence direction (plans/019 gap #3/#6); steal the
entity-shape idea (timestamp + full payload + parent pointer) for
.studio-history entries.

### gradient-picker, cli

Headless machine-style picker UI (zag-pattern) - skip (UI concern, not core).
CLI structure is plain commander-style - nothing new.

## Findings — panda-cloud (deeper)

- `src/reports/import-reports.ts`: import + DIFF report flows for token sets -
  same conclusion as ultra's releases: snapshot/diff is the valued feature.
  Already queued as studio v3 feature #3 (history persistence + run diff).
- prisma entities mirror that: projects, snapshots, reports.

## Adopt-list (ranked)

| #   | item                                                                        | effort | lands in                       |
| --- | --------------------------------------------------------------------------- | ------ | ------------------------------ |
| 1   | token reference DAG computation (cycles + orphans + per-scope reachability) | S      | generate-theme                 |
| 2   | studio token-graph view (SVG via dagre)                                     | M      | apps/inspector                 |
| 3   | history entries shaped as versioned snapshots (parent pointer)              | S      | studio v3 feature 3            |
| 4   | naming-convention validators -> optional lint rule                          | S      | future/lint                    |
| 5   | per-file literal-vs-token coverage %                                        | M      | analyze (already noted in 019) |

## Skipped

gradient-picker (UI concern), cli structure (nothing new), billing/member
entities (product-specific), tRPC setup (we're CLI-first).

## Outcomes (2026-08-24) — adopts #1 and #2 landed

1. **Reference-DAG computation** (`src/tw/token-graph.ts`, `buildTokenGraph`):
   nodes across raw/semantic/scope/component tiers; edges consumer ->
   dependency from inline `var()` refs, `[data-theme]` bindings, component
   override targets and `$ref`s. Computes every cycle (self-loops included —
   a key overriding exactly the variable it references is invalid at
   computed-value time and is marked as a self-loop on the VARIABLE node,
   agreeing with buildComponentScopes' skip-loudly emission), orphaned raws
   (unreferenced by other tokens; direct utility usage invisible by design),
   per-component reachability (BFS), dangling refs (missing from @theme).
2. **Studio "token graph" view**: layered SVG (component / scope / semantic /
   raw columns), tier-colored nodes, cycle edges in red, click-to-inspect
   with reachability + warnings. Payload via gather.ts -> tokenGraph.
3. Follow-up found during dev: cx-bench.mts used toLocaleString() ->
   locale-dependent output broke the smoke parser under non-en locales;
   fixed to deterministic grouping.
4. Residual: example preset declares no themes/components, so its studio
   graph shows the raw tier only - add fixture declarations when demoing.
