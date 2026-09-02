---
title: Emotion migration proof
description: A real-site, static-first migration proof for the Emotion adapter.
sidebar:
  order: 3
---

This proof exercises Pandwind against the pinned documentation site in the
[Emotion repository](https://github.com/emotion-js/emotion), rather than a
synthetic fixture. The source is pinned to commit
`b882bcba85132554992e4bd49e94c95939bbf810` and the migrated app is built from
the repository's `site` project.

## What is migrated

The migration uses the `emotion → pandwind` codemod lane and emits static
`css()` output wherever the source is safely extractable. A file that still
needs runtime Emotion semantics is retained as a runtime island, along with
its local dependency closure. This prevents an extracted class from being
passed to an Emotion component that expects a style object and prevents
duplicate global rules.

The pinned site currently converts 3 call sites in 2 files with 0 residuals.
The live editor and the components it imports remain runtime islands because
they intentionally compile arbitrary user-authored code at runtime. This is
the correct static-first boundary for this corpus; it is not a claim that
every possible Emotion expression is statically extractable.

## Acceptance matrix

| Check                    |               Result |
| ------------------------ | -------------------: |
| Static routes compared   |              41 / 41 |
| Next.js pages generated  |                   42 |
| Migration residuals      |                    0 |
| Hydration failures       |                    0 |
| Candidate browser errors |                    0 |
| CSS byte delta per route |   -110 to -174 bytes |
| Maximum screenshot delta |               0.137% |
| Body text and geometry   | Equal on every route |

The CSS comparison includes linked and inline CSS. Screenshots use the same
1440px viewport and deterministic browser contexts. External resources are
blocked or normalized in both fixtures: third-party Carbon Ads are replaced by
the same hidden layout slot and external images retain their layout boxes but
do not contribute nondeterministic pixels. Local HTML, CSS, geometry, and
hydration behavior remain part of the comparison.

## Reproduce it

From the Pandwind checkout:

```sh
nub scripts/migrate-emotion-site.ts /tmp/pandwind-emotion-site-candidate
```

Build the candidate app:

```sh
cd /tmp/pandwind-emotion-site-candidate/site
nub run build
```

Run the route, CSS-size, screenshot, and hydration proof:

```sh
cd /path/to/pandwind
node scripts/verify-emotion-site.mjs \
  /Users/astahmer/.references/emotion-clean/site/out \
  /tmp/pandwind-emotion-site-candidate/site/out \
  /tmp/pandwind-emotion-browser-report.json
```

The verifier fails on HTTP errors, browser errors, visible-text changes,
geometry changes, CSS growth, hydration errors, or screenshot deltas above the
documented antialiasing bound. The candidate build also typechecks and exports
all static pages. The preserved live editor may emit expected bundler warnings
for its dynamic Babel dependencies; those warnings are confined to the
runtime fallback and are not migration residuals.

## Fixes proven by this corpus

This real project exposed and now covers several adapter requirements:

- project-aware Emotion detection from JSX `css` props and configuration;
- static values imported through local files and re-export barrels;
- dotted imported values such as theme colors and media queries;
- nested selector objects and Emotion `Global` handling;
- semicolon-free source import removal without corrupting adjacent imports;
- duplicate runtime/static import avoidance;
- exact reference dependency pinning so the baseline and candidate compare the
  same application, not dependency drift.

The reference checkout and its commit are recorded in the repository's
`reference-repos.md`. The materializer is
`scripts/migrate-emotion-site.ts`, and the independent browser verifier is
`scripts/verify-emotion-site.mjs`.
