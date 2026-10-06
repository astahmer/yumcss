# JJ history cleanup recovery point

This record belongs to the history-consolidation operation started on 2026-08-30.

- Recovery operation: `6d5ce0aafbde70713874a73c8ff475002bf5949ddea09d54e7d1f322750257ba1087c0dc40fe661b02c937f011b3349f405dc01b12ffa16d347b7b6b4c5a3903`
- Pre-prune operation: `338a4ff501e2`
- Pre-final-prune operation: `ff92f1f6b161d6714564980283c353777d7b242e5ecbaaf42a6af2c24011bd8aac65d106adf283a9739b0cca2eac8590e2f4a3c115b6ed39939b7552345f3182`
- Final-prune operation: `738469a17ad3c13f3d157814248d4f5a762dc33166b04ee434c54c66b4bccb3f9e53c0ff703784f98cc6bf08894d85f304dc172ab26fcb9f354f2a314401ce7a`
- Last local-prune operation: `b31b374f2a9dd5d359521d01c4d6236f83dd263d6046009940c8d37ddc803c1a9c1e50c4829ac42d9573ce348c406823a7b3157e16a87c484c3b853cad40b8fe`
- Final verification operation before this record: `9ed3e9bfb618f43ee60cab09cfad303eae924f7c3d03b5c490c8438924f884e6f2fe8b0361d9b31d3ca8882f088abb03028b0130c8dcfa721e9dada6e8772469`
- Main-pointer operation: `f59e61083b6c`
- Main before cleanup: `63eefbb7a09ef5f7f83e1d066b0994a32961eb25`
- Candidate consolidated tip before final history edits: `291c3f6f468df41b4c6a13ce473698e37eacd792`
- Default workspace snapshot `a8fc3b459e8be28a49f6a4e29144d15580713ab0` was
  audited and contained only generated bridges, interop metadata, generated
  types, and migration reports; none was needed by `main`. The default
  workspace now has a clean empty `wip` commit directly on `main` at
  `1a305744c8abe6a429e9234c0e70c756e04a5616`.

The consolidated candidate passes `pnpm test:all`: YumCSS, playground,
browser, React Native, OpenTUI, showcase, analyzer, codemod, and inspector
checks are green. The candidate also retains the official-config, Emotion,
PostHog, and Astryx proof evidence; duplicate PostHog replay commits were
proven empty and abandoned during the merge.

The operation-log id is the rollback anchor. Before pruning a revision or
workspace, its tree and logical changes must be proven represented by the
candidate main ancestry. This document is committed only after those checks
pass; it is evidence, not a replacement for the JJ operation log.

The final fixpoint removed the local obsolete workspace heads, including
duplicate migration proofs, intermediate plan revisions, superseded Panda
and CSS-in-JS implementations, old analyzer copies, and generated/WIP
artifacts. The current main tree retains their maintained replacements under
the adapter-owned modules and current proof corpus. The remote
`feat/codemods@origin` plan revision was deliberately left untouched because
remote bookmarks are outside this cleanup's scope.

No remote push or remote bookmark rewrite was performed.
