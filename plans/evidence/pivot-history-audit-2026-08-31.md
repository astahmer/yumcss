# Pivot history audit — 2026-08-31

## Scope and anchors

- Repository: YumCSS source tree
- Audited branch: `main` at `7a6cec646c755073db01006865e782bfe8bbd920`
- JJ operation anchor before the audit checks: `6010af91a8ef`
- Workspaces inspected: `default`, `yumcss-history-cleanup`,
  `yumcss-playground-migration`, and the isolated recovery workspace
  `yumcss-pivot-completion`
- All three workspace working-copy commits were empty. No sibling workspace
  contained uncommitted implementation work.

## Merge inventory

Every two-parent merge reachable from `main` was enumerated with
`parents.len() > 1`. All seven are conflict-free. Six are tree-identical to
their first parent, meaning the first-parent tree was the selected resolution.
The Effect merge intentionally retains a substantial second-parent
implementation delta; that content remains reachable and present in `main`.
The second-parent history and the later tree were checked explicitly rather
than assuming that a conflict-free merge implied content retention.

| Merge commit   | Workspace contribution | Conflict | First-parent tree delta | Audit result                                                          |
| -------------- | ---------------------- | -------- | ----------------------- | --------------------------------------------------------------------- |
| `26afbdb4f4c4` | CSS-in-JS overall      | no       | empty                   | retained                                                              |
| `29819ed3268a` | Effect                 | no       | non-empty               | second-parent implementation retained; later cleanup classified below |
| `5dc524700bae` | Emotion                | no       | empty                   | retained; generated/obsolete files classified below                   |
| `f795e09c58e0` | Astryx                 | no       | empty                   | retained; repeated vendored StyleX cleanup intentional                |
| `470341f2dc96` | codemod                | no       | empty                   | retained; inspector code moved to analyze ownership                   |
| `b1dd0bd5b141` | experiment             | no       | empty                   | retained                                                              |
| `45cce8328daa` | PostHog                | no       | empty                   | retained; repeated vendored StyleX cleanup intentional                |

## Workspace-side deletions

The following deletions were present when comparing each workspace parent to
its merge commit, or when comparing the retained Effect merge to the current
tip. They were checked against the current tree and the owning
architecture/documentation.

### Intentionally removed vendored source

The Effect, Astryx, and PostHog workspace merges removed the checked-out
StyleX documentation source tree. This is correct: external repositories must
not be vendored into YumCSS. The current repository retains the pinned
commit, migration reports, and `scripts/migrate-stylex-docs.ts`; the source is
recreated by `pnpm references:prepare`.

### Intentionally removed generated or obsolete files

- `.prettierignore` was replaced by the repository's Oxfmt/Oxlint policy.
- `apps/playground/src/yumcss.interop.json` is generated output and is
  intentionally removed from source history after codegen runs.
- `examples/migrations/shadcn-ui-docs-migration/README.md` and the StyleX example's
  `Dial.tsx` were later removed as superseded generated/example artifacts;
  their migration reports and reproducible scripts remain available.

### Replaced implementation

The codemod merge removed:

- `apps/inspector/src/server/analytics.ts`
- `apps/inspector/src/server/parsers.ts`

Their responsibilities now live in the analyze package's owned collection
modules. `apps/inspector/src/server/gather.ts` is the intentionally thin
inspector façade and re-exports the analyze implementation. This is an
ownership move, not a lost capability.

### Reintroduced proof documentation

The Emotion merge removed `docs/src/content/docs/interop/emotion-migration.md`
from its workspace parent, but a later history recovery/proof revision
reintroduced it. The current `main` tree contains the document and its pinned
proof instructions.

### Genuine omission recovered

The styled-components merge resolution also omitted two maintained proof
scripts that were present in the workspace parent immediately before the
resolution:

- `scripts/migrate-styled-components-docs.ts`
- `scripts/verify-styled-components-docs.mjs`

These were not obsolete duplicates. Historical commits
`73c932181289` through `78f8877a0eac` used them to materialize the pinned
styled-components documentation site, run static-first `runtime-css` and
`design-css` lanes, and verify browser/SSR parity. The recovery workspace
restores both from parent `df2245c1370fa47c65fac10e5d7fe4c6775660f9` and
restores the corresponding reproducible command in the architecture guide.
The recovery revision also validates their formatting and TypeScript imports;
the playground migration lab exercises the same browser-safe adapter surface.

## Final checks

- All seven merge commits are reachable from `main`.
- `jj log -r '::main & conflicts()'` returned no revisions.
- The styled-components proof omission was corrected in the recovery
  workspace; both restored lanes now materialize and execute their static
  collector against pinned reference commit
  `c03d2925ab44f447b385d2f463fe971de2e15c7c`.
- The recovery workspace has two restored proof scripts, a documentation
  correction, and the parser/runtime fixes needed to make those scripts
  executable. The default workspace's unrelated dirty files were not touched.

The recovery rerun completed both lanes with the same pinned source revision:

| Lane          | Converted | Static | Runtime fallback | Skipped | Static CSS coverage | Output delta |
| ------------- | --------: | -----: | ---------------: | ------: | ------------------: | -----------: |
| `runtime-css` |       140 |     35 |               11 |      30 |              92.14% | +8,471 bytes |
| `design-css`  |       140 |     35 |               11 |      30 |              92.14% | +7,792 bytes |

The positive source-output deltas are expected for this recovery run: the
materializer preserves source imports and runtime fallbacks for unsupported
theme, nested-template, and host-context semantics. Those cases remain
structured residuals; they are not counted as successful static lowering.

## Conclusion

The workspace consolidations preserved the implementation and most proof
assets, but they did drop the styled-components proof runner and verifier.
That omission was explicitly identified and restored from the exact merge
parent. Re-running both lanes exposed and fixed stale parser, import, theme,
selector, keyframe, JSX-host, and collector assumptions; the recovered proof
now completes with explicit residuals rather than broken generated modules.
The remaining deletions are intentional reference-repository de-vendoring,
generated-artifact cleanup, or ownership-preserving decomposition; no other
merge repair was found.
