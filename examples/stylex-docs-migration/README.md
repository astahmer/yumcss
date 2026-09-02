# StyleX docs migration corpus

This fixture is a reproducible migration of the StyleX documentation app at
commit `5f7acaa4b332e2cf8352e95e5bc83efd70904fd4`. The upstream checkout is
downloaded by `nub run references:prepare` into
`${PANDWIND_REFERENCE_ROOT:-~/.references}/stylex`; Pandwind versions only
the migration runner and proof reports.

The migration is deliberately expressed as lanes over the same
`StylexDocsMigration` interface:

- `runtime-css`: `stylex` → `createRuntimeCss` / `css.group`, with runtime-sheet
  registration for variables and keyframes.
- `atomic-css`: the same semantic conversion, with each named group lowered
  to `css.class` and `css.props`.
- `design-dss`: the same declarations lowered through `createRuntimeDesignCss` and
  `$raw` so arbitrary CSS remains lossless while the design adapter stays
  replaceable. The runtime variant is used so keyframes and variable
  registrations remain SSR-safe.

Run one lane and print its proof report:

```sh
nub run references:prepare

nub scripts/migrate-stylex-docs.ts runtime-css
nub scripts/migrate-stylex-docs.ts atomic-css
nub scripts/migrate-stylex-docs.ts design-dss
```

For the built browser proof, start a clean StyleX build on port `4311` and a
migrated lane on port `4310`, then run:

```sh
node scripts/verify-stylex-docs-browser.mjs \
  http://127.0.0.1:4311 \
  http://127.0.0.1:4310 \
  examples/stylex-docs-migration/reports/browser-matrix.json
```

The verifier compares the home page, representative docs pages, and the
interactive playground. It checks route geometry, linked and inline CSS,
browser errors, failed responses, and that the playground preview renders.
The committed report is the latest run against the pinned reference commit;
the same matrix was replayed for `runtime-css`, `atomic-css`, and `design-dss`.

The corpus gate covers every StyleX-bearing source file under `src/` and
requires zero safe-mode skips, residuals, or invalid semantic validations.
The lane test is `packages/codemod/tests/stylex-docs-migration.test.ts`.

The copied docs app includes intentionally displayed playground examples and
the development-only StyleX HMR probe. Those are source content/runtime
fixtures rather than migration call sites; the migration gate does not
silently rewrite them as executable styling code. The playground's host
application is migrated to Pandwind; its embedded editor remains a
StyleX-compatible sandbox so the documented interactive compiler experience
continues to work while users edit StyleX examples.
