# Effect website: `tw` migration proof

This record covers the static-first `tw({...})` lane for the pinned Effect
website corpus.

- Reference: `Effect-TS/website`
- Source subtree: `apps/web`
- Reference commit: `366419b44eb2bd353cbe3d3e41fa4e8c735e63ee`
- Source files scanned: 716
- Files rewritten: 127
- Converted call sites: 2,053
- Explicit residuals: 1,065

Residuals are preserved source tokens with a structured reason; they are not
silently dropped. The unchanged Tailwind vocabulary remains in the generated
stylesheet so unsupported or intentionally preserved utilities retain their
original behavior.

## Reproduce

From the YumCSS repository:

```sh
nub scripts/run-migration-proof.ts run effect-docs tw \
	--output-root /tmp/yumcss-effect-tw
cd /tmp/yumcss-effect-tw
pnpm install --no-frozen-lockfile
pnpm exec vp run build
```

The baseline is built from the read-only clone without migration. Compare the
baseline and all lanes with the verification helper from the separate Effect
migration checkout (`EFFECT_MIGRATION_REPO`):

```sh
node "$EFFECT_MIGRATION_REPO/scripts/verify-effect-docs.mjs" \
  /tmp/yumcss-effect-baseline/apps/web/dist/client \
  /tmp/yumcss-effect-tw/apps/web/dist/client \
  /tmp/yumcss-effect-css/apps/web/dist/client \
  /tmp/yumcss-effect-design/apps/web/dist/client \
  /tmp/yumcss-effect-parity.json
```

The proof requires every generated route to respond, no newly introduced
browser errors, matching SSR landmarks/body height, matching desktop/mobile
visual snapshots, and no larger emitted CSS artifact.
