# StyleX docs migration corpus

This fixture is a pinned copy of the StyleX documentation app at commit
`5f7acaa4b332e2cf8352e95e5bc83efd70904fd4`. The original checkout lives in
the read-only reference clone recorded in `/Users/astahmer/dev/pandwind/reference-repos.md`.

The migration is deliberately expressed as lanes over the same
`StylexDocsMigration` interface:

- `runtime-css`: `stylex` → `createCss` / `css.group`, with runtime-sheet
  registration for variables and keyframes.
- `atomic-css`: the same semantic conversion, with each named group lowered
  to `css.class` and `css.props`.
- `design-dss`: the same declarations lowered through `createDesignCss` and
  `$raw` so arbitrary CSS remains lossless while the design adapter stays
  replaceable.

Run one lane and print its proof report:

```sh
pnpm exec tsx scripts/migrate-stylex-docs.ts runtime-css
pnpm exec tsx scripts/migrate-stylex-docs.ts atomic-css
pnpm exec tsx scripts/migrate-stylex-docs.ts design-dss
```

The corpus gate covers every StyleX-bearing source file under `src/` and
requires zero safe-mode skips, residuals, or invalid semantic validations.
The lane test is `packages/codemod/tests/stylex-docs-migration.test.ts`.

The copied docs app includes intentionally displayed playground examples and
the development-only StyleX HMR probe. Those are source content/runtime
fixtures rather than migration call sites; the migration gate does not
silently rewrite them as executable styling code.
