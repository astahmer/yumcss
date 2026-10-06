# Chakra UI docs migration corpus

This corpus uses the read-only Chakra UI checkout pinned in
[`reference-repos.md`](../../../reference-repos.md). The external Git checkout is
the source of truth; YumCSS versions the lane runner and proof reports in JJ.

The same Chakra source adapter is routed through two target dialects:

- `css-class`: Chakra style props become `css.class(...)` calls backed by a
  YumCSS runtime sheet.
- `design-css`: the same declarations become `dss.class(...)` calls backed by
  `createRuntimeDesignCss(...)`.

Run a lane and optionally materialize a buildable disposable worktree:

```sh
nub scripts/run-migration-proof.ts run chakra-docs css-class \
	--output-root /tmp/yumcss-chakra-css
nub scripts/run-migration-proof.ts run chakra-docs design-css \
	--output-root /tmp/yumcss-chakra-dss
```

The runner scans the full `apps/www` source tree, preserves non-style Chakra
component props, lowers responsive and runtime-valued style objects through
the semantic IR, and reports every residual. A successful corpus run has zero
residuals and zero skipped call sites. The browser proof compares the baseline
and materialized lane at the same viewport and records route geometry, browser
errors, failed responses, and total CSS bytes.

The checked-in proof artifacts are [CSS-class](./reports/css-class.json),
[design-css](./reports/design-css.json), and [browser parity](./reports/browser-parity.json).
The current run converted 661 call sites in 91 source files for each lane.

After building both materialized lanes, run the exhaustive static-route check:

```sh
nub scripts/verify-chakra-docs.ts \
  http://127.0.0.1:4340 \
  http://127.0.0.1:4349 \
  http://127.0.0.1:4350 \
  "${YUMCSS_REFERENCE_ROOT:-$HOME/.references}/chakra-ui/apps/www/.next/server/app"
```

It enumerates the baseline's statically emitted HTML routes, removes routes
that the baseline itself serves as non-200 (currently two stale upstream blog
artifacts), checks HTTP/status parity across all 263 discovered routes, and
checks application-error markers, linked stylesheet bytes, inline SSR styles,
and YumCSS runtime styles across the 261 baseline-200 routes for both lanes.
The Next build log is the
complementary proof for all 277 generated routes, including dynamic and API
entries.

The reference repository is intentionally not a JJ workspace. Its exact Git
commit is pinned in the reference index, while every YumCSS lane and its
evidence are JJ revisions.
