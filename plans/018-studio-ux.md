# Plan 018 — Studio UX review (2026-08-23)

**Status: Audited, non-blocking.** The filter blocker and the pivot-relevant
inspector features are shipped. The remaining items below are presentation
polish and are not required for migration correctness or adapter extensibility.

Full UI/UX review of apps/inspector. Ordered by impact; effort S/M/L.

## Fixed during this review

- **Filter input dead** (blocker): ColorSwatches (colors/semantic) and
  weights/families/lh/tracking rendered unfiltered; query state existed but
  was never threaded. Fixed via lib/filter.ts (makeTextMatcher/filterNamed,
  unit-tested); verified with playwright (no-match empties all sections).

## Open improvements

1. **URL state** — tab (#design/#stats) and query lost on refresh; no deep-linking. S.
2. **Hide zero-match sections while filtering** — headings still render for spacing/radii/utilities when nothing matches. S.
3. **Search ergonomics** — no clear (×) button, no "/" focus shortcut, missing aria-label/type=search, no visible match count. S each.
4. **Copy feedback on swatches** — swatch buttons rely on title attr only (CopyButton has ✓ state); add brief copied indication. S.
5. **Loading skeletons** — spinner text only; skeleton cards for cards/table. S/M.
6. **Table ergonomics** — per-file table lacks sort indicators + sticky header for long lists. M.
7. **Section-nav** — anchor jumps without smooth scroll or active-section highlight. S.
8. **Accessibility** — tab buttons lack aria-pressed/role=tablist; copy buttons lack aria-labels; verify focus-visible styles exist in css. S.
9. **Responsive** — grid layouts untested under ~900px; likely overflow. M.
10. **Stats density** — big unsorted table; group by status (all-folded / partial / runtime). M.
11. **Error recovery hint** — error state should suggest "is the dev server running?" alongside retry. S.
12. **Per-file literal-vs-token coverage %** (panda-cloud token-analyzer steal) — needs analyze-side data first. L.

## Residual / intentionally parked

- Items 1-11 above remain optional UX work; later inspector work shipped
  provenance, drill-down, history, export, and reporting surfaces without
  making every polish item a pivot dependency.
- Deeper redesign candidates deferred to a dedicated pass once real usage feedback exists.
