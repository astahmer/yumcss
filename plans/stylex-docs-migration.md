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
- `utility-tw`: declarations lower through the generated Pandwind `tw` bridge.
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
