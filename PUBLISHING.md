# PUBLISHING.md — source package release

Everything in this file touches the outside world. **Execute only with
maintainer approval.** Local preflight and pack smoke checks are safe to run;
the registry publish remains an explicit operator action.

## 1. npm release — AUTOMATED (first publish is the only manual step)

Automation in place:

- [x] Changesets: `.changeset/config.json` (independent versioning — the four
      packages move at different speeds; linked for lockstep majors),
      `privatePackages: false` keeps examples out. Add a changeset per PR via
      `pnpm changeset`.
- [x] Registry strategy: npm + OIDC provenance (`id-token: write` in the
      workflow, `--provenance` on publish). Preview builds per PR via
      pkg.pr.new (non-blocking `preview` job in ci.yml).
- [x] Per-package hygiene: `files` (src/README/LICENSE), `publishConfig`
      (public access + registry + provenance), `engines.node >= 20`,
      repository/keywords/license metadata, `bin` entries for the four
      Tailwind codegen CLIs.
- [x] Source-publishing verified by pack smoke tests:
      `scripts/release/smoke-pack.mjs` packs each package, asserts every
      exports/bin target exists in the tarball, then dynamically imports EVERY
      shipped module (catches deep-relative imports into sibling packages —
      this is why the explicit `pandwind/*` tooling subpath exports exist;
      codemod and analyze must import pandwind through those specifiers, never
      `../../pandwind/src/*` relative paths).
- [x] Publish order enforced in one script: `scripts/release/publish-all.sh`
      (pandwind → lint-plugin → codemod → analyze) after re-running smokes.
- [x] Workflow: `.github/workflows/release.yml` — changesets action opens a
      "Version Packages" PR on main; tagging `v*` runs typecheck+tests,
      publishes with provenance, creates the GitHub release from CHANGELOG.

### First release (manual, once)

```sh
# 1. add NPM_TOKEN (automation token, publish rights for both package scopes)
#    to GitHub -> Settings -> Secrets -> Actions
# 2. merge the "Version Packages" PR that changesets opened
# 3. tag and push — CI does the rest:
git tag v0.1.0 && git push origin v0.1.0
# 4. verify: npm view pandwind / npm view pandwind-codemod
```

Subsequent releases: open PRs with changesets, merge the auto-updated Version
Packages PR, tag the new version. Nothing else.

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
