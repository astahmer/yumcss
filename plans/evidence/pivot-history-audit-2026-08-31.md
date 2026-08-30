# Pivot history audit — 2026-08-31

## Scope and anchors

- Repository: `/Users/astahmer/dev/pandwind`
- Audited branch: `main` at `4e6bf39b63a60e513daeb4a5b2098195d65d8f37`
- JJ operation anchor before the audit checks: `3367589c3b65`
- Workspaces inspected: `default`, `pandwind-history-cleanup`,
  `pandwind-playground-migration`
- All three workspace working-copy commits were empty. No sibling workspace
  contained uncommitted implementation work.

## Merge inventory

Every two-parent merge reachable from `main` was enumerated with
`parents.len() > 1`. All seven are conflict-free. In each case, the merge tree
is identical to the first parent (`jj diff --from <first-parent> --to <merge>`
is empty), so the first-parent tree was the selected resolution. The second
parent's history remains reachable through the merge; its content was checked
against the selected tree and later replacement revisions rather than assumed
to have been applied automatically.

| Merge commit | Workspace contribution | Conflict | First-parent tree delta | Audit result |
|--------------|------------------------|----------|-------------------------|--------------|
| `38fb0efaea0e` | CSS-in-JS overall | no | empty | retained |
| `25955257bd62` | Effect | no | empty | retained; vendored StyleX source intentionally removed |
| `d5db4e4dbc18` | Emotion | no | empty | retained; generated/obsolete files classified below |
| `1137a46b2c1f` | Astryx | no | empty | retained; repeated vendored StyleX cleanup intentional |
| `b2abc2a58e2b` | codemod | no | empty | retained; inspector code moved to analyze ownership |
| `b4e8f9ee60d8` | experiment | no | empty | retained |
| `f04c1901f0ba` | PostHog | no | empty | retained; repeated vendored StyleX cleanup intentional |

## Workspace-side deletions

The following deletions were present when comparing each workspace parent to
its merge commit. They were checked against the current tree and the owning
architecture/documentation.

### Intentionally removed vendored source

The Effect, Astryx, and PostHog workspace merges removed the checked-out
StyleX documentation source tree. This is correct: external repositories must
not be vendored into Pandwind. The current repository retains the pinned
commit, migration reports, and `scripts/migrate-stylex-docs.ts`; the source is
recreated by `pnpm references:prepare`.

### Intentionally removed generated or obsolete files

- `.prettierignore` was replaced by the repository's Oxfmt/Oxlint policy.
- `apps/playground/src/pandwind.interop.json` is generated output and is
  intentionally removed from source history after codegen runs.

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

## Final checks

- All seven merge commits are reachable from `main`.
- `jj log -r '::main & conflicts()'` returned no revisions.
- No relevant deletion remained unexplained.
- No implementation or proof restoration was necessary.
- The current workspace is clean after recording this audit.

## Conclusion

The prior workspace consolidations did not drop relevant Pandwind behavior.
The deletions are either intentional reference-repository de-vendoring,
generated-artifact cleanup, documented proof recovery, or ownership-preserving
decomposition. No merge repair is required.
