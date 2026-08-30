# Effect website: `css` migration proof

This record covers the static `css({...})` lane for the pinned Effect website
corpus. Static declarations are lowered through the existing Tailwind-backed
class adapter; values that are not proven by the bridge stay as explicit
residuals.

- Reference: `Effect-TS/website`
- Source subtree: `apps/web`
- Reference commit: `366419b44eb2bd353cbe3d3e41fa4e8c735e63ee`
- Source files scanned: 716
- Files rewritten: 75
- Converted call sites: 790
- Explicit residuals: 8,084
- Source rewrite byte delta: `+103,744` (imports and generated calls; not CSS)

## Reproduce

```sh
pnpm exec tsx scripts/migrate-effect-docs.ts css /tmp/pandwind-effect-css
cd /tmp/pandwind-effect-css
pnpm install --no-frozen-lockfile
pnpm exec vp run build
```

Run the four-way verifier shown in the [`tw` proof](./tw.md). In the verified
build this lane emitted exactly `2,840,140` CSS bytes, equal to the untouched
baseline. All 436 generated routes returned successfully; SSR, hydration,
desktop, and mobile checks passed for the visual smoke routes `/` and `/blog/`.
