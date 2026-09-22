# Plan 018 — Studio UX review (2026-08-23)

**Status: Complete (2026-09-22).** The filter blocker, Inspector navigation,
accessibility, responsive layout, stats presentation, recovery states, and
coverage/export surfaces are shipped. These remain presentation features, not
migration-correctness or adapter-extensibility dependencies.

Full UI/UX review of apps/inspector. Ordered by impact; effort S/M/L.

## Fixed during this review

- **Filter input dead** (blocker): ColorSwatches (colors/semantic) and
  weights/families/lh/tracking rendered unfiltered; query state existed but
  was never threaded. Fixed via lib/filter.ts (makeTextMatcher/filterNamed,
  unit-tested); verified with playwright (no-match empties all sections).

## Completed during this review

- **URL state** — tabs, design sections, and the `q` filter survive refresh and
  support deep links through the hash/query state helpers.
- **Filtered section visibility** — zero-match sections and section-nav links
  are omitted; color sections also require at least one renderable swatch.
- **Search ergonomics** — clear control, `/` shortcut, `type=search`, labels,
  keyboard metadata, and a live match count are present.
- **Copy feedback** — copy buttons and color swatches expose labels, focus
  styles, and short-lived copied state.
- **Loading and recovery** — initial skeletons, refresh status, and retry hints
  cover the main, history, trend, and prune-changeset requests.
- **Tables and navigation** — sortable/announced per-file columns, sticky
  headers, smooth section navigation, and active-section highlighting.
- **Accessibility** — tabs use the tablist contract and keyboard navigation;
  panels, search, copy controls, exports, and async states have accessible
  names/statuses.
- **Responsive layout** — compact header, horizontal tab scrolling, wrapped
  typography/bar rows, and horizontally scrollable tables are covered below
  the 900px breakpoint.
- **Stats density** — build-time folding and stylesheet budget are grouped,
  with full/partial/runtime file outcome counts.
- **Value coverage** — analyze reports per-file and aggregate token/literal
  percentages plus dynamic-value counts; dynamic values stay outside the
  percentage denominator.
- **CSV export** — the stats export menu includes an optional per-file CSV
  report alongside JSON, Markdown, and HTML.

## Residual / intentionally parked

- Deeper redesign candidates deferred to a dedicated pass once real usage feedback exists.
