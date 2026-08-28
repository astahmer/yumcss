# Chakra UI docs migration corpus

This corpus uses the read-only Chakra UI checkout pinned in
`/Users/astahmer/dev/pandwind/reference-repos.md`. The external Git checkout is
the source of truth; Pandwind versions the lane runner and proof reports in JJ.

The same Chakra source adapter is routed through two target dialects:

- `css-class`: Chakra style props become `css.class(...)` calls backed by a
  Pandwind runtime sheet.
- `design-css`: the same declarations become `dcss.class(...)` calls backed by
  `createRuntimeDesignCss(...)`.

Run a lane and optionally materialize a buildable disposable worktree:

```sh
pnpm exec tsx scripts/migrate-chakra-docs.ts css-class /tmp/pandwind-chakra-css
pnpm exec tsx scripts/migrate-chakra-docs.ts design-css /tmp/pandwind-chakra-dcss
```

The runner scans the full `apps/www` source tree, preserves non-style Chakra
component props, lowers responsive and runtime-valued style objects through
the semantic IR, and reports every residual. A successful corpus run has zero
residuals and zero skipped call sites. The browser proof compares the baseline
and materialized lane at the same viewport and records route geometry, browser
errors, failed responses, and total CSS bytes.

The reference repository is intentionally not a JJ workspace. Its exact Git
commit is pinned in the reference index, while every Pandwind lane and its
evidence are JJ revisions.
