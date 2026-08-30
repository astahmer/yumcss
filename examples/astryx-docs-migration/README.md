# Astryx docsite migration corpus

This corpus exercises the pinned Astryx documentation site through three
Pandwind authoring lanes:

- `static-css`: compile-time `createCss()` extraction;
- `runtime-css`: the same static-first lane, with runtime CSS enabled only for
  the one dynamic playground binding that cannot be proven static;
- `design-dss`: compile-time `createDesignCss(pandwindPreset)` extraction.

The immutable upstream checkout is managed by the reference-repository
workflow at `${PANDWIND_REFERENCE_ROOT:-~/.references}/astryx` and is pinned at:

`8359f1a3601766e3a96ae0805e9487ac3dc17754`

It is deliberately not copied into JJ. JJ versions the migration runner,
adapter behavior, and compact proof summaries; generated Next.js candidates
and screenshots remain disposable artifacts under `/private/tmp` and `/tmp`.

## Reproduce a lane

Run from the Pandwind repository root:

```sh
pnpm run references:prepare

pnpm exec tsx scripts/migrate-astryx-docs.ts static-css \
  "${PANDWIND_REFERENCE_ROOT:-$HOME/.references}/astryx/apps/docsite" \
  /private/tmp/pandwind-astryx-repo/apps/docsite

pnpm exec tsx scripts/migrate-astryx-docs.ts runtime-css \
  "${PANDWIND_REFERENCE_ROOT:-$HOME/.references}/astryx/apps/docsite" \
  /private/tmp/pandwind-astryx-runtime-v1/apps/docsite

pnpm exec tsx scripts/migrate-astryx-docs.ts design-dss \
  "${PANDWIND_REFERENCE_ROOT:-$HOME/.references}/astryx/apps/docsite" \
  /private/tmp/pandwind-astryx-design-v1/apps/docsite
```

Each output is a disposable copy. Build it with the pinned Astryx dependency
installation:

```sh
cd /private/tmp/pandwind-astryx-repo/apps/docsite
"${PANDWIND_REFERENCE_ROOT:-$HOME/.references}/astryx/node_modules/.bin/next" build --webpack
```

Start the baseline and candidate on separate ports, then run:

```sh
node scripts/verify-astryx-docs-browser.mjs \
  http://localhost:4321 \
  http://localhost:4322 \
  /tmp/pandwind-astryx-proof/browser-parity-static-v8.json
```

The browser matrix covers 12 representative routes at desktop and mobile
viewports (24 comparisons per lane), checks status/DOM shape/body geometry,
console errors, failed requests, and screenshots. Visual equivalence uses the
repository’s explicit 1% differing-pixel budget; the recorded maximum is
below that budget for every lane.

## Result

All three lanes build successfully and pass all 24 browser comparisons with
zero new errors, zero failed responses, and equal body heights. The one
residual is intentionally explicit:

`src/app/playground/PreviewStage.tsx` contains a runtime `dynamic` style
carrier whose value depends on browser state. Static styles in that file are
still converted; only that carrier remains on the runtime fallback path.

The strict stylesheet-size condition is not yet green for this corpus:

| lane          | static extraction | browser result   | linked CSS delta |
| ------------- | ----------------: | ---------------- | ---------------: |
| `static-css`  |            98.57% | 24/24 equivalent |     +1,114 bytes |
| `runtime-css` |            98.55% | 24/24 equivalent |       +754 bytes |
| `design-dss`  |            98.57% | 24/24 equivalent |     +1,114 bytes |

The extra bytes are the measured cost of combining Pandwind output for
migrated docsite sources with the unchanged StyleX output emitted by imported
`@astryxdesign/*` packages. They are not treated as “same or smaller”. A
future full-repository migration must either migrate those package sources or
prove a safe cross-adapter atomic-rule reuse strategy before claiming the
strict size gate for Astryx.

The lane-specific migration and browser summaries live in `reports/`.
