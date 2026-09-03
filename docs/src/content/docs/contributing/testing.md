---
title: Testing pandwind
description: Run the unit, integration, browser, native, terminal, and coverage checks.
sidebar:
  order: 2
---

Pandwind is tested at several boundaries. A unit test proves a local policy; an
integration test proves package wiring; an end-to-end fixture proves observable
output in a real host. Run the broadest applicable check before changing a
compiler, adapter, backend, or generated artifact.

## The commands

From the repository root:

```sh
nub run test:all
nub run test:coverage
nub run typecheck
nub run lint
nub run format
nub run knip
nub run pivot:proof
nub run test:e2e:playground
nub run --filter pandwind-codemod test:e2e
```

`test:all` runs every workspace test serially. Serial execution is deliberate:
browser servers, generated artifacts, PTYs, and native fixtures should not
compete for the same ports or terminal state.

`test:e2e:playground` generates the Playwright-BDD specs from the `.feature`
files, starts the playground, and checks the migration lab plus editor typing
experience in Chromium.

`test:coverage` runs V8 coverage for the three core packages and fails when a
package falls below its checked-in threshold. Coverage directories are local
artifacts and are ignored by Git.

### Pivot proof matrix

`nub run pivot:proof` is the deterministic offline gate for the migration pivot.
It runs every registered adapter's contract fixture, requires direct and pinned
real-repository evidence for every source adapter, checks per-adapter
capabilities, and validates every promoted browser/SSR/CSS-size claim. The
coverage report is versioned and records production dimensions independently;
fixture-only entries cannot satisfy a promoted adapter claim.

The adapter-reference proof adds an actual Chromium check for every pinned
file-level corpus entry that can run without an upstream application build:

```sh
nub run references:prepare
nub run references:deps
nub run pivot:proof:adapters
```

`references:deps` installs only the explicitly pinned official packages needed
by a reference configuration into the disposable checkout. The resulting
`plans/evidence/adapter-reference-proof.json` records canonical CSS equality,
CSS byte size, computed-style equivalence, hydration-style replacement, and
structured residuals. A residual is a proof failure when the adapter claims
the capability; it is never hidden by falling back to the hand-written token
table.

The full reference run is intentionally separate because it downloads pinned
public repositories and can take substantially longer:

```sh
nub run pivot:proof:references
```

That command materializes `${PANDWIND_REFERENCE_ROOT:-~/.references}`, verifies
every checkout at its exact commit, runs the source corpus, and writes the
generated report to a temporary output path (or to `PANDWIND_PROOF_OUTPUT` if
set). It never vendors upstream source into Pandwind. CI runs this workflow on
schedule and through manual dispatch; the offline gate runs with the regular
suite.

The scheduled pivot-proof workflow also runs the installed Goober and Emotion
promotion lanes. Installed promotion requests declare their proof dimensions
explicitly; the runner rejects an empty or incomplete declaration instead of
turning a source-only result into a production claim.

`nub run references:check` audits already-materialized checkouts and exits
non-zero if any pinned commit drifts or is unavailable. `nub run knip:production`
is the ownership gate for public subpaths and dynamic entry points.

## What each layer covers

### Unit and type tests

`packages/pandwind/tests` covers `tw()`, `css()`, `cx()`, design resolution,
tokens, conditions, recipes, CSS ordering, runtime sheets, SSR, object
backends, host adapters, codegen, and type-level contracts. The codemod and
analyzer packages have analogous unit/fixture suites.

Run a focused package or file while developing:

```sh
nub run --filter pandwind test
nub run --filter pandwind-codemod test
nub run --filter pandwind-analyze test
nub exec --cwd packages/pandwind vitest run tests/css-output.test.ts
```

### Integration tests

Integration tests build or execute real package boundaries: Vite and unplugin
transforms, generated Tailwind consumers, codemod CLI reports, analyzer
collection, inspector gathering, and playground evaluation. These tests catch
source-loader and module-resolution failures that isolated unit tests miss.

