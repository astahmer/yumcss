# Research: Atomic CSS Devtools & utility-CSS browser inspection (vs. building custom devtools for pandwind)

**IMPORTANT — verification caveat:** This brief was produced WITHOUT live web access
(no `web_search` tool available this run), from training-data knowledge only, per
supervisor decision. Every claim carries a confidence tag:
[HIGH] = well-established, would survive fact-check; [MED] = believed correct but
verify before acting; [LOW] = plausible but could be wrong or outdated.
Install-base numbers and current maintenance/activity status are deliberately OMITTED
rather than guessed — they must come from the empirical checklist below.

## Summary

No browser extension — including Atomic CSS Devtools — can reliably give pandwind what its
custom tooling already provides, because the two things pandwind cares about most
(source-file origin mapping and build-level coverage/budget reports) are fundamentally
build-time data that a generic extension cannot reconstruct from shipped CSS alone [HIGH,
as a structural argument]. For in-browser inspection of _computed_ styles, matched rules,
media queries and cascade layers, the browser DevTools Styles pane already covers ~90% of
the need for both Tailwind-style readable class names AND hashed atomic class names [HIGH];
the residual gap an extension can fill is ergonomics (resolving hashed classes back to
declarations quickly, filtering noise). Verdict: **partial coverage; do not build a custom
browser extension yet — run the empirical checklist against Atomic CSS Devtools first, and
if gaps remain, prefer cheap alternatives (CSS source maps, a debug route/page) over a
full extension.**

## Findings

1. **What Atomic CSS Devtools is (best understanding)** — a browser (Chrome Web Store)
   extension aimed at utility/atomic-CSS workflows. Its core value proposition, as
   understood, is: when you select an element in DevTools, it collects the element's
   classes, matches them against all stylesheet rules, and presents the resulting atomic
   declarations grouped per element (a "Tailwind-like" styles summary) instead of a long
   flat list of one-declaration `.` rules. [LOW–MED on exact feature set — I cannot
   confirm the specific panels (specificity view, media-query grouping, variant filters),
   the author, whether it's open source, or its current version/changelog. Verify via the
   checklist.]

