# StyleX docs migration acceptance

This plan records the executable proof for migrating the StyleX documentation
application from `@stylexjs/stylex` to Pandwind. The source is the pinned
reference clone in `reference-repos.md`; the reference checkout remains
read-only.

## Lanes

Each lane is an independent JJ revision rooted at the same source snapshot:

- `runtime-css`: semantic StyleX rules become Pandwind `css.group`/`css.props`
  runtime styles.
- `atomic-css`: static rules become Pandwind `css.class` values composed with
  `cx`.
- `utility-tw`: reserved for a utility/token corpus. It is not claimed for
  this app because arbitrary StyleX declarations have no lossless `tw`
  equivalent without expanding the frozen public API; the current executable
  docs lanes are `runtime-css`, `atomic-css`, and `design-dss`.
- `design-dss`: declarations lower through `createDesignCss` and the `dss`
  vocabulary where the design preset can represent them.

## Proof requirements

For every lane the harness must report:

1. all source files scanned and all detected style sites;
2. zero unsafe partial rewrites;
3. no residuals for the selected corpus, or an explicit source-preserving
   blocker for semantics the target API cannot represent;
4. generated CSS canonical-equivalence or a smaller canonical artifact;
5. build/typecheck success for the migrated fixture;
6. browser screenshots and DOM/style probes for the representative home,
   docs, and interactive playground routes.

“Perfect” means the result passes all six checks. A dry codemod report alone is
not equivalence proof.

## Current evidence

The pinned clone was built from a clean `dist/` four times: the original
StyleX app and the `runtime-css`, `atomic-css`, and `design-dss` Pandwind lanes
all completed production build plus four-page static generation. The results
are recorded in `examples/stylex-docs-migration/reports/build-matrix.json`.

The browser probe is currently blocked by the pinned Waku app's own RSC
development/standalone server route (`/RSC/R/_root.txt` returns 404 in the
clone, while build and static generation succeed). Do not treat that
environment failure as visual parity evidence; rerun the same probe when the
reference app's Waku runtime is fixed.
