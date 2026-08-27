# Plan 023 — Release prep, inspector depth, CI action, repo hygiene

**Status: in progress 2026-08-27; npm release item complete.**

## Items

1. **Design-system export formats (question + candidates)** — beyond DTCG/@theme/
   panda/definePreset already shipped: W3C Design Tokens is the hub format; worth
   adding later = **Style Dictionary v4 config/json** (de-facto consumer),
   **Figma Tokens plugin json** ($$format legacy but everywhere), **Tailwind v4
   `@theme` is done**, CSS custom properties flat file (`:root { --x }`), and
   **stylex config (defineVars)**. Each = one importer+exporter pair in
   token-set.ts. Not built this wave unless cheap.
2. **npm release automation — COMPLETE** — changesets, publishable metadata,
   pack smoke/preflight, and provenance workflow are now shipped. A future
   compiled-output build can replace source publishing without changing the
   release gate. Original wording: build step for pandwind (tsdown,
   source-exports today), `files` fields, publish order pandwind → codemod →
   analyze, provenance via OIDC, tag+CHANGELOG flow. PUBLISHING.md §1 becomes
   real. Maintainer approved preparing automation; actual `npm publish` stays
   manual/gated.
3. **Inspector transitive @theme** — follow css `@import`s recursively (relative
   paths + package imports like `shadcn/tailwind.css`) when collecting theme
   tokens; repro at ~/dev/formula.now/packages/geos/src/styles.css.
4. **examples/ folder** — examples/css-example, rn-example, opentui-example move to
   examples/*; workspace globs + test references updated.
5. **Reusable CI analyze action** — composite/action that runs the analyze CLI on
   a PR and comments results (coverage %, missing css, size diff vs base).
6. **Inspector usage analytics** — per-token usage counts, top props,
   prop+value combos, condition frequency (panda-cloud parity).
7. **oxlint plugin as package** — lint/pandwind-extraction.plugin.js → its own
   workspace package (`@pandwind/lint-plugin` or similar) consumable standalone.

## Waves

- W1 (parallel): #4 examples move · #7 lint package · #5 CI action
- W2 (parallel): #3+#6 inspector (one worker) · #2 npm release prep
- Final: gates, commits.
