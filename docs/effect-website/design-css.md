# Effect website: `dss` migration proof

This record covers the static design-language `dss({...})` lane for the
pinned Effect website corpus. `$raw` carries the same proven declarations into
the design façade, while the bridge remains the single target class adapter.

- Reference: `Effect-TS/website`
- Source subtree: `apps/web`
- Reference commit: `366419b44eb2bd353cbe3d3e41fa4e8c735e63ee`
- Source files scanned: 716
- Files rewritten: 75
- Converted call sites: 790
- Explicit residuals: 8,084
- Source rewrite byte delta: `+114,205` (imports and generated calls; not CSS)

## Reproduce

```sh
nub scripts/run-migration-proof.ts run effect-docs design-css \
	--output-root /tmp/pandwind-effect-design
cd /tmp/pandwind-effect-design
pnpm install --no-frozen-lockfile
pnpm exec vp run build
```

Run the four-way verifier shown in the [`tw` proof](./tw.md). In the verified
build this lane emitted exactly `2,840,140` CSS bytes, equal to the untouched
baseline. All 436 generated routes returned successfully; SSR, hydration,
desktop, and mobile checks passed for the homepage, blog, v3/v4 docs, Effect
Days, and community visual smoke routes.