The codemod integration matrix in
`packages/codemod/tests/adapter-migration-matrix.test.ts` exercises every
registered adapter in both directions: each source lowers to Pandwind, and a
representative Pandwind program emits to every registered target. It also
asserts explicit evidence for dynamic values and composes the real
Chakra-to-Tailwind and Tailwind-dialect-to-Chakra routes. This is deliberately
separate from the adapter contract fixture: the contract checks one adapter's
ports, while the matrix checks route composition. The complete Cartesian gate
in `packages/codemod/tests/adapter-matrix-contract.test.ts` invokes every
registered source/target pair in safe and partial modes for happy, edge, and
malformed fixtures (`N × N × 2 × 3` cases, where `N` is read from the
registry). The flat `SwapIR` path remains separately covered as the cheap
compatibility projection. Every case requires conversion or structured
residual evidence; a skipped route may never be silent.

The binary-level matrix in
`packages/codemod/tests/adapter-cli-e2e.test.ts` spawns the real CLI for every
registered adapter in both `adapter → Pandwind` and `Pandwind → adapter`
directions, writes temporary source files, parses JSON reports, and checks that
source-preserving skips carry typed residual markers. Run it alone with:

```sh
nub run --filter pandwind-codemod test:e2e
```

This CLI/temp-directory matrix is CI-only. The command is intentionally skipped
on local runs unless both `CI=true` and `PANDWIND_CLI_MATRIX_E2E=1` are set, so
routine local adapter work does not create `.tmp-codemod-e2e-*` or
`.tmp-codemod-full-matrix-*` directories. CI invokes the package script with
the opt-in flag and therefore retains the real CLI proof.

`packages/codemod/tests/adapter-cli-full-matrix.test.ts` adds the production
CLI smoke gate for every ordered happy route in the registered catalog. It runs
as part of `test:e2e` (and is kept out of V8 coverage because it launches the
CLI once per route). The direct conformance suite also invokes
each adapter-owned dynamic and host-policy hook, so coverage cannot be
provided only by the shared adapter runtime. `test:coverage` enforces at least
50% lines and 30% branches for every registered adapter file in addition to
the package-wide thresholds.

### End-to-end tests

The recursive test command includes:

- CSS/browser hydration and computed-style checks;
- React Native example output and interaction;
- OpenTUI headless rendering plus PTY boot/teardown;
- showcase web/native/TUI parity; and
- inspector/playground host applications.

When changing a host adapter or backend, run the matching example directly as
well as `nub run test:all`.

The Playwright-BDD migration lab adds browser coverage for every registered
source and target selector. Its feature scenarios prove that the browser
composition root exposes the same adapter registry as the migration use case;
the residual scenario keeps non-happy behavior visible to users.

## Coverage interpretation

Current measured package baselines are:

| Package            | Statements | Branches | Functions |  Lines |
| ------------------ | ---------: | -------: | --------: | -----: |
| `pandwind`         |     87.38% |   75.59% |    87.22% | 89.79% |
| `pandwind-codemod` |     76.08% |   63.85% |    85.32% | 79.18% |
| `pandwind-analyze` |     74.13% |   60.70% |    74.87% | 75.18% |

These are regression floors, not a claim that every branch is equally
valuable. CLI process entrypoints, source-language edge adapters, generated
writers, and environment-specific artifact inspection may have lower local
coverage because they are exercised by integration or browser fixtures.

When coverage reveals a gap, classify it first:

1. add a focused unit test for a deterministic policy;
2. add an integration fixture for package/build wiring;
3. add a browser/native/PTY fixture for observable host behavior; or
4. document an intentional environment boundary and keep a smoke test.

Do not lower a threshold to hide a missing semantic test. Update
`plans/017-test-coverage.md` when a claim-level test is added or its proof
shape changes.
