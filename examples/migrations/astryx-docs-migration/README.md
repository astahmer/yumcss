# Astryx docsite migration corpus

This corpus exercises the pinned Astryx documentation site through three
Pandwind authoring lanes:

- `static-css`: compile-time `createUnsafeCss()` extraction;
- `runtime-css`: the same static-first lane, with runtime CSS enabled only for
  the one dynamic playground binding that cannot be proven static;
- `design-dss`: compile-time `createDesignCss(defaultPreset)` extraction.

The immutable upstream checkout is managed by the reference-repository
workflow at `/Users/astahmer/.references/astryx` and is pinned at:

`8359f1a3601766e3a96ae0805e9487ac3dc17754`

It is deliberately not copied into JJ. JJ versions the migration runner,
adapter behavior, and compact proof summaries; generated Next.js candidates
and screenshots remain disposable artifacts under `/private/tmp` and `/tmp`.

## Reproduce a lane

Run from the Pandwind repository root:

```sh
nub scripts/run-migration-proof.ts run astryx-docs static-css \
	--references-root /Users/astahmer/.references \
	--output-root /private/tmp/pandwind-astryx-repo/apps/docsite \
	--no-prepare

nub scripts/run-migration-proof.ts run astryx-docs runtime-css \
	--references-root /Users/astahmer/.references \
	--output-root /private/tmp/pandwind-astryx-runtime-final/apps/docsite \
	--no-prepare

nub scripts/run-migration-proof.ts run astryx-docs design-dss \
	--references-root /Users/astahmer/.references \
	--output-root /private/tmp/pandwind-astryx-design-final/apps/docsite \
	--no-prepare
```

The migrated output must have a writable copy of the monorepo `packages/`
directory because the docs registry executes source templates from
`packages/cli/assets/templates/pages`. Do not make that directory a symlink to
the immutable reference checkout. Each output is disposable. Build it with
the pinned Astryx dependency installation:

```sh
cd /private/tmp/pandwind-astryx-repo/apps/docsite
/Users/astahmer/.references/astryx/node_modules/.bin/next build --webpack
node /Users/astahmer/dev/pandwind-astryx-migration/scripts/prepare-astryx-production-proof.mjs .
```

Start the baseline and candidate on separate ports, then run:

```sh
node scripts/verify-astryx-docs-browser.mjs \
  http://localhost:4321 \
  http://localhost:4322 \
  /tmp/pandwind-astryx-proof/browser-parity-static-production-final.json
```

The browser matrix covers 12 representative routes at desktop and mobile
viewports (24 comparisons per lane), checks status/DOM shape/body geometry,
console errors, failed requests, and screenshots. Visual equivalence uses the
repository’s explicit 1% differing-pixel budget. The verifier also requires
every migrated route’s linked CSS to be no larger than the baseline and emits
`allAcceptanceCriteriaPassed` so the size gate cannot be missed in a manual
review. Run it once for each output port (`4322`, `4500`, and `4600`) to cover
the static, runtime, and design lanes.

Next 16.3 preview builds with `cacheComponents` currently omit
`.next/prerender-manifest.json` even though `next start` requires it. The
disposable proof setup adds an empty manifest with proof-only preview keys
after a successful build; this is a toolchain workaround, not a source or
runtime change in the migrated app.

## Result

All three lanes build successfully and pass all 24 browser comparisons with
zero new errors, zero failed responses, equal DOM shape, and equal body
heights. The production proof is:

| lane          | static extraction | browser result   | linked CSS delta |
| ------------- | ----------------: | ---------------- | ---------------: |
| `static-css`  |            91.86% | 24/24 equivalent |     −3,253 bytes |
| `runtime-css` |            91.86% | 24/24 equivalent |     −6,824 bytes |
| `design-dss`  |            91.86% | 24/24 equivalent |     −3,253 bytes |

The browser verifier recorded maximum differing-pixel ratios of 0.573% for
static CSS, 0.893% for runtime CSS, and 0.893% for design DSS. Every lane had
zero visual failures, zero shape failures, zero new browser errors, zero
failed responses, `cssWithinBudget: true`, and
`allAcceptanceCriteriaPassed: true`.

The migration scans 981 files and converts 79 call sites. Five files retain
explicit host-bound dynamic style carriers, with their fixed declarations
still statically extracted:

- `src/app/playground/PreviewStage.tsx` — preview width/height;
- `../../packages/cli/assets/templates/pages/dashboard-data/page.tsx`;
- `../../packages/cli/assets/templates/pages/kanban-board/page.tsx`;
- `../../packages/cli/assets/templates/pages/settings-dialog/page.tsx`;
- `../../packages/cli/assets/templates/pages/table-filter/page.tsx`.

These are not residual losses: the migration lowers them to ordinary React
`style` props and reports zero unresolved residuals. The runtime lane keeps
its runtime API available as an explicit fallback, while the static lane
removes the legacy StyleX compiler from migrated application/template code.

The lane-specific migration and browser summaries live in `reports/`.
