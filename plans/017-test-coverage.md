# Plan 017 — Test coverage matrix & sweep (2026-08-23)

## Operational validation (2026-08-28)

The workspace now has executable regression gates:

- `pnpm test:all` runs all workspace unit, integration, browser, native, TUI,
  and PTY suites serially;
- `pnpm test:coverage` runs V8 coverage for Pandwind, codemod, and analyzer;
- package-local Vitest thresholds protect the measured baselines; and
- `coverage/` reports are ignored as generated artifacts.

The current baselines are 86.83% statements / 74.59% branches for Pandwind,
76.82% / 64.51% for codemod, and 74.07% / 61.79% for analyzer. The enforced
floors are intentionally a little below those measurements to detect
regressions without making unrelated coverage noise a release blocker.

Claim-level matrix of meaningful behavior -> asserting test -> status before
this sweep -> action taken. "ok" = already covered; "GAP" = missing before.

## (a) compile / codegen

| claim                                                  | file                                           | before | action                                                                    |
| ------------------------------------------------------ | ---------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| typegen unions incl opacity modifiers/arbitrary escape | tw-typegen.test.ts                             | ok     | —                                                                         |
| typegen determinism vs committed artifacts             | typegen-determinism.test.ts                    | ok     | —                                                                         |
| theme condition combos + skip-loudly                   | tw-theme-codegen.test.ts, theme-scopes.test.ts | ok     | —                                                                         |
| prune-theme keeps referenced/drops rest + real compile | prune-theme.test.ts                            | ok     | —                                                                         |
| bridge generation edge declarations                    | tw-adapter.test.ts, parity suites              | ok     | covered by generated-artifact consumers; direct duplicate fixture omitted |
| theme scope blocks flip utilities; byte-stable default | theme-scopes.test.ts                           | ok     | —                                                                         |

## (b) runtime

| claim                                                                     | file                                                   | before | action |
| ------------------------------------------------------------------------- | ------------------------------------------------------ | ------ | ------ |
| cx variant-scoped conflicts/compose/partial survival/KILLS_ALSO direction | cx.test.ts, cx-fuzz.test.ts, cx-twmerge-parity.test.ts | ok     | —      |
| signature-cache reset (SIGS_CACHE_CAP) changes nothing                    | cx-fuzz.test.ts ("hot vs cold")                        | ok     | —      |
| result-cache registry-generation guard                                    | css-vars/cx tests + fuzz                               | ok     | —      |
| tw() arrays/negatives/compound/nested variants                            | tw-runtime.test.ts, generated-runtime.test.ts          | ok     | —      |
| css() conditions/priority/$input dynamics                                 | css-*.test.ts suite                                    | ok     | —      |
| var-inline atoms + cx style threading + fallback chains                   | css-vars.test.ts (12 cases)                            | ok     | —      |
| named-atoms strategy                                                      | named-atoms.test.ts                                    | ok     | —      |
| stack mapper/fold differential                                            | stack.test.ts                                          | ok     | —      |

## (c) adapter / tailwind parity

css-tw-parity, css-dedup-parity, tw-tailwind-parity, tw-theme-parity,
robustness — strong. Extended only where sweep found holes (none blocking).

## (d) size

runtime-size gate covers css/tw/cx/all/root-barrel variants incl budgets +
snapshot. New public exports (stack, vars) ride the barrel measurement;
per-entry additions unnecessary (barrel equality asserted).

## (e) bench

| claim                                                  | file   | before | action                 |
| ------------------------------------------------------ | ------ | ------ | ---------------------- |
| cx-bench.mts runs, emits all four shapes, sane ops/sec | (NONE) | GAP    | cx-bench-smoke.test.ts |

## (f) types / tstyche

| claim                                    | file                                                     | before | action                       |
| ---------------------------------------- | -------------------------------------------------------- | ------ | ---------------------------- |
| tw/design typings                        | typings.tst.ts, design-typings.tst.ts, cx-typings.tst.ts | ok     | —                            |
| stack / var-inline public typings pinned | public-typings.tst.ts                                    | ok     | dedicated tstyche assertions |

## (g) codemod

| claim                                                           | file                               | before | action           |
| --------------------------------------------------------------- | ---------------------------------- | ------ | ---------------- |
| modes tw/cx/css/keep; --from sources; idempotency; skip markers | codemod.test.ts, sources.test.ts   | ok     | —                |
| context awareness (comments/strings)                            | sources.test.ts (uvsknunw)         | ok     | —                |
| unifiedDiff hunks                                               | cli-diff.test.ts                   | ok     | —                |
| --report completeness math                                      | (none)                             | GAP    | report-math test |
| ensureImport multi-line corruption regression                   | codemod.test.ts (nklnnply lineage) | ok     | —                |

## (h) analyze CLI

| claim                                              | file                | before | action          |
| -------------------------------------------------- | ------------------- | ------ | --------------- |
| --json schema/versioning; human table parity       | cli-json.test.ts    | ok     | —               |
| --css budget lane                                  | css-budget.test.ts  | ok     | —               |
| missing-css warnings                               | missing-css.test.ts | ok     | —               |
| error paths: missing tw config / no matching files | (none)              | GAP    | error-path test |

## (i) vite integration / HMR

| claim                                                 | file                       | before | action                                    |
| ----------------------------------------------------- | -------------------------- | ------ | ----------------------------------------- |
| dev transform, virtual sheet, build asset, tree-shake | vite-integration.test.ts   | ok     | —                                         |
| HMR: changed-file invalidation                        | vite-integration.test.ts   | ok     | —                                         |
| HMR: file added / deleted / renamed                   | vite-integration.test.ts   | ok     | covered by current Vite integration suite |
| invalidate() with unchanged mtime but new content     | vite-integration.test.ts   | ok     | covered by current Vite integration suite |
| splitByRoute chunk intersection                       | css-split-by-route.test.ts | ok     | —                                         |
| unplugin rollup adapters                              | unplugin-rollup.test.ts    | ok     | —                                         |

## Residual gaps (deliberate)

- Bridge generator direct unit test: correctness is proven transitively by
  every typed-mapping test that consumes the generated artifact; a direct
  test would duplicate fixtures. Revisit if bridge bugs appear.
- Direct public type pins for stack/var-inline exports are covered by
  `packages/pandwind/tests/public-typings.tst.ts`.
- Real-browser devtools verification: empirical checklist in research.md is a
  human task (needs a browser).

The public stack, vars, and object-backend type surfaces are now pinned by the
dedicated `*.tst.ts` files under `packages/pandwind/tests`. The remaining items
above are intentionally test-shape or environment follow-ups, not uncovered
pivot behavior.
