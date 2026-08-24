# PUBLISHING.md — deferred internet-facing work

Everything in this file touches the outside world. **Execute only with
maintainer approval** — until then development stays local-only by design.

## 1. npm release

- [ ] Add changesets (`.changeset/config.json`, version bump flow) — packages:
      `pandwind`, `pandwind-codemod`, `pandwind-analyze`.
- [ ] Decide registry strategy: npm (+ provenance via OIDC) vs JSR vs
      pkg.pr.new preview builds for every PR.
- [ ] Verify `exports` map + `files` field per package (007-E hygiene done).
- [ ] Publish order: pandwind → codemod → analyze.
- [ ] Post-release: tag `v0.x.0` on main, CHANGELOG entry.

## 2. Upstream kumo migration PR

- Branch `pandwind-migration` exists in /tmp/pandwind-kumo-dogfood
  (54 files migrated, 1:1 CSS parity verified — see plans/013).
- Steps: fork cloudflare/kumo → push branch → open PR describing the codemod,
  parity harness (`packages/analyze/css-parity-kumo.mts`) and remaining
  verbatim keeps (by-design). Expect review on: import ordering, their lint
  rules, base-ui variant keeps.

## 3. Upstream 8bitcn migration PR

- Same recipe (/tmp/pandwind-8bit-dogfood, branch `pandwind-migration`,
  182 files / 1650 call sites, ±0.18% bytes).

## 4. Devtools empirical checklist

From research.md — before scoping a custom extension:

- [ ] Install "Atomic CSS Devtools" from the Chrome Web Store.
- [ ] Open apps/example dev build; confirm it resolves hashed/named atom
      classes to declarations.
- [ ] Check whether any origin/source-file info is shown (expected: no).
- [ ] If insufficient AND the sourceMappingURL spike (plans/014 §4a) shows
      class origins natively in Chromium Styles pane — reconsider scope.

## 5. CI trend lane

- [ ] Workflow recording cx-bench cold/warm numbers + analyze css budget per
      commit on main into a committed JSONL (e.g. `metrics/history.jsonl`).
- [ ] Render trend graph in the studio History view (reads same JSONL).
- [ ] Optional: post weekly summary to PR bot sticky comment.

## 6. Playground launch

- [ ] Browser build of the engine (see plans discussion: engine is pure TS,
      tailwindcss v4 has @tailwindcss/browser).
- [ ] Static hosting target TBD with maintainer.

## 7. CI annotations wiring

The `analyze --github-annotations` flag already emits workflow commands
(local-only today). To activate: add a lint job step running
`pnpm analyze --github-annotations` against changed files; GitHub renders
::warning lines inline on the diff automatically.