2. **Generic vs library-instrumented** — structurally, any extension that works by
   scanning `document.styleSheets` and matching class attributes works GENERICALLY on any
   class-name-based atomic CSS (Tailwind, UnoCSS, Panda, StyleX compiled output,
   pandwind's hashed `css()` output alike): the CSSOM is library-agnostic [HIGH as a
   mechanism]. Extensions that instead pattern-match _readable_ utility names (parse
   `hover:bg-gray-50` into structured props) only work for convention-named frameworks
   and degrade silently on hashed names [HIGH as a mechanism; MED on which mode this
   particular extension uses — unknown]. No extension can get semantic info out of a
   hashed class name without either a runtime registry injected by the library or a
   shipped manifest/sourcemap [HIGH].

   Known library-specific counterparts (for context):
   - **UnoCSS**: ships an inspector UI (`@unocss/inspector`, served by the Vite plugin in
     dev, e.g. `/__unocss`) that DOES show per-file usage and generated-rule origins —
     because it runs inside the dev server, not the browser [MED–HIGH].
   - **Panda CSS**: no known browser extension; ecosystem leans on the VS Code extension
     and CLI/Studio-style tooling [MED].
   - **StyleX**: no established browser devtools; debugging is via sourcemaps from the
     compiled output [MED].
   - **Tailwind**: third-party paid "DevTools for Tailwind CSS"-style Chrome extensions
     exist that add visual editing of utility classes; official tooling is editor-side
     IntelliSense only [MED on the paid extension's identity/features].

3. **Plain Tailwind v4 output** — v4 emits ordinary static CSS (utilities inside
   `@layer utilities`, heavy use of CSS custom properties via `@theme`). Any
   stylesheet-scanning extension handles this fine mechanically [HIGH]; so does built-in
   DevTools, which since ~2023 renders cascade layers and `var()` resolution directly in
   the Styles pane [MED–HIGH]. Readable class names mean even name-parsing extensions
   work. Verdict: nothing an extension adds here is decisive.

4. **Arbitrary hashed/named atomic class names (pandwind `css()` mode)** — a
   stylesheet-matching extension CAN still show which declaration each hashed class maps
   to (it reads the rule from the CSSOM, not the name) [HIGH as mechanism]. What it CANNOT
   do without extra metadata: tell you the class came from `css({ bg: "red.500" })` in
   `Card.tsx` vs a preset recipe, nor group by call-site [HIGH]. Whether Atomic CSS
   Devtools specifically behaves this way is unverified [LOW] — the checklist covers it.

5. **Source-file origin mapping** — no generic browser extension can show WHICH SOURCE
   FILE produced a rule unless the stylesheet carries `/*# sourceMappingURL=... */` (and
   the browser surfaces the mapped original file; Chromium's Styles-pane support for CSS
   source maps has been inconsistent across versions [MED]) or the extension understands
   a bespoke convention — e.g. pandwind's proposed origin-manifest comment. A custom
   comment format will simply be ignored by every off-the-shelf extension [HIGH]. This is
   the single clearest gap between what pandwind already has (build-time origin manifest +
   analyze CLI) and anything purchasable/installable today.

6. **Maintenance / activity / install base / browser coverage** — NOT ANSWERED. No
   verifiable data available this run; omitted per supervisor instruction. Required inputs
   for the decision: last-updated date on Chrome Web Store listing, user count, GitHub
   repo existence + commit/recency, Firefox port or lack thereof. All obtainable in <10
   minutes via the checklist.

## Coverage verdict for pandwind

Covered by existing options (no need to build):

- Per-element resolved declarations for hashed atomic classes → built-in DevTools Styles
  pane already does this; extension at best improves ergonomics.
- Media queries / conditions / layers → built-in DevTools (layer badges, @media display).
- Plain-Tailwind-mode debugging → fully covered by built-ins.

NOT covered by any generic extension (pandwind-specific gaps):

- Source-file origin per rule in-browser (needs our manifest consumed by custom code).
- Fold-coverage / CSS-budget / missing-css reporting surfaced while browsing (that's
  build-time; belongs in CI + optionally a dev-server debug page, not a browser extension).
- Mapping a rendered element back to the `tw()` / `css()` call site (would need a
  dev-mode data attribute or sourcemap-style mapping we'd have to invent).

## How to verify empirically (~15 min, do this before deciding anything)

1. Open the Chrome Web Store listing for "Atomic CSS Devtools"; record: last updated,
   users, version, permissions requested, developer/link to repo. Search GitHub for the
   repo; check commits/issues recency. (This answers Q4 definitively.)
2. Install in Chrome; also check firefox.addons for a Firefox port.
3. Build any pandwind demo app twice: (a) `tw()` adapter mode (readable Tailwind classes),
   (b) hashed `css()` mode. Serve the production-ish build (not just dev).
4. In DevTools with the extension active, select elements using: single utilities,
   variants (`sm:` / `hover:`), arbitrary values, and hashed `css()` classes. Record:
   - Does it list matched rules per class for HASHED names? (answers Q2/genericness)
   - Does it show media/variant grouping or just flat declarations?
   - Does it show specificity or cascade-order conflict resolution?
   - Does it show any origin/source-file info anywhere? (expected: no — answers Q3)
5. Repeat the same selections with ONLY built-in DevTools (extension disabled) and note
   what the extension actually added. If the delta is small → strong signal not to build.
6. Optional 30-min spike if origin-in-browser matters: add
   `/*# sourceMappingURL=pandwind.css.map */` emission with a source map whose sources are
   the originating `.tsx` files, open in Chromium, see whether the Styles pane surfaces
   original files. If yes, origin mapping is achievable with ZERO custom extension work.
7. Decision gate: only if steps 4–6 show a real ergonomic hole worth closing AND the
   extension is unmaintained/incompatible should a custom extension be scoped — and then
   scope it around consuming the existing origin manifest, not re-deriving origins.

## Sources

Kept (canonical entry points to verify claims above — contents NOT re-verified this run):

- Chrome Web Store — search "Atomic CSS Devtools"
  (https://chromewebstore.google.com/) — authoritative for activity/user counts.
- MDN CSSOM / document.styleSheets (https://developer.mozilla.org/docs/Web/API/Document/styleSheets)
  — basis for the "stylesheet-scanning = framework-agnostic" mechanism claim.
- Chrome DevTools docs, CSS features incl. cascade layers & var() viewing
  (https://developer.chrome.com/docs/devtools/css) — built-in coverage claims.
- UnoCSS dev tooling / inspector (https://unocss.dev/) — example of dev-server-side
  origin-aware inspection done right.
- Sourcemaps spec (https://source-map.github.io/source-map-spec/) +
  https://developer.mozilla.org/docs/Tools/Style_Editor (Firefox CSS source-map history)
  — for the sourceMappingURL spike.

Dropped: none fetched (no web access); everything above is cited as verify-later pointers,
not evidence.

## Gaps

Unanswered and requiring the empirical pass: exact feature matrix of Atomic CSS
Devtools (panels, specificity view, media-query handling); whether it pattern-parses
