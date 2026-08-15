# Plan 006 — CI wiring + fresh size/bench numbers

## Goal
1. The runtime-size gate currently rides on local `pnpm test`; wire CI so regressions
   are caught on push/PR.
2. Refresh SIZE.md / BENCH.md so committed numbers match reality on this machine.

## Approach
### CI
1. Repo has no `.github/` yet. Create GitHub Actions workflow(s):
   - trigger: push to main + PRs;
   - single job (repo is small): pnpm setup w/ cache, `pnpm install --frozen-lockfile`,
     then the full gate exactly as documented: `pnpm --filter pandwind run test`
     (includes the three-layer size gate), `typecheck`, `test:types` (tstyche),
     lint + format check (oxlint/oxfmt — mirror whatever scripts exist at root).
   - Node version: match what the repo targets (check package.json engines / example
     app); use pnpm version from `packageManager` field if present.
2. Keep the workflow boring and readable; no matrices unless genuinely needed.

### Fresh numbers
3. Run the bench suite (see BENCH.md methodology header) and update BENCH.md tables
   if drifted; run `pnpm test:size -u` ONLY if the snapshot drifted beyond tolerance,
   and explain any intentional delta in the revision description.
4. SIZE.md/BENCH.md prose stays accurate (scripts names, commands).

## Files (territory)
- `.github/workflows/*` (new), `BENCH.md`, `SIZE.md`, maybe root `package.json`
  (only if a missing script forces it — prefer no changes)

## Gates
- Act locally as CI would: run the exact workflow steps by hand and show them green.
- Do not touch `packages/pandwind/src/**` — other agents own that territory.

## jj discipline
Work only inside your workspace dir. Split/describe logical revisions (ci feat /
docs chore separately). Never touch `/Users/astahmer/dev/pandwind`.
