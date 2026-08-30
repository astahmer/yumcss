# JJ history cleanup recovery point

This record belongs to the history-consolidation operation started on 2026-08-30.

- Recovery operation: `6d5ce0aafbde70713874a73c8ff475002bf5949ddea09d54e7d1f322750257ba1087c0dc40fe661b02c937f011b3349f405dc01b12ffa16d347b7b6b4c5a3903`
- Pre-prune operation: `338a4ff501e2`
- Main before cleanup: `63eefbb7a09ef5f7f83e1d066b0994a32961eb25`
- Candidate consolidated tip before final history edits: `291c3f6f468df41b4c6a13ce473698e37eacd792`
- Default workspace was intentionally preserved with uncommitted generated-file changes.

The consolidated candidate passes `pnpm test:all`: Pandwind, playground,
browser, React Native, OpenTUI, showcase, analyzer, codemod, and inspector
checks are green. The candidate also retains the official-config, Emotion,
PostHog, and Astryx proof evidence; duplicate PostHog replay commits were
proven empty and abandoned during the merge.

The operation-log id is the rollback anchor. Before pruning a revision or
workspace, its tree and logical changes must be proven represented by the
candidate main ancestry. This document is committed only after those checks
pass; it is evidence, not a replacement for the JJ operation log.
