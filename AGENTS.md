# Agent guidance — pandwind

## API surface policy (read before proposing features)

The **user-facing API is deliberately frozen**: `tw()` / `css()` / `cx()` /
`createDesignCss` presets, the `ClassNameStrategy` contract, and the codegen
entry points. Do not add new user-facing API surface by default — push back
on proposals, including ones that look small. Rationale: the value
proposition is a minimal API you can hold in your head; every addition taxes
docs, types, size budgets and the parity suites.

What is always welcome (no pushback needed):

- compiler/optimizer work (folding passes, pruning, splitting)
- tooling around the API (codemods, analyze, MCP-free CLIs, lint rules,
  debug tooling, studio/dashboards)
- correctness/perf fixes inside existing APIs
- genuinely worthwhile additions — these exist, but they need a written
  design note first (see plans/) AND an explicit maintainer go-ahead.

Current approved-but-not-built examples of the bar: var-inline strategy
(dynamic values only). Per-page CSS splitting already shipped
(`splitByRoute` / `inlineCritical` on `pandwindCssVite`) — treat it as part of
the frozen surface now.
